# Nirili Master Architecture

Updated: 2026-09-29

## Public Nirili structure

```text
www.nirilihotels.com
├── Nirili Stay
├── Nirili Excursions
├── Nirili Water Sports
├── Nirili Restaurant
└── Nirili Travels
    ├── Nirili Ride
    │   └── Buggy / local island transport
    └── Nirili Transfers
        └── Speedboat / airport transfers
```

### Public entry points

- **Nirili Stay** → `https://stay.nirilihotels.com/` for room availability, packages, meal plans and room booking. It does not expose the separate Nirili Excursions catalogue.
- **Nirili Excursions** → Nirili Tours experiences, excursion details and excursion booking on the public booking service.
- **Nirili Restaurant** → restaurant information, menu, dine-in ordering and delivery ordering.
- **Nirili Travels** → parent travel division.
  - **Nirili Ride** → buggy and local island rides.
  - **Nirili Transfers** → speedboat and airport transfers.

## Guest Portal

The Guest Portal is a separate private interface for in-house guests. It is not a fifth public business division and must not be presented as a normal public service on the main website.

```text
Guest Portal
└── active in-house guest
    ├── My Stay
    ├── Nirili Restaurant
    ├── Nirili Excursions
    ├── Nirili Ride
    ├── Nirili Transfers
    └── Main room bill / requests
```

The portal reuses the guest's stay identity, room, meal plan and account relationship so the guest does not repeatedly enter the same details.

## Operations architecture

```text
Public websites / Guest Portal / Staff apps
                    │
                    ▼
             Nirili Management
                    │
                    ▼
             Shared backend/API
                    │
                    ▼
                Supabase
     PostgreSQL / Auth / Storage / Realtime
```

The management navigation follows the same business structure:

- **Nirili Stay**: Dashboard, Bookings, Rooms, Guests
- **Nirili Excursions**: excursion operations
- **Nirili Restaurant**: POS
- **Nirili Travels**:
  - Nirili Transfers
  - Nirili Ride
- **System**: Channels, Reports, Users, Settings

## Data rule

There is one operational source of truth. Public booking pages, the private Guest Portal, management, POS, excursion operations, transfer operations, ride/driver interfaces and mobile clients must use the shared backend rather than maintaining disconnected copies of bookings or bills.

For in-house guests, eligible restaurant, excursion, transfer and ride charges flow to the linked room folio/main bill.


## Public domain separation

Every public service has its own subdomain. The addresses live in `lib/public-sites.ts` and the host routing in `proxy.ts`; change them there, not in individual pages.

| Address | Serves |
| --- | --- |
| `nirilihotels.com` | Main public website (`www.` redirects here) |
| `stay.nirilihotels.com` | Nirili Stay: rooms, packages, meal plans, manage a booking |
| `tours.nirilihotels.com` | Nirili Excursions: the one excursions site — list with prices, detail pages (video, photos, description; no prices) at `/book/excursions/details/<id>`, booking and self-service manage links. `nirilihotels.com/hotel/excursions` and its detail pages redirect here. |
| `dine.nirilihotels.com` | Nirili Restaurant menu, dine-in and delivery ordering |
| `transfers.nirilihotels.com` | Nirili Transfers: speedboat and airport transfers |
| `watersports.nirilihotels.com` | Nirili Water Sports: guests book an activity, date and group size; staff manage bookings in Management → Nirili Water Sports |
| `ride.nirilihotels.com` | Nirili Ride: anyone can request a buggy and follow it live; in-house guests can still use the portal's buggy tab to charge the room |
| `agents.nirilihotels.com` | Partner Agent Portal: guest houses on Dhiffushi sign in and book excursions for their guests; Admin manages partners in Management → Partner agents |
| `operators.nirilihotels.com` | Nirili Travels operator portal: independent speedboat operators and buggy owners accept bookings, assign boats, board passengers and see statements; Admin manages them in Management → Travel operators |
| `my.nirilihotels.com` | Private in-house Guest Portal |

Each service subdomain serves its page at `/` and redirects paths that belong to another service to that service's subdomain.

Nirili Water Sports is not operated by Nirili yet. Bookings (`water-sports:booking:<id>` operation records, logic in `lib/water-sports.ts`) arrive as **New**; staff forward each one to the partner operator by WhatsApp (**Forwarded**), record the partner's confirmation and reference (**Confirmed**), then **Completed** or **Cancelled**. Admin sets the partner's contact details and the activity list and prices (`water-sports:settings`). When Nirili starts its own service, the same bookings flow can be used without forwarding.

