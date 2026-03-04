# Feature: Flight Intelligence Panel

## Overview

Transform the Pulse Atlas and Flight Pulse from activity indicators into actionable recovery-tracking tools. Users can click any airport node or route ribbon on the Atlas (or any Flight Pulse airport card) to open a slide-out detail panel showing volume recovery trends, pre-crisis baseline comparison, and flight-type breakdowns. The core user question answered: **"Are flight volumes recovering, and how far from normal are we?"**

### User Value

| Persona | Need | Value |
|---------|------|-------|
| UAE resident / traveller | "Is DXB back to normal yet?" | See recovery % and hourly volume trend at a glance |
| Business traveller | "Are my usual routes operational?" | Drill into specific corridors to see activity and reliability |
| Crisis monitor | "Is the situation stabilising?" | Hourly trend direction + baseline comparison tells the story |

---

## Functional Requirements

### Slide-Out Detail Panel

#### FR-001: Airport Detail Panel
When the user clicks an airport node on the Pulse Atlas OR an airport card in Flight Pulse, the system shall open a slide-out drawer from the right side of the viewport displaying:
- Airport name and IATA code (header)
- Recovery percentage vs baseline (e.g. "62% of normal")
- 12-hour volume chart (hourly bars, arrivals + departures stacked)
- Baseline overlay line on the chart (pre-crisis hourly average for that airport)
- Top 5 active routes (sorted by flight count, last 1h)
- Flight type breakdown: airline distribution (top 5 + "other"), equipment mix (widebody / narrowbody / freighter pie/donut)
- Delay summary: % delayed, average delay minutes, cancelled count
- Data freshness indicator ("Last updated 2m ago")

#### FR-002: Route Detail Panel
When the user clicks a route ribbon on the Pulse Atlas, the system shall open the slide-out drawer displaying:
- Route header (e.g. "DXB <-> LHR")
- 12-hour volume chart (hourly bars for this specific corridor)
- Baseline overlay (if baseline data exists for this route pair)
- Active flights list: flight number, airline, status (cruise/approach/departure/on_ground), aircraft type, delay status
- Airline breakdown for this route
- Equipment mix for this route
- Delay/cancellation stats for this route
- Data freshness indicator

#### FR-003: Panel Dismiss
While the slide-out panel is open, when the user clicks outside the panel, presses Escape, or clicks the close button, the system shall close the panel with a slide-out animation.

#### FR-004: Panel Navigation
While the slide-out panel is open for an airport, when the user clicks a route in the "Top 5 active routes" list, the system shall transition the panel content to show route detail for that corridor (without closing and reopening).

#### FR-005: Multiple Entry Points
The system shall support opening the slide-out panel from:
1. Clicking an airport node on the Pulse Atlas
2. Clicking a route ribbon on the Pulse Atlas
3. Clicking an airport card in the Flight Pulse component

All entry points shall open the same panel component with context-appropriate content.

### Volume Recovery Chart

#### FR-006: Hourly Volume Bars
The system shall display a bar chart covering the past 12 hours in 1-hour bins. Each bar shall show:
- Stacked segments for arrivals (inbound) and departures (outbound)
- Total count label above the bar
- Hour label on x-axis (local UAE time, GST/UTC+4)
- Y-axis scaled to max(baseline_peak, actual_peak) for consistent framing

#### FR-007: Baseline Overlay
While a baseline snapshot exists for the selected airport/route, the system shall render a dashed horizontal line (or stepped line matching hourly bins) representing the pre-crisis average volume for that hour-of-day. The recovery percentage shall be calculated as:

```
recovery_% = (actual_flights_last_1h / baseline_flights_same_hour) * 100
```

Where `baseline_flights_same_hour` is the baseline value for the corresponding hour-of-day (0-23).

#### FR-008: Trend Direction Indicator
The system shall display a trend arrow next to the recovery percentage:
- **Up arrow (green)**: Current hour volume > previous hour volume AND recovery % > 50%
- **Flat arrow (amber)**: Volume change < 10% hour-over-hour
- **Down arrow (red)**: Current hour volume < previous hour volume by > 10%

### Flight Type Breakdown

