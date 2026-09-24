# Security remediation — 24 September 2026

The application now treats configured Supabase identities and sessions as authoritative. Active employees without an Auth mapping authenticate only against their primary legacy account hash. Incorrect mapped Auth passwords cannot fall back to D1. Bulk backfills ignore existing primary account records, preserving revocations, passwords and permissions.

Account disable/delete synchronizes primary revocation. Guest setup/reset and logout report primary failures instead of silently claiming success. The database independently revokes sessions when active status, password hash or salt changes. Primary outages deny access; service availability is not guaranteed during an upstream outage.

Specialized staff receive the service information required for their jobs without room financials, passports or booking bearer tokens. Billing staff retain financial records without bearer tokens. Admin/reception retain booking management. Folio reads require reception/billing permission. Unassigned staff do not receive hotel/service access.

Staff passwords are no longer recoverable through the credential viewer and new staff passwords are not stored as recoverable ciphertext. A newly set password can be shared during that interaction. Guest one-time room setup codes retain their supported workflow.

Web push permits known browser push providers and rejects redirects. HTML/API routing adds framing, MIME, referrer, HTTPS and baseline content-security protections. React, server-rendering and Vite dependencies are patched, with compatible transitive security versions pinned in pnpm-workspace.yaml.

## Production database changes

Applied through Supabase's migration API:

- `restrict_direct_client_table_access`: removes direct anon/authenticated table/sequence grants in public and future postgres-owned default grants. Worker service_role grants are retained. Verified 0 client-accessible tables and server access to all 25 application tables. All public application tables retain RLS.
- `invalidate_legacy_sessions_on_account_security_change`: an invoker trigger in the private schema deletes account sessions on changed active/password_hash/salt. Verified password-change and disable behavior using rollback-only synthetic records. No test accounts persisted.

The application uses server-authorized REST requests for data; browser clients do not require direct table access. Do not restore broad client grants to resolve an application authorization error.

## Verification and remaining limits

Production build and the complete repository test suite pass. Tests cover guest bookings, excursion capacity/assignment, transport billing, account history, permissions, stale identity/session rejection and security projections. Some older test fixtures needed current imports, schedule-version markers and required passenger details; application assertions remain intact.

A full TypeScript check still reports pre-existing project-wide typing errors (including unknown Response.json types); it is not a passing gate. The bundler production build passes. Test success is not evidence that every authenticated browser workflow or external integration has been exercised.

Production dependency audit is clean. Review the full dependency audit separately because build and local tooling are also included. Cloudflare account settings, administrator MFA, backup restore, leaked-password protection configuration, and a live browser matrix using dedicated staff/guest accounts still require verification before unrestricted security sign-off. Do not describe the entire system as flawless or fully certified on this evidence alone.
