# wmb-admin

Cross-product **Book Platform Admin** — standalone operator application extracted from [gspray/wmb](https://github.com/gspray/wmb) (Issue #348 Phase 4).

```text
wmb-admin  → /admin, operator auth, provider orchestration
wmb        → Pet customer + Pet /api/admin-provider/v1
wmb-career → Career customer + Career /api/admin-provider/v1
```

Admin orchestrates product truth through authenticated HTTP provider contracts. It does not host Pet or Career customer SPAs.

## Local development

```bash
npm ci
cp .env.example .env   # configure Firebase + provider/API URLs
NODE_ENV=production npm run build:frontend
npm run dev            # http://localhost:3018/admin
node scripts/smoke-test.js --base-url http://127.0.0.1:3018
```

Default provider URLs (override in `.env`):

| Product | Provider base |
|---|---|
| Pet | `http://127.0.0.1:3014/api/admin-provider/v1` |
| Career | `http://127.0.0.1:3016/api/admin-provider/v1` |

Local dev boot uses `X-Dev-Admin: 1` on localhost when `NODE_ENV !== production`.

## Tests

```bash
npm run test:admin
```

## Deploy (Admin-only)

| Profile | Branch | PM2 app | Port |
|---|---|---|---|
| production | `main` | `wmb-admin` | 3018 |
| stage | `stage` | `wmb-admin-stage` | 3019 |

Deploying Admin must not restart Pet or Career.

## Deploy (Admin-only)

Admin deploy **does not** build Pet/Career bundles or restart `wmb-pet` / `wmb-career` PM2 apps.

| Profile | Branch | Server path | PM2 app | Port |
|---------|--------|-------------|---------|------|
| production | `main` | `/home/admin/apps/wmb-admin` | `wmb-admin` | 3018 |
| stage | `stage` | `/home/admin/apps/wmb-admin-stage` | `wmb-admin-stage` | 3019 |

```bash
bash deploy.sh              # production (origin/main)
bash deploy.sh --stage      # staging (origin/stage)
bash deploy.sh --dry-run    # preview remote checkout
npm run smoke:admin -- --base-url http://127.0.0.1:3018
```

Canonical runtime/deploy doc: [admin-independent-runtime-deploy.md](docs/architecture/admin-independent-runtime-deploy.md)

**Proxy cutover:** public `/admin` may still target Pet until ops repoints to port 3018/3019 (Phase 7 removes Pet-hosted Admin).

## Phase status

- **Phase 4:** bootstrap runtime, provider registry/client, orchestration API
- **Phase 5:** Admin Desk UI + product API proxy shims for desk parity
- **Phase 6 (this repo):** independent PM2/deploy/smoke lifecycle
- **Phase 7:** remove Admin from Pet after proxy cutover parity
- **Phase 8:** least-privilege Firebase split

Architecture: [docs/architecture/admin-independent-runtime.md](docs/architecture/admin-independent-runtime.md)
