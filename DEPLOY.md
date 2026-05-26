# DEPLOY.md — swistrade.com production deploy runbook

End-to-end deployment guide for the LP platform on a single AlmaLinux 10 VPS
fronted by Cloudflare. Follow top to bottom; do not skip steps. Estimated
time: ~45 minutes if nothing surprises you.

## Target topology

```
                       ┌─────────────────────────────┐
  end users / DIOS ───►│  Cloudflare (orange cloud) │  TLS termination
                       │  swistrade.com / *.swis…   │  WAF + DDoS
                       └─────────────┬───────────────┘
                                     │ TLS to origin (Full strict)
                                     ▼
                       ┌──────────────────────────────┐
                       │  VPS — 147.93.111.13         │
                       │  AlmaLinux 10                │
                       │                              │
                       │  Nginx :80/:443              │
                       │    │                         │
                       │    ├──► :3001  web   (Next)  │
                       │    ├──► :3002  admin (Next)  │
                       │    └──► :3000  api   (Nest)  │
                       │                ▲             │
                       │                │             │
                       │           workers (no port)  │
                       │                              │
                       │  Postgres :5432 (loopback)   │
                       │  Redis    :6379 (loopback)   │
                       └──────────────────────────────┘
```

| Subdomain             | Goes to       | First page                                             |
| --------------------- | ------------- | ------------------------------------------------------ |
| `swistrade.com`       | `:3001` web   | `/login` (unauthenticated visitors land here directly) |
| `admin.swistrade.com` | `:3002` admin | `/login` (same)                                        |
| `api.swistrade.com`   | `:3000` api   | `/health` is public; everything else is auth-gated     |

Postgres and Redis are loopback-only (`127.0.0.1:5432`, `127.0.0.1:6379`). The
public IP can't reach them. SSH tunnel if you need to.

---

## Phase 0 — Things you need before you start

1. SSH key access to the VPS (test: `ssh swistrade@147.93.111.13` must work without a password). If you only have password auth right now:

   ```bash
   # On your laptop:
   ssh-copy-id swistrade@147.93.111.13
   ssh swistrade@147.93.111.13   # confirm key-only login works
   ```

2. Repo accessible from the VPS. Two options:

   - **Option A**: Git remote (GitHub/GitLab/Gitea). Add a read-only deploy key to the VPS and `git clone` in Phase 4.
   - **Option B**: `rsync` from your laptop. See Phase 4.

3. Cloudflare dashboard access for swistrade.com. You will edit DNS and TLS settings in Phase 1.

---

## Phase 1 — Cloudflare DNS (do this first; old project keeps serving until we're ready)

In Cloudflare → swistrade.com → **DNS**, delete the old project's records and create:

| Type  | Name    | Content         | Proxy status |
| ----- | ------- | --------------- | ------------ |
| A     | `@`     | `147.93.111.13` | 🟠 Proxied   |
| A     | `admin` | `147.93.111.13` | 🟠 Proxied   |
| A     | `api`   | `147.93.111.13` | 🟠 Proxied   |
| CNAME | `www`   | `swistrade.com` | 🟠 Proxied   |

All four must be **proxied** (orange cloud) so Cloudflare handles TLS and DDoS.

DNS propagates through CF instantly. The old project will stop serving as soon
as you delete its records, so do this once you're ready to swing.

In Cloudflare → swistrade.com → **SSL/TLS** → **Overview**:

- Set mode to **Full (strict)**. (We'll install a CF Origin Certificate on the VPS in Phase 9.)

In **SSL/TLS** → **Edge Certificates**:

- **Always Use HTTPS** = On
- **Automatic HTTPS Rewrites** = On
- **Minimum TLS Version** = TLS 1.2
- Leave HSTS off for now; turn it on 24 h after a clean deploy.

---

## Phase 2 — SSH in and audit what's currently on the VPS

```bash
ssh swistrade@147.93.111.13
```

Inventory what's there so you don't accidentally nuke something you still need:

```bash
# What's bound to ports 80/443/3000-3002/5432/6379?
sudo ss -tlnp | grep -E ':(80|443|3000|3001|3002|5432|6379)\s'

# What containers exist?
docker ps -a 2>/dev/null || true

# What systemd services look app-related?
sudo systemctl list-units --type=service --state=running | grep -iE '(node|pm2|next|nginx|docker)'

# Any PM2 processes (common on AlmaLinux Node deploys)?
pm2 ls 2>/dev/null || true

# Disk + memory baseline
df -h
free -h
```

If you see anything unfamiliar, stop and figure out what it is before deleting.

---

## Phase 3 — Wipe the old project (after audit)

```bash
# 1. Stop old PM2 processes (skip if PM2 not present)
pm2 delete all 2>/dev/null || true
pm2 save --force 2>/dev/null || true
pm2 unstartup systemd 2>/dev/null || true

# 2. Stop + remove old docker containers
docker compose -f /path/to/old/docker-compose.yml down -v 2>/dev/null || true
docker ps -aq | xargs -r docker stop
docker ps -aq | xargs -r docker rm
docker images -aq | xargs -r docker rmi -f
docker volume prune -f
docker network prune -f
docker system prune -af

# 3. Back up old nginx config, then clear
sudo mkdir -p /etc/nginx/_backup_$(date +%Y%m%d)
sudo mv /etc/nginx/conf.d/*.conf /etc/nginx/_backup_$(date +%Y%m%d)/ 2>/dev/null || true

# 4. Move old code aside (don't delete yet — keep for rollback for 1 week)
sudo mv /home/swistrade/<old-project-dir> /home/swistrade/_old_$(date +%Y%m%d) 2>/dev/null || true

# 5. Verify ports are free
sudo ss -tlnp | grep -E ':(80|443|3000|3001|3002|5432|6379)\s'
# Expected: empty output (or just sshd on :22 which we don't grep here)
```

---

## Phase 4 — Install AlmaLinux 10 prerequisites

```bash
# EPEL + Docker CE repo (CentOS repo works on AlmaLinux 10)
sudo dnf install -y dnf-plugins-core epel-release
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# Docker + compose plugin + git + nginx + fail2ban
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin \
                    docker-compose-plugin git nginx fail2ban

# Node 20 + pnpm (needed on the host for migrations + seed only)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
sudo npm i -g pnpm@10.32.1

# Enable services
sudo systemctl enable --now docker
sudo systemctl enable --now nginx

# Let `swistrade` run docker without sudo
sudo usermod -aG docker swistrade

# Log out + back in so the group change takes effect
exit
ssh swistrade@147.93.111.13

# Verify versions
docker version
docker compose version
node -v        # v20.x
pnpm -v        # 10.32.x
nginx -v
```

### firewalld

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload
sudo firewall-cmd --list-services
# Expected: http https ssh
```

### SELinux (lets Nginx proxy to local backends)

```bash
sudo setsebool -P httpd_can_network_connect 1
sudo setsebool -P httpd_can_network_relay 1
```

---

## Phase 5 — Get the code onto the VPS

### Option A — git

```bash
# On the VPS
cd /home/swistrade
git clone <your-repo-url> swistrade
cd swistrade/Dios_Lp
git log -1   # confirm you're on the commit you intend to deploy
```

### Option B — rsync from your laptop

```bash
# On your LAPTOP, from the repo root
rsync -avz --delete \
  --exclude node_modules --exclude .next --exclude dist --exclude .turbo \
  --exclude .env --exclude '*.tsbuildinfo' \
  ./Dios_Lp/ swistrade@147.93.111.13:/home/swistrade/swistrade/Dios_Lp/
```

Either way, on the VPS:

```bash
cd /home/swistrade/swistrade/Dios_Lp
ls -la   # should see apps/ packages/ infra/ etc.
```

---

## Phase 6 — Generate production secrets

These are the values that the running stack uses to sign cookies / JWTs and to
log into Postgres. **Generate them on the VPS** — do not copy values out of
`.env.production.example` (those are checked into the repo and therefore
public).

```bash
cd /home/swistrade/swistrade/Dios_Lp

# 1. Write apps/api/.env with fresh secrets
node -e "
const c = require('crypto');
const gen = () => c.randomBytes(48).toString('base64url');
const dbPw = gen();
const out = [
  'NODE_ENV=production',
  'PORT=3000',
  'LOG_LEVEL=info',
  '',
  '# Database',
  'DATABASE_URL=postgres://lp_app:' + dbPw + '@postgres:5432/lp',
  'DATABASE_POOL_MAX=20',
  '',
  '# Redis',
  'REDIS_URL=redis://redis:6379',
  '',
  '# Secrets',
  'JWT_SECRET=' + gen(),
  'JWT_EXPIRY=15m',
  'JWT_REFRESH_EXPIRY=7d',
  'COOKIE_SECRET=' + gen(),
  'ADMIN_JWT_SECRET=' + gen(),
  'ADMIN_JWT_EXPIRY=15m',
  'TOTP_ENCRYPTION_KEY=' + gen(),
  'TOTP_ISSUER=Swistrade',
  '',
  '# CORS — fail-closed in prod',
  'CORS_ORIGINS=https://swistrade.com,https://www.swistrade.com,https://admin.swistrade.com',
  '',
  'HMAC_REPLAY_WINDOW_MS=30000',
  'SWAGGER_ENABLED=false',
  'ROUTES_ENABLED=all',
  'ADMIN_REAUTH_WINDOW_SECONDS=300',
  'ADMIN_4EYES_THRESHOLD_PAISE=1000000',
  'ADMIN_IDLE_TIMEOUT_SECONDS=900',
  '',
  '# Stored here so the workers compose can reuse the same DB password',
  '_LP_APP_PW=' + dbPw,
].join('\n');
require('fs').writeFileSync('apps/api/.env', out + '\n', { mode: 0o600 });
console.log('Wrote apps/api/.env');
"

# 2. Copy to workers
cp apps/api/.env apps/workers/.env
chmod 600 apps/workers/.env

# 3. Build root .env for docker-compose (must match what's in apps/api/.env)
node -e "
const c = require('crypto');
const fs = require('fs');
const api = fs.readFileSync('apps/api/.env', 'utf8');
const grab = (k) => api.match(new RegExp('^' + k + '=(.+)\$', 'm'))[1];
const gen = () => c.randomBytes(48).toString('base64url');

const out = [
  '# Root env consumed by docker-compose. KEEP IN SYNC WITH apps/api/.env',
  'POSTGRES_BOOTSTRAP_PW=' + gen(),
  'LP_OWNER_PW=' + gen(),
  'LP_APP_PW=' + grab('_LP_APP_PW'),
  'LP_RO_PW=' + gen(),
  '',
  '# Same secrets the api uses — compose passes these through',
  'JWT_SECRET=' + grab('JWT_SECRET'),
  'COOKIE_SECRET=' + grab('COOKIE_SECRET'),
  'ADMIN_JWT_SECRET=' + grab('ADMIN_JWT_SECRET'),
  'TOTP_ENCRYPTION_KEY=' + grab('TOTP_ENCRYPTION_KEY'),
  'ROUTES_ENABLED=all',
  'CORS_ORIGINS=' + grab('CORS_ORIGINS'),
  'SWAGGER_ENABLED=false',
  '',
  '# Build-time bake for the Next apps (frontend SDKs read NEXT_PUBLIC_API_URL)',
  'NEXT_PUBLIC_API_URL=https://api.swistrade.com',
  'NEXT_PUBLIC_WS_URL=https://api.swistrade.com',
  'NEXT_PUBLIC_ENV=PROD',
  '',
  '# Cosmetic — label shown in users\\\' authenticator apps when they set up TOTP',
  'TOTP_ISSUER=Swistrade',
  '',
  '# Bind ports to loopback only — Nginx is the only ingress',
  'POSTGRES_HOST_PORT=5432',
  'REDIS_HOST_PORT=6379',
].join('\n');
fs.writeFileSync('.env', out + '\n', { mode: 0o600 });
console.log('Wrote root .env');
"

# 4. Lock permissions
chmod 600 .env apps/api/.env apps/workers/.env
ls -la .env apps/api/.env apps/workers/.env

# 5. Stop apps/api/.env from leaking _LP_APP_PW — strip after we've used it
sed -i '/^_LP_APP_PW=/d' apps/api/.env
sed -i '/^_LP_APP_PW=/d' apps/workers/.env
```

**Right now**: copy the JWT_SECRET / COOKIE_SECRET / ADMIN_JWT_SECRET /
TOTP_ENCRYPTION_KEY / LP_APP_PW / LP_OWNER_PW / LP_RO_PW values out of these
files into your password manager. If the VPS dies you cannot recover them.

---

## Phase 7 — Build the Docker images

```bash
cd /home/swistrade/swistrade/Dios_Lp

# Builds api, workers, web, admin images.
# NEXT_PUBLIC_* are picked up from the root .env via compose `build.args`.
# First build is 5–10 minutes; subsequent builds reuse layer cache.
docker compose -f infra/docker/docker-compose.yml \
               -f infra/docker/docker-compose.prod.yml \
               --env-file .env \
               build --pull

# Verify
docker images | grep lp-platform
```

If the build fails, the error will say which app — re-read the compose `build`
block and confirm the Dockerfile path is correct.

---

## Phase 8 — Bring up Postgres + Redis, then migrate + seed

Step-by-step so a migration failure is recoverable:

```bash
cd /home/swistrade/swistrade/Dios_Lp

# 1. Start ONLY postgres + redis
docker compose -f infra/docker/docker-compose.yml \
               -f infra/docker/docker-compose.prod.yml \
               --env-file .env \
               up -d postgres redis

# 2. Wait for both healthy
docker compose -f infra/docker/docker-compose.yml \
               -f infra/docker/docker-compose.prod.yml \
               --env-file .env \
               ps

# 3. Run migrations as the lp_owner role (the DDL owner). Note the migration
#    will REFUSE to run if LP_APP_PW or LP_RO_PW is the placeholder, too
#    short, or empty (B3 fail-closed check).
LP_OWNER_PW=$(grep '^LP_OWNER_PW=' .env | cut -d= -f2)
cd apps/api
DATABASE_URL=postgres://lp_owner:${LP_OWNER_PW}@localhost:5432/lp pnpm db:migrate
cd ../..

# 4. Seed the first super-admin. ADMIN_SEED_PASSWORD must be ≥12 chars; the
#    seed script refuses to run otherwise (B2). SAVE THIS PASSWORD.
ADMIN_SEED_PW=$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))')
echo "========================================================================"
echo "  SUPER-ADMIN BOOTSTRAP PASSWORD — write this down NOW:"
echo "  $ADMIN_SEED_PW"
echo "========================================================================"

