# D1 mobile authentication rollout — checkpoint

Status: BLOCKED pending recovery point + staging tests. No production changes should be made from this document.

## Confirmed from Cloudflare screenshots (2026-10-31)
- Worker `nirili-villa`, GitHub auto deployment from `main`.
- Binding `DB` points to production D1 `nirili-villa-db`.
- Production D1 `accounts` has id, username, email, name, password_hash, salt, role, permissions, active.
- `mobile_access_sessions` and `mobile_refresh_sessions` were absent in the table listing.
- The live `/api/mobile/v1/me` and `/api/mobile/v1/dashboard` responded HTTP 404 on previous checks.
- No production D1 recovery bookmark has yet been confirmed.

## Before any migration
1. In Cloudflare D1 > nirili-villa-db > Console, run `/bookmark` and save the returned bookmark ID privately. This is a RECOVERY MARKER, not an independent export. Also preserve a verified database export/backup if available.
2. Verify current migration numbering against the live `d1_migrations` table using the read-only query below; the existing migration filenames 0099 and 0100 may collide with other changes.
3. Verify schema in a disposable staging D1 clone (never point the development worker to production).
4. Confirm auth source of truth (D1 versus Supabase bridge); current mobile endpoints intentionally fail closed when bridge is enabled.
5. Apply mobile session migrations only to staging; run tests for staff role permissions, token expiry, replay, logout and password reset revocation. The current refresh-token rotation implementation still needs a security review.
6. Deploy a staging Worker with a separate hostname; test GET /api/mobile/v1/me returns JSON 401 without authorization and 200 only with authorized staff credentials.
7. Only after staging passes, prepare a small reviewed production rollout, backups and rollback plan.

## Safe read-only console checks
```sql
SELECT name FROM sqlite_master
WHERE type='table' AND name IN ('mobile_access_sessions','mobile_refresh_sessions','d1_migrations');
```

```sql
SELECT * FROM d1_migrations ORDER BY id DESC LIMIT 12;
```

## Do not
- Do not merge the full feature branch into `main` as a shortcut.
- Do not run `self-host-setup.mjs` or reinitialize production credentials.
- Do not overwrite or restore the live database without a separate explicit recovery decision.
- Do not place secret values or database exports in GitHub or chat.
