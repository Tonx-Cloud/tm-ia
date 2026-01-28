# Google OAuth automation (future)

## Reality check (Jan 2026)
Google "OAuth Client ID" (the one you create in **Google Cloud Console → APIs & Services → Credentials**) does **not** have a clean, officially supported `gcloud` command to create/update **Web Application** clients (origins + redirect URIs) end‑to‑end.

So for **today**, the fastest and most reliable workflow is:
1) Create/adjust the OAuth Web Client in the Console
2) Store `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Vercel env vars
3) Redeploy

However, we *can* automate everything around it (and make it reproducible) with two approaches below.

---

## Option A (recommended): keep OAuth Client manual, automate validation + deployment
This keeps the current code (direct Google OAuth web-server flow) and removes human error.

### What we automate
- Validate the app is redirecting to the expected `redirect_uri`
- Detect common problems:
  - CR/LF in `client_id` ("%0D%0A")
  - redirect_uri mismatch (wrong path or domain)
- Update Vercel env vars and redeploy

### What remains manual
- Creating/updating the Google OAuth Web Client (Console)

### Script idea
- `scripts/oauth-validate.ps1`: hits `/api/auth/google` and prints the exact `client_id` and `redirect_uri` being used.

---

## Option B: migrate to Google Identity Platform / Firebase Auth
Instead of keeping a classic "OAuth Client Secret" on the backend, use Identity Platform (or Firebase Auth) as the identity provider.

### Pros
- Better automation (Terraform supports Identity Platform resources)
- No need to handle OAuth client secret directly in backend

### Cons
- Requires refactoring auth flow (frontend + backend)

Terraform resources to explore:
- `google_identity_platform_config`
- `google_identity_platform_default_supported_idp_config`

---

## Current required redirect URI for TM-IA
The backend builds this redirect URI:

`https://tm-ia.vercel.app/api/auth/google/callback`

So the Google OAuth Web Client must include:
- Authorized JavaScript origins: `https://tm-ia.vercel.app`
- Authorized redirect URIs: `https://tm-ia.vercel.app/api/auth/google/callback`
