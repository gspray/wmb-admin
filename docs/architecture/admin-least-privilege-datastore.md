# Issue #348 Phase 8 — Admin least-privilege datastore

**Status:** Implemented on `gspray/wmb-admin`  
**Issue:** [#348](https://github.com/gspray/wmb/issues/348)  
**Canonical cross-repo note:** see `gspray/wmb` → [admin-least-privilege-datastore.md](https://github.com/gspray/wmb/blob/stage/docs/architecture/admin-least-privilege-datastore.md)

## Runtime contract

Standalone Admin (`wmb-admin`) must not mutate product-owned RTDB paths directly.
Project CRUD and catalog/settings mutations go through authenticated product
provider HTTP APIs (`/api/admin-provider/v1` on Pet and Career).

Admin may touch only these RTDB prefixes directly:

| Path prefix | Access | Purpose |
|---|---|---|
| `_wmbServer/users` | read | operator roles, scoped `adminProductIds` |
| `_wmbServer/emails` | read | legacy allow-list (migration) |
| `_wmbServer/phones` | read | legacy allow-list (migration) |
| `_wmbServer/presence` | read/write | operator online presence |

Forbidden direct paths include `projects/`, `project_index/`, and
`_wmbServer/content`, `_wmbServer/settings`, `_wmbServer/jobs`, and related
platform catalog nodes.

Enforcement lives in:

- `services/platformDatastorePaths.js` — allowlist + assertions
- `models/firebase.js` — guarded `rtdbGet` / `rtdbSet` / `rtdbUpdate` helpers
- `test/architecture/admin-least-privilege-datastore.test.js`

## Credentials (ops)

During migration Admin may still share the physical Firebase project with Pet.
Phase 8 code enforcement is the application boundary; **physical** least-privilege
service accounts are tracked separately (Issue #331 Option B).

Recommended Doppler / deploy posture for `wmb-admin`:

1. Use the `wmb-admin` Doppler project (not Pet customer secrets).
2. Prefer a dedicated service account limited to platform operator paths when
   Firebase rules/IAM support it.
3. Never grant Admin runtime blanket write access to `projects/` — provider APIs
   remain the mutation boundary even if credentials could reach more paths.

Emergency operator access may still use `ADMIN_EMAILS` / `ADMIN_PHONES` env
allow-lists when RTDB contacts are incomplete.
