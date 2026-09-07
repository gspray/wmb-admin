# AGENTS.md — Book Platform Admin Engineering Contract

Cross-product Admin repository (`gspray/wmb-admin`). Pet and Career customer
behavior belong in `gspray/wmb` and `gspray/wmb-career` respectively.

## Identity

```text
wmb-admin  -> operator application only (/admin)
wmb        -> Pet customer + Pet admin-provider API
wmb-career -> Career customer + Career admin-provider API
```

Admin orchestrates products through `/api/admin-provider/v1` HTTP contracts.
Do not import sibling repository source trees at runtime or build time.

## Workflow

Ordinary work on `stage`:

```text
inspect -> implement -> targeted tests -> commit -> push
```

Do not deploy production unless explicitly authorized.

## Canonical docs

| Topic | Location |
|---|---|
| Extraction inventory | `gspray/wmb` → `docs/architecture/admin-extraction-map.md` |
| Provider contract | `gspray/wmb` → `docs/architecture/admin-provider-contract.md` |
| Admin runtime | `docs/architecture/admin-independent-runtime.md` |

## Local URLs

```text
http://localhost:3018/admin
http://localhost:3018/api/admin/boot
```

## Testing

Run targeted tests for changed behavior:

```bash
npm run test:admin
```

Full-suite gate before merge readiness.

## Safety

- Fail closed on ambiguous product ownership
- Never treat client `productId` as canonical authority
- Provider APIs re-validate record ownership
- No Pet/Career customer SPA bundles in Admin