LP_OWNER_PW=$(grep '^LP_OWNER_PW=' .env | cut -d= -f2)
DATABASE_URL=postgres://lp_owner:${LP_OWNER_PW}@localhost:5432/lp \
ADMIN_SEED_EMAIL=admin@swistrade.com \
ADMIN_SEED_PASSWORD="$ADMIN_SEED_PW" \
pnpm tsx infra/scripts/seed.ts
```

If the seed script exits with `ADMIN_SEED_PASSWORD env var is required (≥12
chars)` you forgot the export — try again with the env var on the line.

---

## Phase 9 — Bring up api + workers + web + admin

```bash
cd /home/swistrade/swistrade/Dios_Lp

docker compose -f infra/docker/docker-compose.yml \
               -f infra/docker/docker-compose.prod.yml \
               --env-file .env \
               up -d api workers web admin

# Watch all logs for the first 90 seconds — Ctrl-C when each app reports ready
docker compose -f infra/docker/docker-compose.yml \
               -f infra/docker/docker-compose.prod.yml \
               --env-file .env \
               logs -f --tail=80
```

What you're looking for in the api logs:

```
INFO: Nest application successfully started
INFO: { context: 'NestApplication' }
```

If the api **exits** in the first 3 seconds with one of these messages, fix
and retry:

- `CORS_ORIGINS must be explicitly set when NODE_ENV=production` → your root `.env` is missing the variable
- `COOKIE_SECRET must differ from JWT_SECRET` → you reused a secret. Regenerate.
- `... is still set to the .env.example placeholder` → a dev placeholder leaked in. Regenerate the offending secret.
- `JWT_SECRET must be at least 32 characters` → too short.

Local sanity from the VPS:

```bash
curl -s http://localhost:3000/health | jq
curl -sI http://localhost:3001/        # 307 redirect to /login
curl -sI http://localhost:3002/login   # 200
```

---

## Phase 10 — Cloudflare Origin Certificate + Nginx

### 10a. Generate the Origin Certificate

In Cloudflare → swistrade.com → SSL/TLS → **Origin Server** → **Create Certificate**:

- Hostnames: `swistrade.com`, `*.swistrade.com`
- Validity: 15 years
- Click Create

Copy both blocks (the cert and the private key). On the VPS:

```bash
sudo mkdir -p /etc/nginx/ssl

