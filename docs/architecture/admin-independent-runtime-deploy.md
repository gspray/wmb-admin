# Issue #348 — Admin independent runtime/deploy (Phase 6)

**Status:** Phase 6 complete in `gspray/wmb-admin`  
**Issue:** [#348](https://github.com/gspray/wmb/issues/348)  
**Runtime overview:** [admin-independent-runtime.md](./admin-independent-runtime.md)

## Deliverable

Book Platform Admin has **independent deploy entrypoints, PM2 identities, ports, logs, build, and smoke tests**. Deploying Admin does not build, restart, or smoke Pet or Career.

Pet still serves `/admin` until [Phase 7](../gspray/wmb/blob/stage/docs/architecture/admin-extraction-map.md) removes the legacy mount.

## Runtime matrix

| Product | Repository | PM2 (prod) | PM2 (stage) | Port (prod) | Port (stage) | Server app dir (prod) | Server app dir (stage) |
|---------|------------|------------|-------------|-------------|--------------|----------------------|------------------------|
| Admin | `gspray/wmb-admin` | `wmb-admin` | `wmb-admin-stage` | 3018 | 3019 | `/home/admin/apps/wmb-admin` | `/home/admin/apps/wmb-admin-stage` |
| Pet | `gspray/wmb` | `wmb-pet` | `wmb-pet-stage` | 3014 | 3015 | `/home/admin/apps/wmb` | `/home/admin/apps/wmb-stage` |
| Career | `gspray/wmb-career` | `wmb-career` | `wmb-career-stage` | 3016 | 3017 | `/home/admin/apps/wmb-career` | `/home/admin/apps/wmb-career-stage` |

## Public URLs (target after proxy cutover)

| Surface | Path | Backend (target) | Notes |
|---------|------|------------------|-------|
| Admin Desk | `/admin` | `wmb-admin` :3018 / :3019 | May still hit Pet :3014 until ops repoints proxy (Phase 7) |
| Pet customer | `/pet` | `wmb-pet` :3014 / :3015 | unchanged |
| Career customer | `/book` | `wmb-career` :3016 / :3017 | unchanged |

Recommended hostnames (ops):

```text
admin.writemybook.now        → wmb-admin @ 3018
stage-admin.writemybook.com  → wmb-admin-stage @ 3019   (or path-based /admin on stage host)
```

## Deploy commands

```bash
# production → wmb-admin @ :3018
bash deploy.sh

# staging → wmb-admin-stage @ :3019
bash deploy.sh --stage

# preview remote checkout
bash deploy.sh --dry-run
bash deploy.sh --stage --dry-run

# PM2 restart only
bash deploy.sh --env-only
```

Builds: `public/dist/admin-desk.bundle.js` only.

Smoke: `scripts/smoke-test.js` (`[wmb-admin]` prefix), loopback `/admin` during deploy-server.

## PM2 log files

| App | Error log | Out log |
|-----|-----------|---------|
| `wmb-admin` | `logs/pm2-admin-error.log` | `logs/pm2-admin-out.log` |
| `wmb-admin-stage` | `logs/pm2-admin-stage-error.log` | `logs/pm2-admin-stage-out.log` |

## Secrets (Phase 6 scope)

- **Admin Doppler:** project `wmb-admin` (recommended), configs `prd` / `stg`
- Tokens: `/etc/wmb-admin/doppler.token`, `/etc/wmb-admin/doppler.stg.token`
- Provider/API bases in Doppler: `PET_PROVIDER_BASE_URL`, `CAREER_PROVIDER_BASE_URL`, `PET_API_BASE_URL`, `CAREER_API_BASE_URL`
- **Out of scope here:** physical Firebase split (Phase 8)

## Proxy cutover (ops — preparation only)

1. Stand up `wmb-admin` PM2 on 3018/3019 and verify loopback smoke passes.
2. Repoint public `/admin` (or admin hostname) from Pet port to Admin port.
3. Keep Pet `/admin` mounted until Phase 7 confirms standalone parity; then remove Pet Admin routes/build.

Rollback: revert proxy target only — no datastore migration.

## Rollback (Admin only)

```bash
cd ~/apps/wmb-admin && git checkout --force <sha> && bash scripts/deploy-server.sh
```

Does not affect `wmb-pet` or `wmb-career` PM2 apps.

## Verification

```bash
npm run test:admin
NODE_ENV=production npm run build:frontend
node --test test/architecture/admin-runtime-deploy-boundary.test.js
node scripts/smoke-test.js --base-url http://127.0.0.1:3018
```

## Next phases

- **Phase 7:** remove `/admin` from Pet; stop building `admin-desk.bundle.js` in `gspray/wmb`
- **Phase 8:** least-privilege Firebase / Admin platform credentials
