# Cloudflare Tunnel setup (tm-ia-worker)

## Goal
Expose `http://localhost:8000` on the VM to the public internet without opening firewall ports.

## Recommended (stable URL)
Create a named Cloudflare Tunnel in the Cloudflare dashboard (Zero Trust) and generate a **Tunnel Token**.
Then on the VM:

```bash
sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/token.txt >/dev/null <<'EOF'
PASTE_TUNNEL_TOKEN_HERE
EOF

sudo tee /etc/systemd/system/cloudflared-tunnel.service >/dev/null <<'EOF'
[Unit]
Description=Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=TUNNEL_TOKEN_FILE=/etc/cloudflared/token.txt
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate run --token $(cat /etc/cloudflared/token.txt)
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-tunnel
sudo systemctl status cloudflared-tunnel --no-pager
```

Then configure the tunnel's public hostname -> service mapping to `http://localhost:8000` in the dashboard.

## Quick (temporary URL, changes on restart)
```bash
cloudflared tunnel --url http://localhost:8000
```

It prints a `trycloudflare.com` URL.