# Paste the certificate block (with -----BEGIN CERTIFICATE----- … -----END CERTIFICATE-----)
sudo tee /etc/nginx/ssl/swistrade.com.pem > /dev/null
# Paste contents, then Ctrl-D

sudo tee /etc/nginx/ssl/swistrade.com.key > /dev/null
# Paste private-key contents, then Ctrl-D

sudo chmod 600 /etc/nginx/ssl/swistrade.com.key
sudo chmod 644 /etc/nginx/ssl/swistrade.com.pem
sudo chown root:root /etc/nginx/ssl/*

# Cloudflare's "Authenticated Origin Pulls" CA — so Nginx can refuse any
# connection not coming from Cloudflare. Defense in depth on top of the
# firewall.
sudo curl -fsSL https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem \
  -o /etc/nginx/ssl/cloudflare-origin-pull.pem
```

In Cloudflare → swistrade.com → SSL/TLS → **Origin Server** → toggle on
**Authenticated Origin Pulls**.

### 10b. Drop in the Nginx config

```bash
sudo tee /etc/nginx/conf.d/swistrade.conf > /dev/null <<'NGINX'
# =============================================================================
# swistrade.com — Nginx reverse proxy fronting api / web / admin containers.
# Cloudflare terminates public TLS; we terminate origin TLS with a CF Origin
# Certificate and require Authenticated Origin Pulls so only Cloudflare can
# reach the VPS on 443.
# =============================================================================

# --- Shared TLS settings + CF real-IP restoration ---
ssl_certificate     /etc/nginx/ssl/swistrade.com.pem;
ssl_certificate_key /etc/nginx/ssl/swistrade.com.key;
ssl_protocols       TLSv1.2 TLSv1.3;
ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;

ssl_client_certificate /etc/nginx/ssl/cloudflare-origin-pull.pem;
ssl_verify_client on;

# Real client IP from CF-Connecting-IP (NOT XFF — CF can be talked through
# proxies, CF-Connecting-IP is what Cloudflare guarantees).
real_ip_header CF-Connecting-IP;
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;

# Block any request not matching a server_name below (direct-IP scans).
server {
  listen 80 default_server;
  listen 443 ssl default_server;
  server_name _;
  return 444;
}

# ---- swistrade.com — broker dashboard (web container) -----------------------
server {
  listen 443 ssl;
  http2 on;
  server_name swistrade.com www.swistrade.com;

  client_max_body_size 1m;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 60s;
  }
}

# ---- admin.swistrade.com — admin console (admin container) ------------------
server {
  listen 443 ssl;
  http2 on;
  server_name admin.swistrade.com;

  client_max_body_size 1m;

  location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 60s;
  }
}

# ---- api.swistrade.com — REST + WebSocket (api container) -------------------
server {
  listen 443 ssl;
  http2 on;
  server_name api.swistrade.com;

  client_max_body_size 1m;

  # Socket.IO long-poll + WS upgrade
  location /ws/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400s;   # long-lived ws
    proxy_send_timeout 86400s;
  }

  # REST
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header Connection "";
    proxy_read_timeout 60s;
  }
}
NGINX

# Test the config and reload
sudo nginx -t
sudo systemctl reload nginx
```

---

## Phase 11 — Smoke tests from outside the VPS

Run these from your laptop, not the VPS:

```bash
# 1. DNS resolves through Cloudflare (NOT the bare VPS IP)
dig swistrade.com +short
dig admin.swistrade.com +short
dig api.swistrade.com +short
# All three should resolve to a Cloudflare IP (104.x or 172.x range), not 147.93.111.13

# 2. TLS handshake works on all three
curl -sI https://swistrade.com/        # 307 redirect to /login expected
curl -sI https://swistrade.com/login   # 200
curl -sI https://admin.swistrade.com/  # 307 redirect to /login expected
curl -sI https://admin.swistrade.com/login   # 200
curl -sI https://api.swistrade.com/health    # 200

# 3. API health through CF
curl -s https://api.swistrade.com/health | jq
# Expect: { "success": true, "data": { "status": "ok", "postgres": "up", "redis": "up", ... } }

# 4. CORS — real origin allowed
curl -i -X OPTIONS https://api.swistrade.com/api/v1/admin/auth/login \
  -H 'Origin: https://admin.swistrade.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
# Expect: 204 + Access-Control-Allow-Origin: https://admin.swistrade.com

# 5. CORS — evil origin rejected
curl -i -X OPTIONS https://api.swistrade.com/api/v1/admin/auth/login \
  -H 'Origin: https://evil.example' \
  -H 'Access-Control-Request-Method: POST'
# Expect: no Access-Control-Allow-Origin header at all

# 6. Throttler — 6th bad login in 60s must be 429
for i in 1 2 3 4 5 6 7; do
  curl -s -o /dev/null -w "$i: %{http_code}\n" -X POST https://api.swistrade.com/api/v1/admin/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"smoke@test.local","password":"intentionally-wrong-pw"}'
done
# Expect: 401 401 401 401 401 429 429

# 7. WebSocket gateway CORS lockdown
curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://evil.example' \
  "https://api.swistrade.com/ws/?EIO=4&transport=polling"
# Expect: 400
```

### 11a. First real admin login (browser)

1. Visit `https://admin.swistrade.com` — you should land directly on `/login`.
2. Email: `admin@swistrade.com`. Password: the `$ADMIN_SEED_PW` you saved in Phase 8.
3. You'll be forced to set up TOTP. Scan with Google Authenticator / Authy / 1Password.
4. After TOTP is verified, **immediately change the super-admin password** to a fresh one (the seed password should be considered burned).

### 11b. First broker user

In the admin UI, create your first broker entity + first broker dashboard
user. The "Create new broker" form will reject any password that doesn't meet
the strength rules (12+ chars, upper, lower, digit, special).

---

## Phase 12 — Lock the VPS down

```bash
# 1. fail2ban for SSH (3 failed attempts = 1 h ban)
sudo systemctl enable --now fail2ban
sudo tee /etc/fail2ban/jail.d/sshd.local > /dev/null <<'CFG'
[sshd]
enabled  = true
port     = ssh
filter   = sshd
maxretry = 3
findtime = 600
bantime  = 3600
CFG
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd

# 2. Key-only SSH (verify your key works BEFORE running this)
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
sudo systemctl reload sshd

# 3. Auto OS security updates
sudo dnf install -y dnf-automatic
sudo sed -i 's/^apply_updates = .*/apply_updates = yes/' /etc/dnf/automatic.conf
sudo systemctl enable --now dnf-automatic.timer

