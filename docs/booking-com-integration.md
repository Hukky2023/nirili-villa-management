# Booking.com → PMS automatic booking import

Booking.com reservations reach the PMS through **Channex** (a certified
Booking.com connectivity provider). Booking.com does not offer a direct API to
individual properties; it only sends reservations to a connected channel
manager. The PMS already contains the Channex integration (`lib/channels.ts`,
Admin → Channels). This guide lists what must be done to switch it on.

## How a booking flows

1. A guest books Nirili Villa on Booking.com.
2. Booking.com sends the reservation to Channex.
3. Channex calls the PMS webhook `POST /api/channels/booking-com/webhook`
   (authenticated with the `X-Nirili-Channel-Secret` header).
4. The PMS fetches the full booking revision, creates, modifies or cancels the
   stay (room assigned automatically, meal plan from the rate mapping, source
   `Booking.com`), acknowledges the revision to Channex and notifies admins.
5. The PMS pushes updated availability back to Channex so Booking.com does not
   oversell rooms booked on the website or at reception.
6. Every 15 minutes the GitHub Actions workflow `booking-com-poll.yml` calls
   `POST /api/channels/booking-com/cron`. It imports any revision that Channex
   has not seen acknowledged, which covers missed webhook deliveries.

If a booking cannot be imported (for example an unmapped rate plan or no free
room), admins receive a "Booking.com reservation needs attention" notification
and the booking is listed under Admin → Channels → Recent reservations.
Channex keeps it unacknowledged, so it is imported automatically once the cause
is fixed.

## One-time setup

### 1. Channex account
- Sign up at https://app.channex.io (paid, billed per property).
- Create an API key under your user profile.

### 2. Cloudflare Worker secrets
Run with `--config wrangler.selfhost.json`:

```
pnpm exec wrangler secret put CHANNEX_PRODUCTION_API_KEY   # Channex API key
pnpm exec wrangler secret put CHANNEX_CRON_TOKEN           # long random string, e.g. `openssl rand -hex 32`
pnpm exec wrangler secret put SUPABASE_SECRET_KEY          # if not already set
```

### 3. PMS (Admin → Channels)
1. Environment: **Production** → Save settings.
2. **Create Nirili production property** (creates the property, the Double Room
   type and the BB/HB/FB rate plans in Channex), or enter an existing Channex
   property ID and click **Discover from Channex**.
3. Check every rate plan is mapped to a meal plan → **Save mappings**.
4. **Test Channex** → should succeed.
5. **Create / repair webhook**.

### 4. Connect Booking.com to Channex
1. In the Booking.com extranet: Account → Connectivity provider → search
   **Channex** → accept the connection.
2. In Channex: Channels → add Booking.com → enter the Booking.com Hotel ID →
   map Booking.com room/rates to the Channex Double Room and rate plans.
3. In Channex, run a full sync so Booking.com receives current availability.

### 5. GitHub repository secrets (recovery poll)
Settings → Secrets and variables → Actions:
- `NIRILI_SITE_URL` — management site address, e.g.
  `https://nirili-villa.nirili-management.workers.dev`
- `CHANNEX_CRON_TOKEN` — the same value as the Cloudflare secret.

### 6. Go live
In Admin → Channels → Sync safety:
1. Tick **Enable channel**, keep **Dry-run** on, Save. Make a test booking or
   wait for a real one; it appears under Recent reservations as `dry_run`
   without changing the PMS.
2. Untick **Dry-run**, tick **Automatic booking import** and **Automatic
   availability push**, Save.
3. Click **Check booking feed now** to import bookings waiting in Channex.

Existing Booking.com reservations made before the connection must be checked
once against the PMS; Channex only delivers bookings made after Booking.com is
connected.

## Notes
- Booking amounts must be in USD in production; other currencies stop the
  import with a notification until a currency mapping is added.
- Cancellations of guests who are already In House, and modifications of
  checked-out stays, are never applied automatically; they raise a notification.
- Card details are not stored in the PMS.