The Partner Agent Portal lets guest houses that do not run excursions send their guests' bookings to Nirili. Partner accounts, sessions and usernames are separate operation records (`excursion-agent:<id>`, `excursion-agent-session:<sha256>`, `excursion-agent-username:<username>`, logic in `lib/excursion-agents.ts`), so an agent login can never open the management app or the in-house guest portal. Agent bookings go through the same booking engine as the tours website (`lib/excursion-booking.ts`), so capacity, auto-scheduling, Special Package planning and child pricing are identical; they are stored as excursion orders with `source:'Agent portal'`, `agentId`, `agentName` and `agentReference`, and appear in the normal Excursions timetable, guest lists and billing. Pricing is net rate: the guest house collects from its guest and owes Nirili the public price less its partner discount (`quotedCents`/`cents`; the public price is kept in `publicQuotedCents`). Each partner can be set to confirm instantly when a trip has free seats or to wait for staff approval. Agents cancel pending bookings themselves; for confirmed bookings they send a cancellation request that Admin or the Excursions Manager accepts or declines under Partner agents, which also shows the monthly statement of what each partner owes and has paid.

Nirili Travels is a marketplace: Nirili does not own speedboats or buggies. Independent operators get their own login at operators.nirilihotels.com (`lib/travel-operators.ts`, sharing the partner login system in `lib/partner-auth.ts` with the Agent Portal). Speedboat operators register boats and publish departures (route, time, days, seats, MVR fare and optional USD fare for Nirili Villa guests) in the existing speedboat ledger `transport-bookings-v1`; every ticket on an operator departure starts as New, the operator accepts it onto one of their boats (capacity and overlapping-departure checks) or declines it with a reason (Admin is notified to rebook the guest), boards passengers on the day and closes the departure, which marks no-shows (`lib/transport-operator.ts`). All readers and writers of the ledger go through `lib/transport-store.ts` (Supabase primary, D1 rollback, compare-and-swap). Buggy owners register buggies in the hotel state's buggy fleet (`ownerId`), go online and accept waiting ride requests; the first to accept wins, and automatic dispatch only ever uses Nirili's own buggies (`lib/buggy-operator.ts`, `houseBuggyFor`). Guests pay operators directly and Nirili earns the operator's commission %; transfers and rides that Nirili Villa guests charge to their room are collected by Nirili and paid on to the operator less commission, as shown on each operator's monthly statement. Partner guest houses book transfers and buggy rides for their guests from the Agent Portal.

Guest websites are translated into Chinese, Russian, Italian, Spanish and Bengali; the management system (PMS) is English only. `<SiteTranslator/>` (app/site-translator.tsx), mounted by the public sites and the in-house guest portal, translates the page in place from reviewed catalogs (`lib/i18n/translations.json` → per-language `lib/i18n/site/*.json`, built with `node scripts/i18n-build.mjs`). Longer text written in admin (excursion descriptions, notes, server messages) is machine translated once per language with Workers AI (binding `AI`, `lib/i18n/machine.ts`, `/api/translate`) and cached in the D1 table `site_translations`. The guest's language comes from a `?lang=` link, their saved choice (cookie shared by every nirilihotels.com subdomain) or their browser language. `tests/site-i18n.test.mjs` fails CI if any guest-facing text lacks a reviewed translation; add it to `lib/i18n/translations.json` and rebuild the catalogs.

Nirili Ride requests from `ride.nirilihotels.com` are stored as `public-ride` buggy bookings next to in-house `guest-ride` bookings and go through the same auto-dispatch, dispatch board and driver status flow (`lib/buggy-rides.ts`). They have no room bill: the fare shown is the configured guest ride fare, paid to the driver. Riders follow their ride with a private key kept in their browser.

`booking.nirilihotels.com` is retired. Its pages redirect permanently to the matching subdomain, so old emails, bookmarks and printed QR codes keep working. `booking.nirilihotels.com/stay` is still served so guests already signed in there (and their push notifications) keep working.

`excursions.nirilihotels.com` and `restaurant.nirilihotels.com` forward to `tours.` and `dine.`, and `travels.nirilihotels.com` forwards to the travel section of the main site. Any other `nirilihotels.com` hostname attached to the Worker without routing in `proxy.ts` falls through to the staff management app, so give every new public hostname an entry in `lib/public-sites.ts`.

The main domain also offers short links for print and chat: `/stay`, `/rooms`, `/book`, `/tours`, `/dine`, `/menu`, `/restaurant`, `/transfers`, `/speedboat`, `/ride`, `/buggy`, `/my`, `/guest`.

Each subdomain must be added as a Custom Domain on the `nirili-villa` Worker in Cloudflare (Workers & Pages → nirili-villa → Settings → Domains & Routes).
