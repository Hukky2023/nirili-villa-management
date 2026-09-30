# Nirili Master Architecture

Updated: 2026-09-29

## Public Nirili structure

```text
www.nirilihotels.com
├── Nirili Stay
├── Nirili Excursions
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
| `tours.nirilihotels.com` | Nirili Excursions booking and self-service manage links |
| `dine.nirilihotels.com` | Nirili Restaurant menu, dine-in and delivery ordering |
| `transfers.nirilihotels.com` | Nirili Transfers: speedboat and airport transfers |
| `ride.nirilihotels.com` | Nirili Ride: anyone can request a buggy and follow it live; in-house guests can still use the portal's buggy tab to charge the room |
| `my.nirilihotels.com` | Private in-house Guest Portal |

Each service subdomain serves its page at `/` and redirects paths that belong to another service to that service's subdomain.

Nirili Ride requests from `ride.nirilihotels.com` are stored as `public-ride` buggy bookings next to in-house `guest-ride` bookings and go through the same auto-dispatch, dispatch board and driver status flow (`lib/buggy-rides.ts`). They have no room bill: the fare shown is the configured guest ride fare, paid to the driver. Riders follow their ride with a private key kept in their browser.

`booking.nirilihotels.com` is retired. Its pages redirect permanently to the matching subdomain, so old emails, bookmarks and printed QR codes keep working. `booking.nirilihotels.com/stay` is still served so guests already signed in there (and their push notifications) keep working.

`excursions.nirilihotels.com` and `restaurant.nirilihotels.com` forward to `tours.` and `dine.`, and `travels.nirilihotels.com` forwards to the travel section of the main site. Any other `nirilihotels.com` hostname attached to the Worker without routing in `proxy.ts` falls through to the staff management app, so give every new public hostname an entry in `lib/public-sites.ts`.

The main domain also offers short links for print and chat: `/stay`, `/rooms`, `/book`, `/tours`, `/dine`, `/menu`, `/restaurant`, `/transfers`, `/speedboat`, `/ride`, `/buggy`, `/my`, `/guest`.

Each subdomain must be added as a Custom Domain on the `nirili-villa` Worker in Cloudflare (Workers & Pages → nirili-villa → Settings → Domains & Routes).