#### FR-009: Airline Distribution
The panel shall show a breakdown of flights by airline for the selected airport/route over the past 12 hours:
- Top 5 airlines by flight count
- Remaining airlines grouped as "Other"
- Display as horizontal bar chart or ranked list with counts and percentages

#### FR-010: Equipment Mix
The panel shall show aircraft type distribution (widebody / narrowbody / freighter / unknown) as a donut chart or segmented bar, using the existing `aircraft-family.ts` classification logic.

### Baseline Capture System

#### FR-011: Capture Baseline API
The system shall provide a protected API endpoint `POST /api/flights/capture-baseline` that:
- Requires authentication via `BASELINE_SECRET` environment variable (header: `Authorization: Bearer <secret>`)
- Reads flight_observations for the past 24 hours
- Computes per-airport, per-hour-of-day averages (arrivals, departures, total)
- Computes per-route-pair, per-hour-of-day averages
- Stores the snapshot in a `flight_baselines` table
- Returns the captured baseline summary
- Overwrites any existing baseline (only one active baseline at a time)

#### FR-012: Baseline Storage
The system shall store baseline data in a `flight_baselines` table:

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| entity_type | TEXT | 'airport' or 'route' |
| entity_key | TEXT | IATA code (e.g. 'DXB') or route pair ('DXB-LHR') |
| hour_of_day | INTEGER | 0-23 (UTC+4 local hour) |
| avg_arrivals | NUMERIC | Average arrivals in that hour |
| avg_departures | NUMERIC | Average departures in that hour |
| avg_total | NUMERIC | Average total movements |
| sample_days | INTEGER | Number of days in the sample |
| captured_at | TIMESTAMPTZ | When this baseline was captured |
| created_at | TIMESTAMPTZ | DB insert time |

Indexes: `(entity_type, entity_key, hour_of_day)` for fast lookup.

#### FR-013: Baseline Graceful Absence
While no baseline has been captured, the system shall:
- Hide the recovery percentage indicator
- Hide the baseline overlay line on charts
- Display a subtle note: "No baseline captured yet"
- All other panel features (volume chart, breakdowns, drill-down) shall function normally

### Data API

#### FR-014: Airport Detail Endpoint
The system shall provide `GET /api/flights/airport-detail?airport=DXB&window=720` returning:
- Hourly volume bins (12h) with arrival/departure split
- Top routes (last 1h)
- Airline distribution (12h)
- Equipment mix (12h)
- Delay/cancellation stats (12h)
- Baseline data for this airport (if exists)
- Recovery percentage (if baseline exists)

Response cached for 60 seconds server-side.

#### FR-015: Route Detail Endpoint
The system shall provide `GET /api/flights/route-detail?from=DXB&to=LHR&window=720` returning:
- Hourly volume bins (12h) for this corridor
- Active flights list (current observations)
- Airline distribution (12h)
- Equipment mix (12h)
- Delay/cancellation stats (12h)
- Baseline data for this route pair (if exists)

Response cached for 60 seconds server-side.

---

## Non-Functional Requirements

### Performance
- Slide-out panel shall open within 300ms of click (animation start)
- API responses for detail endpoints shall return within 500ms p95
- Chart rendering shall complete within 200ms after data arrives
- Panel content shall show a skeleton/loading state while data fetches

### Responsiveness
- On mobile viewports (<768px), the slide-out panel shall render as a full-screen overlay (bottom sheet pattern)
- On tablet/desktop (>=768px), the panel shall slide in from the right, occupying max 480px width
- The Atlas and dashboard shall remain partially visible behind the panel on desktop

### Data Freshness
- Panel data refreshes when opened (no stale cache from previous open)
- Auto-refresh every 60 seconds while panel is open
- Data freshness indicator shows time since last fetch

### Accessibility
- Panel shall be keyboard-navigable (Tab through elements, Escape to close)
- Focus shall be trapped within the panel while open
- Screen reader: panel announced as dialog with descriptive label
- Chart data available as accessible table (sr-only)

---

## Acceptance Criteria