# 4. Verify external surface area
sudo ss -tlnp | grep -v 127.0.0.1
# Expected: only sshd (22), nginx (80, 443). NOTHING ELSE.
```

---

## Day-1 monitoring

Keep one terminal open with logs for the first hour:

```bash
# Errors and warnings only
docker compose -f infra/docker/docker-compose.yml \
               -f infra/docker/docker-compose.prod.yml \
               --env-file .env \
               logs -f api workers | grep -iE '(error|warn|fatal)'

# Nginx access — see real client IPs (via CF-Connecting-IP)
sudo tail -f /var/log/nginx/access.log

# Throttler 429 rate
sudo grep ' 429 ' /var/log/nginx/access.log | wc -l
# If non-zero with real users → see TODO.md OPS-5 (per-broker throttler)

# Disk
df -h /var/lib/docker
```

After 24 h of clean running you can:

- Turn on **HSTS** in Cloudflare → SSL/TLS → Edge Certificates.
- Tighten Cloudflare WAF rules (Bot Fight Mode, security level "High").

---

## Rollback

If a deploy goes wrong:

```bash
cd /home/swistrade/swistrade/Dios_Lp

# Stop the new stack (postgres + redis volumes survive)
docker compose -f infra/docker/docker-compose.yml \
               -f infra/docker/docker-compose.prod.yml \
               --env-file .env \
               down

