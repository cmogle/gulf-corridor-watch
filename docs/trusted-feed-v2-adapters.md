# Trusted Feed v2 Adapter Specs

Core launch set and frozen fixture mappings for deterministic extraction tests.

| Source ID | Parser | Adapter mode | Parse threshold | Fixture |
|---|---|---|---:|---|
| `emirates_updates` | html | `extractHtmlSnapshot` | 0.70 | `lib/trusted-feed/fixtures/emirates_updates.html` |
| `etihad_advisory` | html | `extractHtmlSnapshot` | 0.70 | `lib/trusted-feed/fixtures/etihad_advisory.html` |
| `air_arabia_updates` | html | `extractHtmlSnapshot` | 0.70 | `lib/trusted-feed/fixtures/air_arabia_updates.html` |
| `oman_air` | html | `extractHtmlSnapshot` | 0.72 | runtime source extraction |
| `flydubai_updates` | html | `extractHtmlSnapshot` | 0.72 | `lib/trusted-feed/fixtures/flydubai_updates.html` |
| `heathrow_airport_x` | x | official handle ingestion (`@HeathrowAirport`) | 0.55 | runtime source extraction |

Notes:
- LLM is excluded from the critical publish path.
- Candidate events failing qualification are persisted with `quality_state='rejected'` and machine-readable `quality_reason`.
- Duplicate suppression is keyed by (`source_id`, `event_hash`) with a published-only uniqueness constraint.
- Negative fixture regressions are included for shell/noise patterns:
  - `emirates_evergreen_shell.html`
  - `etihad_404_shell.html`
  - `flydubai_nav_shell.html`
