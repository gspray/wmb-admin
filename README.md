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
cp .env.example .env   # configure Firebase + provider URLs
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

## Phase status

- **Phase 4 (this repo):** bootstrap runtime, provider registry/client, orchestration API, placeholder `/admin` shell
- **Phase 5:** move Admin Desk UI from Pet
- **Phase 6:** independent deploy/proxy cutover
- **Phase 7:** remove Admin from Pet

Architecture: [docs/architecture/admin-independent-runtime.md](docs/architecture/admin-independent-runtime.md)
