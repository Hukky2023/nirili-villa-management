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
- **Nirili Excursions** → `https://excursions.nirilihotels.com/` for Nirili Tours experiences and excursion booking.
- **Nirili Restaurant** → `https://restaurant.nirilihotels.com/` for restaurant information, menu, dine-in ordering and delivery ordering.
- **Nirili Travels** → parent travel division.
  - **Nirili Ride** → buggy and local island rides.
  - **Nirili Transfers** → `https://transfers.nirilihotels.com/` for speedboat and airport transfers.

## Guest Portal

The Guest Portal is a separate private interface for in-house guests at `https://guest.nirilihotels.com/`. It is not a fifth public business division and must not be presented as a normal public service on the main website.

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

- `nirilihotels.com` / `www.nirilihotels.com` → main Nirili public website.
- `stay.nirilihotels.com` → Nirili Stay.
- `excursions.nirilihotels.com` → Nirili Excursions.
- `restaurant.nirilihotels.com` → Nirili Restaurant.
- `transfers.nirilihotels.com` → Nirili Transfers.
- `ride.nirilihotels.com` → Nirili Ride.
- `guest.nirilihotels.com` → private in-house Guest Portal.

`booking.nirilihotels.com` is retired as a public service address. While it remains attached to the Worker, it only redirects old links to the correct service subdomain and can be removed from Cloudflare after the new service domains are active.
