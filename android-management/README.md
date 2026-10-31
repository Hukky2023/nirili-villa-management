# Nirili Villa Management — Android

This directory is the native Android development track. It is **not** a WebView wrapper.

## Source of truth
The existing Cloudflare Workers/D1 management backend remains authoritative. Do not create a second inventory, booking, billing, account or excursions store.

## Release gates
1. Inventory the existing API routes and role/permission policies.
2. Implement a dedicated mobile authentication API with short-lived access tokens, revocable refresh sessions, secure Android Keystore storage and server-enforced permissions. Current browser /api/auth/login sets HttpOnly cookies and uses a tab-specific session; it cannot safely be reused as a native token endpoint.
3. Implement native screens for dashboard, bookings, stays/rooms, excursions timetable, POS, transfers, bills, notifications, reporting, and role administration.
4. Implement optimistic-concurrency revision checks and idempotency keys for all mutations, with server truth and explicit conflict handling; never queue sensitive financial or booking writes silently while offline.
5. Android notifications using approved FCM sender credentials and channel importance controls; never ship service-account credentials in an APK.
6. End-to-end test with a separate staging database containing no live guest data; verify role boundaries and all business rules.
7. Build a signed release APK/AAB with a controlled update channel and smoke-test on physical Android devices.

## Invariants
- Rooms 101–106, 201–204, 301–304 remain governed by backend availability and reservation locks.
- Cancellation edits must propagate across booking, scheduling, guest and bill views.
- Only published excursions appear in public and partner booking flows.
- Timetable shares exclude cancelled and zero-passenger trips.
- Hotel POS meal-plan inclusion, paid/partial/unpaid bills, commission calculations and crew capacity rules remain backend-defined.
- Use 24-hour time everywhere; do not change live production data for development.

## Status
Initial native development branch created; not a production-ready Android app and no APK has been built.

## Development update — dashboard
- Added a gated `GET /api/mobile/v1/dashboard` endpoint. It reuses the management website's `buildDashboard`, `dashboardAccess`, and D1/primary snapshot fallback. It rejects unauthenticated or unauthorized requests.
- Android can request and refresh read-only occupancy, check-ins, check-outs and pending-booking counts after staff sign-in.
- Existing mobile access tokens expire after 15 minutes. A refresh-token table migration has been staged, but refresh issuance/rotation is **not implemented**; the application still requires signing in again when the access token expires or the process restarts.
- No live deployment, migration, Android build, or real-account integration testing has been performed. Do not enable `NIRILI_MOBILE_AUTH_ENABLED` in production until these gates and the supported Supabase bridge mode are resolved.

## Development update — automatic token renewal
- Android dashboard retries once on HTTP 401 after synchronized refresh-token rotation.
- The replacement access token is held in memory; refresh tokens remain Android-Keystore encrypted.
- Still to verify: device build, staging D1 migrations, Supabase bridge compatibility, token revocation on password reset, logout race behavior, and renewal during all future API calls. Do not enable in production yet.
