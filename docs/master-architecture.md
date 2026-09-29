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

- **Nirili Stay** → room availability, packages, meal plans and room booking.
- **Nirili Excursions** → Nirili Tours experiences, excursion details and excursion booking.
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
