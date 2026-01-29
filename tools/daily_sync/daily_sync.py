"""Daily Sync

Runs locally (cron/Task Scheduler) to:
1) Fetch selected GCP Cloud Billing SKUs (Compute Engine) and normalize prices.
2) Check Vertex AI Model Garden availability (e.g., Veo/video generation models).
3) (Optional) Upsert results into your database.

Assumptions:
- GOOGLE_APPLICATION_CREDENTIALS is set (or gcloud ADC is configured).
- You have permissions:
  - cloudbilling.services.list / cloudbilling.skus.list
  - aiplatform.models.list (Model Garden / Publisher models)

Usage examples:
  python daily_sync.py --project YOUR_GCP_PROJECT --region us-central1 --out-json out.json
  python daily_sync.py --project YOUR_GCP_PROJECT --region us-central1 --db-url postgresql+psycopg://user:pass@host/db

NOTE: This script avoids web scraping; it uses official google-cloud-* clients only.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import logging
import os
import re
from decimal import Decimal
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

from google.cloud import billing_v1
from google.cloud import aiplatform_v1


# -----------------------------
# Pricing (Cloud Billing Catalog)
# -----------------------------

@dataclasses.dataclass(frozen=True)
class SkuPrice:
    service_display_name: str
    service_name: str
    sku_id: str
    sku_description: str
    region: Optional[str]
    usage_unit: str
    currency: str
    unit_price: Decimal  # price per usage_unit


def _money_to_decimal(money: billing_v1.types.Money) -> Decimal:
    """Convert Money {units, nanos} to Decimal."""
    units = Decimal(money.units or 0)
    nanos = Decimal(money.nanos or 0) / Decimal(1_000_000_000)
    return units + nanos


def list_services(client: billing_v1.CloudCatalogClient) -> List[billing_v1.types.Service]:
    return list(client.list_services())


def find_service_by_display_name(
    services: Iterable[billing_v1.types.Service],
    display_name_regex: str,
) -> billing_v1.types.Service:
    rx = re.compile(display_name_regex, re.IGNORECASE)
    matches = [s for s in services if rx.search(s.display_name or "")]
    if not matches:
        raise RuntimeError(f"No billing service matched regex: {display_name_regex}")
    # Prefer exact "Compute Engine" if present.
    matches.sort(key=lambda s: (0 if (s.display_name or "").lower() == "compute engine" else 1, s.display_name or ""))
    return matches[0]


def iter_skus(
    client: billing_v1.CloudCatalogClient,
    service_name: str,
) -> Iterator[billing_v1.types.Sku]:
    req = billing_v1.ListSkusRequest(parent=service_name)
    yield from client.list_skus(request=req)


def sku_has_region(sku: billing_v1.types.Sku, region: str) -> bool:
    # Most SKU region signals show up in service_regions.
    if sku.service_regions:
        return region in sku.service_regions
    # Fallback: try to infer from description.
    desc = (sku.description or "").lower()
    return region.lower() in desc


def _extract_first_pricing_info(sku: billing_v1.types.Sku) -> Optional[billing_v1.types.PricingInfo]:
    if not sku.pricing_info:
        return None
    return sku.pricing_info[0]


def _pick_rate(
    expr: billing_v1.types.PricingExpression,
    pricing_info: billing_v1.types.PricingInfo,
) -> Optional[Tuple[str, billing_v1.types.Money, str]]:
    """Pick the first tiered rate.

    NOTE: In Cloud Billing Catalog, currency is on PricingInfo (not PricingExpression).
    Return (usage_unit, unit_price, currency_code).
    """
    if not expr.tiered_rates:
        return None
    rate = expr.tiered_rates[0]
    usage_unit = expr.usage_unit or ""
    currency = (pricing_info.currency_conversion_rate or None)  # not currency code
    # PricingInfo doesn't always include a currency code field in this client version.
    # Money is always in the billing account currency (commonly USD).
    currency_code = "USD"
    return usage_unit, rate.unit_price, currency_code


def list_compute_skus_pricing(
    *,
    region: str = "us-central1",
    family_regex: str = r"\bE2\b|\bN1\b",
) -> List[SkuPrice]:
    """List Compute Engine SKUs and normalize their unit prices.

    Notes:
    - The billing catalog is large. We filter by:
      - region
      - a family regex (E2/N1 by default)
    - The unit is whatever Google reports (often "gibibyte hour", "hour", "core hour", etc.).

    Returns prices in USD per usage_unit.
    """

    client = billing_v1.CloudCatalogClient()
    services = list_services(client)
    compute = find_service_by_display_name(services, r"Compute Engine")

    family_rx = re.compile(family_regex, re.IGNORECASE)

    out: List[SkuPrice] = []
    for sku in iter_skus(client, compute.name):
        desc = sku.description or ""
        if not family_rx.search(desc):
            continue
        if not sku_has_region(sku, region):
            continue

        pi = _extract_first_pricing_info(sku)
        if not pi or not pi.pricing_expression:
            continue
        expr = pi.pricing_expression

        picked = _pick_rate(expr, pi)
        if not picked:
            continue

        usage_unit, money, currency = picked
        unit_price = _money_to_decimal(money)

        out.append(
            SkuPrice(
                service_display_name=compute.display_name or "Compute Engine",
                service_name=compute.name,
                sku_id=sku.sku_id or sku.name.split("/")[-1],
                sku_description=desc,
                region=region,
                usage_unit=usage_unit,
                currency=currency,
                unit_price=unit_price,
            )
        )

    # Stable order for diffs
    out.sort(key=lambda p: (p.sku_description, p.usage_unit, str(p.unit_price)))
    return out


# -----------------------------
# Vertex AI availability (Model Garden)
# -----------------------------

@dataclasses.dataclass(frozen=True)
class VertexModelInfo:
    name: str
    display_name: str
    publisher: str
    is_video_related: bool


def check_model_garden_candidates(
    *,
    project: str,
    region: str,
    candidates: List[str],
    include_failures: bool = True,
) -> List[VertexModelInfo]:
    """Check specific Model Garden publisher model IDs for availability.

    The python client currently exposes get_publisher_model() but may not expose
    a list_publisher_models() method depending on version.

    So we do the robust thing for production automation:
    - maintain a small candidate list of known model ids
    - call get_publisher_model for each
    - treat NOT_FOUND/PERMISSION_DENIED as "not available" for this project/region

    candidates should be full resource names like:
      publishers/google/models/veo-2
      publishers/google/models/veo-3
    """

    client = aiplatform_v1.ModelGardenServiceClient(
        client_options={"api_endpoint": f"{region}-aiplatform.googleapis.com"}
    )

    out: List[VertexModelInfo] = []
    for name in candidates:
        try:
            m = client.get_publisher_model(name=name)
            dn = getattr(m, "display_name", "") or ""
            nm = getattr(m, "name", "") or name
            pub = getattr(m, "publisher", "") or ""
            hay = (dn + " " + nm).lower()
            is_video = ("veo" in hay) or ("video" in hay) or ("image-to-video" in hay)
            out.append(VertexModelInfo(name=nm, display_name=dn or nm, publisher=pub or 'google', is_video_related=is_video))
        except Exception as e:
            if not include_failures:
                continue
            msg = str(e)
            # Best-effort classify without depending on grpc types
            code = 'UNKNOWN'
            if 'PERMISSION_DENIED' in msg or '403' in msg:
                code = 'PERMISSION_DENIED'
            elif 'NOT_FOUND' in msg or '404' in msg:
                code = 'NOT_FOUND'
            elif 'UNAVAILABLE' in msg:
                code = 'UNAVAILABLE'

            out.append(
                VertexModelInfo(
                    name=name,
                    display_name=f"{name} [{code}]",
                    publisher='google',
                    is_video_related=True,
                )
            )

    out.sort(key=lambda x: (0 if x.is_video_related else 1, x.display_name.lower(), x.name))
    return out


# -----------------------------
# DB Upsert (optional)
# -----------------------------

def upsert_into_db(db_url: str, prices: List[SkuPrice], models: List[VertexModelInfo]) -> None:
    """Example upsert using SQLAlchemy.

    This is intentionally minimal (portable). You can point db_url to Postgres/MySQL/etc.

    Required dependency: sqlalchemy (+ driver, e.g. psycopg).
    """

    from sqlalchemy import Column, DateTime, String, Text, Numeric, Boolean, create_engine
    from sqlalchemy.orm import declarative_base, Session

    Base = declarative_base()

    class GcpSkuPrice(Base):
        __tablename__ = "gcp_sku_prices"
        sku_id = Column(String(64), primary_key=True)
        region = Column(String(32), primary_key=True)
        usage_unit = Column(String(64), primary_key=True)
        description = Column(Text)
        currency = Column(String(8))
        unit_price = Column(Numeric(20, 10))
        updated_at = Column(DateTime)

    class VertexPublisherModel(Base):
        __tablename__ = "vertex_publisher_models"
        name = Column(String(512), primary_key=True)
        display_name = Column(Text)
        publisher = Column(String(128))
        is_video_related = Column(Boolean)
        updated_at = Column(DateTime)

    engine = create_engine(db_url, pool_pre_ping=True)
    Base.metadata.create_all(engine)

    now = dt.datetime.utcnow()
    with Session(engine) as s:
        for p in prices:
            row = GcpSkuPrice(
                sku_id=p.sku_id,
                region=p.region or "",
                usage_unit=p.usage_unit,
                description=p.sku_description,
                currency=p.currency,
                unit_price=p.unit_price,
                updated_at=now,
            )
            s.merge(row)

        for m in models:
            row = VertexPublisherModel(
                name=m.name,
                display_name=m.display_name,
                publisher=m.publisher,
                is_video_related=m.is_video_related,
                updated_at=now,
            )
            s.merge(row)

        s.commit()


# -----------------------------
# Main
# -----------------------------

def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    ap = argparse.ArgumentParser(description="Daily Sync (Billing + Vertex AI)")
    ap.add_argument("--project", required=True, help="GCP project id")
    ap.add_argument("--region", default="us-central1", help="Vertex region + SKU region filter")
    ap.add_argument("--family", default=r"\bE2\b|\bN1\b", help="Regex to filter Compute SKUs by family")
    ap.add_argument("--out-json", default=None, help="Write collected data to a JSON file")
    ap.add_argument("--db-url", default=None, help="Optional SQLAlchemy DB URL for upsert")
    ap.add_argument("--model-filter", default=None, help="(unused) reserved for future listing support")

    args = ap.parse_args()

    logging.info("Fetching Compute Engine SKUs pricing (region=%s, family=%s)", args.region, args.family)
    prices = list_compute_skus_pricing(region=args.region, family_regex=args.family)
    logging.info("Found %d SKUs (filtered)", len(prices))

    logging.info("Checking Vertex AI Model Garden candidates (project=%s region=%s)", args.project, args.region)
    # Candidate names may change; keep this list small and editable.
    candidates = [
        'publishers/google/models/veo-2',
        'publishers/google/models/veo-3',
        'publishers/google/models/veo-3-fast',
        'publishers/google/models/veo',
    ]
    models = check_model_garden_candidates(project=args.project, region=args.region, candidates=candidates)
    veo = [m for m in models if m.is_video_related]
    logging.info("Found %d available candidate models; %d flagged as video-related (Veo/video)", len(models), len(veo))

    payload: Dict[str, Any] = {
        "ts": dt.datetime.utcnow().isoformat() + "Z",
        "project": args.project,
        "region": args.region,
        "prices": [dataclasses.asdict(p) for p in prices],
        "vertexModels": [dataclasses.asdict(m) for m in models],
        "veoModels": [dataclasses.asdict(m) for m in veo],
    }

    if args.out_json:
        with open(args.out_json, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2, default=str)
        logging.info("Wrote %s", args.out_json)

    if args.db_url:
        logging.info("Upserting into DB")
        upsert_into_db(args.db_url, prices, models)
        logging.info("DB upsert complete")


if __name__ == "__main__":
    main()
