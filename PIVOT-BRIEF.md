# Project Pivot: Personal Emirates Travel Intelligence

## Context
Gulf Corridor Watch (keepcalmandcarryon.help) was built as a crisis monitoring dashboard for the UAE-India corridor. The crisis is over — friends safely arrived in Serbia via FlyDubai DXB>BEG. Time to pivot to a **personal travel companion** for an Emirates Skywards Silver member.

## The Human
- **Name:** Conor
- **Loyalty:** Emirates Skywards Silver member
- **Home airport:** DXB (Dubai)
- **Upcoming trips:**
  1. **Mumbai work trip:** DXB → BOM, needs to be there March 16-18 (Mon-Wed). Need to fly in March 15 or early March 16.
  2. **UK trip:** DXB → London (LHR preferred, LGW acceptable), depart ~March 21 (Fri), return ~March 24 (Mon). Dates flexible.
- **Personality:** "Nerdy traveller" — NOT a plane spotter. Wants human-readable intelligence, not aviation jargon.

## Key Data Available

### Supabase Database
- ~6,255 flight observations from March 3-8, 2026
- DXB↔BOM flights: EK500, EK501, EK503, EK504, EK505, EK506, EK507, FZ445, FZ446, 6E1455, 6E1456
- DXB↔LHR flights: EK1, EK2, EK3, EK4, EK7, EK8, EK69, EK70, VS400, VS401
- DXB↔LGW flights: EK69, EK70

### FR24 API
- **Credits are exhausted** — cannot make live API calls right now
- Key: already configured in .env.vercel.gulf.prod
- When credits are available, use `https://fr24api.flightradar24.com/api/live/flight-positions/full`
- Auth: `Authorization: Bearer $FLIGHTRADAR_KEY`, `Accept-Version: v1`

### Status Code Translation (CRITICAL)
FR24 raw statuses must be converted to human language. The codebase currently uses derived statuses:
- `on_ground` → "On the ground"
- `approach` → "Landing soon"  
- `departure` → "Just taken off"
- `cruise` → "In flight (cruising)"
- `airborne` → "In the air"

But FR24 API also returns codes like:
- `CRZ` → "Cruising at altitude"
- `CLB` → "Climbing after takeoff"
- `DSC` → "Descending towards destination"
- `GND` → "On the ground"
- `DEP` → "Departing"
- `ARR` → "Arrived"
- `DIV` → "Diverted"
- `SCH` → "Scheduled"
- `DEL` → "Delayed"
- `CAN` → "Cancelled"
- `LND` → "Landed"

Always present these in plain English for a traveller audience.

## What Needs Building

### 1. Emirates Route Health Dashboard
- **Schedule health score** for DXB↔BOM and DXB↔LHR/LGW
- On-time performance percentage from historical observations
- Delay distribution charts (how many minutes delayed, how often)
- Time-of-day performance patterns
- Best/worst days and departure slots

### 2. Personal Trip Planner View
- Show Conor's two upcoming trips with recommended flight options
- For each Emirates flight on the route: historical reliability score
- Suggested optimal departure times based on delay patterns
- "Flight confidence" indicator — would you trust this slot?

### 3. Live Corridor Monitor (when FR24 credits available)
- Real-time status of Emirates flights on his routes
- Push towards scheduled polling when credits replenish
- Graceful degradation when credits exhausted

### 4. Data Visualisation
- Be **hugely inventive** here
- Route health heatmaps
- Delay trend sparklines
- Time-of-day reliability curves
- Equipment type breakdown (widebody fleet mix)
- Consider: animated route maps, delay calendars, confidence radials

### 5. Smart Features
- Skywards Silver benefits reminder panel
- Lounge access info for DXB/BOM/LHR
- Transit time estimates
- Weather correlation (optional)
- "Travel IQ" briefing: one-paragraph summary of route health

## Technical Stack
- Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4
- Supabase PostgreSQL backend
- Deployed on Vercel at keepcalmandcarryon.help
- Existing lib/ has solid flight data infrastructure

## Design Direction
- Dark mode, clean, personal dashboard feel
- Think "your personal travel intelligence officer" not "flight tracking app"
- Warm colors for good performance, amber for caution, red for problems
- Mobile-first (traveller checking on phone)
