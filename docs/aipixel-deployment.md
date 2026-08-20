# AiPixel domains: production deployment

The Docker stack serves two public sites through Caddy with automatic HTTPS:

| Domain | Service |
|---|---|
| `aipixel.uz` and `www.aipixel.uz` | public sales landing page |
| `ser.aipixel.uz` | authenticated admin dashboard |

## DNS before deployment

At your DNS provider, create these records pointing to the VPS public IPv4 address:

```text
A  @    <VPS_IP>
A  www  <VPS_IP>
A  ser  <VPS_IP>
```

Open inbound TCP ports `80` and `443` in the VPS firewall/provider firewall. Do not expose
Postgres, the API, n8n, or the dashboard container ports directly.

## Production `.env`

Set at least:

```dotenv
NODE_ENV=production
ACME_EMAIL=your-real-email@example.com
DASHBOARD_CORS_ORIGIN=https://ser.aipixel.uz
```

Keep all existing database, JWT, Telegram and provider secrets in that same `.env` file. Never
commit it.

## Start / update

```bash
git pull
docker compose up -d --build
docker compose ps
```

Caddy obtains TLS certificates only after DNS propagation is complete. Check certificate/proxy
logs with `docker compose logs -f caddy`.