### AC-001: Airport Panel Opens from Atlas
Given the Pulse Atlas is rendered with airport nodes
When the user clicks the DXB airport node
Then a slide-out panel appears from the right within 300ms
And the panel header shows "Dubai International (DXB)"
And a 12-hour volume chart is displayed with hourly bars

### AC-002: Airport Panel Opens from Flight Pulse
Given the Flight Pulse component shows airport cards
When the user clicks the DXB card
Then the same slide-out panel opens showing DXB airport detail
And content is identical to opening from the Atlas

### AC-003: Route Panel Opens from Atlas
Given the Pulse Atlas shows route ribbons
When the user clicks the DXB-LHR route ribbon
Then the slide-out panel shows route detail for DXB <-> LHR
And an active flights list is displayed with flight numbers and statuses

### AC-004: Panel Navigation (Airport -> Route)
Given the airport detail panel is open for DXB
When the user clicks "DXB -> LHR (8)" in the Top Routes list
Then the panel transitions to show DXB-LHR route detail
And the transition is animated (no panel close/reopen)

### AC-005: Volume Chart with Baseline
Given a baseline has been captured
And the airport detail panel is open for DXB
Then the volume chart shows hourly bars for the past 12 hours
And a dashed baseline overlay line is visible
And a recovery percentage is shown (e.g. "62% of normal")
And a trend arrow indicates direction (up/flat/down)

### AC-006: Volume Chart without Baseline
Given no baseline has been captured
And the airport detail panel is open for DXB
Then the volume chart shows hourly bars without a baseline overlay
And "No baseline captured yet" is shown in place of the recovery %

### AC-007: Flight Type Breakdown
Given the airport detail panel is open
Then the airline distribution shows the top 5 airlines with counts
And the equipment mix shows a breakdown of WB / NB / FR / Unknown

### AC-008: Baseline Capture
Given a valid BASELINE_SECRET is configured
When a POST request is sent to /api/flights/capture-baseline with the correct Authorization header
Then the system computes hourly averages from the past 24h of flight_observations
And stores them in the flight_baselines table
And returns a JSON summary of what was captured

### AC-009: Baseline Capture - Unauthorized
Given an invalid or missing Authorization header
When a POST request is sent to /api/flights/capture-baseline
Then the system returns 401 Unauthorized

### AC-010: Panel Dismiss
Given the slide-out panel is open
When the user presses Escape OR clicks outside the panel OR clicks the X button
Then the panel closes with a slide-out animation
And focus returns to the element that triggered the panel

### AC-011: Mobile Responsiveness
Given the viewport width is less than 768px
When the user opens the detail panel
Then it renders as a full-screen bottom sheet overlay
And a drag handle is visible at the top for dismissal

### AC-012: Auto-Refresh
Given the slide-out panel is open
When 60 seconds elapse
Then the panel data refreshes automatically
And the freshness indicator updates

---

## Error Handling

| Error Condition | Handling | User Message |
|-----------------|----------|--------------|
| Detail API returns 500 | Show error state in panel | "Unable to load flight details. Retrying..." + auto-retry once after 5s |
| No flight data in time window | Show empty state | "No flights recorded in the past 12 hours for this airport" |
| Baseline capture fails (no data) | Return 400 | "Insufficient flight data to capture baseline. Need at least 6 hours of observations." |
| Baseline capture unauthorized | Return 401 | "Invalid or missing authorization" |
| Network timeout on panel open | Show skeleton + retry | "Loading..." with skeleton, auto-retry after 3s |
| Invalid airport/route params | Return 400 | "Invalid airport code" / "Invalid route" |

---

## Implementation TODO

### Database
- [ ] Create `flight_baselines` table migration
- [ ] Add index on `(entity_type, entity_key, hour_of_day)`
- [ ] Test baseline insert/upsert logic

### API - Baseline Capture
- [ ] Create `POST /api/flights/capture-baseline` route
- [ ] Implement auth check via `BASELINE_SECRET` env var
- [ ] Implement hourly aggregation query (per-airport, per-route)
- [ ] Store computed averages in `flight_baselines`
- [ ] Return capture summary response

