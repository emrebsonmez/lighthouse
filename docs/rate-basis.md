# Rate basis (v1)

Comparison uses **lowest pre-tax nightly rate per room**, then **cheapest room across the property** for undercut detection.

## AZDS (Montauk Yacht Club)

- **Session:** `GET https://newbooking.azds.com/api/session` → JSON `session` token
- **Rates:** `GET https://newbooking.azds.com/api/hotel/montauk-yacht/rates?from={m/d/Y}&to={m/d/Y}&adults=2&children=0&language=en` with `Cookie: session={token}`
- **Rooms:** `GET https://newbooking.azds.com/api/hotel/montauk-yacht/rooms` (same cookie) for `code` → `name` mapping
- **Pre-tax field:** `rates[].basePriceBeforeTax` (per rate plan; group by `roomCode`, take minimum per room)
- **Room name:** `rooms[].name` where `rooms[].code === rate.roomCode`
- **Sold out:** empty `rates` array with HTTP 200
- **Date format:** `!m/d/Y` (e.g. `05/20/2026`)

## Olive (Marram Montauk)

- **Availability:** `GET https://data-api.api.olive.travel/api/v1/booking-engine/availability?start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}&adults=2&children=0`
- **Header:** `X-Property-ID: 691711440590999552` (from Marram site `hotelId`)
- **Pre-tax field:** `available_rates[].advanced_pricing.daily_rate` (fallback: `advanced_pricing.daily_breakdown[date].base_rate`). **Do not use** `average_daily_rate` alone — tax is separate in `tax_amount` / `total`.
- **Room name:** `rooms[].room_type_code`
- **Per room:** minimum `daily_rate` across `available_rates` for that room
- **Sold out:** `rooms: []` with HTTP 200

## Snapshots

Stored as `{ normalized: { room_name, price }[], raw: <full API payload> }`.