# Bring back the old project (if you kept it in /home/swistrade/_old_*)
# ... project-specific recovery steps
```

Postgres volume (`postgres-data`) survives `down` and `down -v` only deletes
named volumes when explicitly asked. Don't run `down -v` unless you mean to
delete the database.

---

## Rotating secrets later (operational, not deploy-time)

Database password:

```bash
# 1. Generate a new value
NEW_PW=$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')

# 2. Update root .env
sed -i "s|^LP_APP_PW=.*|LP_APP_PW=${NEW_PW}|" .env

# 3. Update apps/api/.env DATABASE_URL (and apps/workers/.env)
sed -i -E "s|(postgres://lp_app:)[^@]+(@.*)|\1${NEW_PW}\2|" apps/api/.env apps/workers/.env

# 4. Re-run migrations — security migration ALTERs the lp_app role password
LP_OWNER_PW=$(grep '^LP_OWNER_PW=' .env | cut -d= -f2)
cd apps/api && DATABASE_URL=postgres://lp_owner:${LP_OWNER_PW}@localhost:5432/lp pnpm db:migrate && cd ../..

# 5. Restart compose
docker compose -f infra/docker/docker-compose.yml \
               -f infra/docker/docker-compose.prod.yml \
               --env-file .env \
               restart api workers
```

JWT/cookie/admin/TOTP secrets — generate fresh values in `.env` and
`apps/api/.env`, then restart api. All active sessions will be invalidated
(users have to log in again); TOTP secrets re-encrypt on first use.

---

## Known constraints

- **In-memory throttler**: if you scale to multiple api instances, the
  per-IP throttle is per-instance — see TODO.md OPS-6.
- **TimescaleDB compression jobs**: scheduled for chunks >7 days. Verify
  with `SELECT * FROM timescaledb_information.jobs` after the first week.
- **CSRF**: relying on `SameSite=Strict` cookies + 2FA. No CSRF token. ADR
  for that decision is pending — see TODO.md.

---

_Generated as part of the security-hardening sweep.
See [ASSESSMENT.md](../ASSESSMENT.md) and [TODO.md](TODO.md) for context._
