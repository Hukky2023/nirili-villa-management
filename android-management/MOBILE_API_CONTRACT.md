# Mobile API contract — implementation checklist

The currently inspected browser endpoint `app/api/auth/login/route.ts` checks same-origin, returns a redirect and sets a cookie linked to a tab identifier. Mobile clients need a separately designed authentication flow, not a bypass of the existing same-origin guard.

## Proposed endpoints (NOT implemented)
- `POST /api/mobile/v1/auth/login`: rate-limited credential exchange with device/session metadata; do not expose staff data until server authorization.
- `POST /api/mobile/v1/auth/refresh`: rotate refresh token and invalidate the previous token.
- `POST /api/mobile/v1/auth/logout`: server revoke refresh family.
- `GET /api/mobile/v1/me`: normalized server-derived role and permission claims.
- `GET /api/mobile/v1/dashboard`: authorized summary for role.
- `GET /api/mobile/v1/bookings`, `/rooms`, `/excursions/schedules`, `/pos/orders`, `/transfers`, `/bills`, `/reports`: permission-filtered resources.
- `POST /api/mobile/v1/devices`: authenticated push registration and revocation.

## Security
No direct D1 access from devices. Never put privileged API keys in the app. Require HTTPS; enforce server-side RBAC for every query and mutation. Use short-lived tokens, keychain/keystore encryption, refresh rotation, session revocation, reauthentication for privileged actions, request rate limits and audit records. Use idempotency for booking/payment writes. Bind all updates to existing database revision rules. Consider risk of stale session on shared staff devices.

## Next code step
Inventory existing server API and state mutation contracts before implementing mobile endpoints so mobile and web perform exactly the same validations. Staging test every role, cancellation, room allocation and payment state transition.
