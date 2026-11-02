# IMYD 3.20.35 — Islamic safety pass

## Changes
- Islamic catalog setup now auto-enables only Quran/Mushaf (live Quran API), prayer times (AlAdhan API), and the clearly approximate Ramadan countdown.
- Bundled Hadith, benefits, adhkar, dua, tasbeeh, salawat, Allah's names, and seerah categories are disabled by default and require an administrator's explicit category review before enabling.
- Quran/Mushaf publication now fails closed when AlQuran Cloud is unavailable; it no longer silently substitutes bundled text while presenting it as a live Quran API result.
- Quran video publishing remains disabled until an administrator configures a URL.
- Existing database and per-guild channel/location settings are preserved; no database file is included in the ZIP.

## Verification performed
- `node --check` passed for all JavaScript files in the project.
- Full `npm test` could not be rerun in this environment: dependency installation (`npm ci --ignore-scripts`) timed out. Do not interpret prior version test counts as tests of this release.
- No live API/DNS or Discord message-delivery test was possible here.

## Known remaining work
- Built-in image provider presets (Wikimedia Commons etc.) are not implemented in this release; current image catalog still requires a public HTTPS source URL.
- External service availability and real Discord posting must be tested from the hosting environment.