### API - Detail Endpoints
- [ ] Create `GET /api/flights/airport-detail` route
- [ ] Implement hourly volume bins query (12h, arrivals/departures split)
- [ ] Implement top routes query (last 1h, sorted by count)
- [ ] Implement airline distribution query (12h)
- [ ] Implement equipment mix aggregation (reuse aircraft-family.ts)
- [ ] Implement delay/cancellation stats query
- [ ] Join baseline data for recovery % calculation
- [ ] Add 60s server-side caching
- [ ] Create `GET /api/flights/route-detail` route
- [ ] Implement route-specific versions of above queries
- [ ] Implement active flights list query (current observations)

### Frontend - Slide-Out Panel
- [ ] Create `FlightDetailDrawer` component (slide-out panel shell)
- [ ] Implement open/close animation (slide from right, 300ms)
- [ ] Mobile: full-screen bottom sheet variant (<768px)
- [ ] Keyboard handling (Escape to close, focus trap)
- [ ] Loading skeleton state
- [ ] Error state with retry

### Frontend - Airport Detail View
- [ ] Create `AirportDetail` component
- [ ] Volume chart: 12h hourly stacked bars (arrivals/departures)
- [ ] Baseline overlay line (dashed, when available)
- [ ] Recovery % badge with trend arrow
- [ ] Top 5 routes list (clickable -> route detail)
- [ ] Airline distribution (horizontal bars or ranked list)
- [ ] Equipment mix donut/segmented bar
- [ ] Delay summary stats
- [ ] Freshness indicator
- [ ] "No baseline" graceful fallback

### Frontend - Route Detail View
- [ ] Create `RouteDetail` component
- [ ] Volume chart (12h hourly bars for this corridor)
- [ ] Active flights table (flight number, airline, status, aircraft, delay)
- [ ] Airline breakdown for route
- [ ] Equipment mix for route
- [ ] Delay/cancellation stats
- [ ] Baseline overlay (if route-level baseline exists)

### Frontend - Integration
- [ ] Add click handler to Pulse Atlas airport nodes -> open drawer
- [ ] Add click handler to Pulse Atlas route ribbons -> open drawer
- [ ] Add click handler to Flight Pulse airport cards -> open drawer
- [ ] Implement panel state management (open/closed, mode, entity)
- [ ] Add auto-refresh (60s interval while panel open)
- [ ] Panel navigation: airport top-route click -> route detail transition

### Charts
- [ ] Select charting approach (lightweight: recharts or custom SVG bars)
- [ ] Implement HourlyVolumeChart component
- [ ] Implement AirlineBreakdownChart component
- [ ] Implement EquipmentMixChart component
- [ ] Accessible data table (sr-only) for each chart

### Testing
- [ ] Unit test: baseline capture aggregation logic
- [ ] Unit test: hourly volume bin computation
- [ ] Unit test: recovery % calculation (with and without baseline)
- [ ] Unit test: trend direction logic (up/flat/down)
- [ ] Integration test: capture-baseline API endpoint (auth + storage)
- [ ] Integration test: airport-detail API response shape
- [ ] Integration test: route-detail API response shape

---

## Out of Scope (V2 Candidates)

- **Recovery % on Atlas nodes / operability bar** - kept in slide-out only for V1 to avoid Atlas visual complexity
- **Historical trend beyond 12h** - could add 48h / 7-day views later
- **Predictive recovery estimates** ("at this rate, DXB returns to normal in ~18h")
- **Push notifications** when recovery % crosses thresholds
- **Automatic baseline capture** (detect stable day, auto-snapshot)
- **Comparison between airports** (side-by-side DXB vs AUH recovery)
- **Passenger vs cargo volume split** (data not available from current sources)
- **Gate/terminal level detail** (not in current data model)

## Resolved Decisions

- **Charting library**: Custom lightweight SVG bar/line charts. No external charting dependency. Charts are simple enough (hourly bars + dashed baseline line) to build in-house.
- **Route directionality**: Merge directions - DXB->LHR and LHR->DXB treated as one corridor in the detail panel. Both directions shown combined in the volume chart.
- **Baseline granularity**: Simple hour-of-day averages for V1. Day-of-week patterns deferred to V2.
