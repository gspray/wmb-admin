# Issue #348 — Admin independent runtime (Phase 4 bootstrap)

**Status:** Phase 4 bootstrap on `gspray/wmb-admin`  
**Issue:** [#348](https://github.com/gspray/wmb/issues/348)  
**Provider contract:** see `gspray/wmb` → [admin-provider-contract.md](https://github.com/gspray/wmb/blob/stage/docs/architecture/admin-provider-contract.md)

## Purpose

`wmb-admin` is the cross-product operator application. It orchestrates Pet and
Career through authenticated HTTP provider APIs. It does not host customer
runtime or import sibling product source trees.

```text
wmb-admin (/admin)
  |
  +-- Pet provider     -> PET_PROVIDER_BASE_URL     (default localhost:3014)
  |
  +-- Career provider  -> CAREER_PROVIDER_BASE_URL  (default localhost:3016)
```

## Runtime ownership

| Surface | Owner | Notes |
|---|---|---|
| `/admin` | wmb-admin | Bootstrap shell in Phase 4; full Desk UI in Phase 5 |
| `/api/admin/*` | wmb-admin | Provider orchestration (boot, merged project list) |
| `/api/auth/*` | wmb-admin | Operator identity |
| `/api/admin-provider/v1/*` | product repos | Pet (`wmb`) and Career (`wmb-career`) |

## Ports and PM2

| Profile | PM2 app | Port |
|---|---|---|
| production | `wmb-admin` | 3018 |
| stage | `wmb-admin-stage` | 3019 |

Pet (3014/3015) and Career (3016/3017) remain independent. Deploying Admin must
not restart product processes.

## Environment contract

Required for operator auth during migration:

- Firebase client + Admin SDK env (`FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT`)
- `ADMIN_TOKEN_SECRET` in production
- `PET_PROVIDER_BASE_URL` / `CAREER_PROVIDER_BASE_URL`

Local dev:

- `npm run dev` → `http://localhost:3018/admin`
- localhost requests may use `X-Dev-Admin: 1` when `NODE_ENV !== production`

## Phase 4 scope

Implemented:

- standalone repository with no sibling source imports
- provider registry + HTTP client
- `/api/admin/boot`, `/api/admin/providers`, `/api/admin/projects`
- placeholder Admin shell proving external provider wiring

Deferred:

- Admin Desk panel migration (Phase 5)
- proxy/hostname cutover (Phase 6)
- Pet-hosted Admin removal (Phase 7)
- least-privilege Firebase split (Phase 8)

## Verification

```bash
npm run test:admin
node scripts/smoke-test.js --base-url http://127.0.0.1:3018
```

Repository independence tests assert:

- no imports from `../wmb/` or `../wmb-career/`
- no Pet/Career customer bundles in this repo
- server does not mount product author routers
