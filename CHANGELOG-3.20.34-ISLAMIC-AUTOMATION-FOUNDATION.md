# IMYD 3.20.34 — Islamic automation foundation

- One-command Islamic catalog setup now enables built-in categories with local curated content, while keeping Quran video disabled until a valid URL is configured.
- Quran and Mushaf posts request a random Arabic Uthmani ayah and the `en.sahih` meaning from AlQuran Cloud; if the service is unavailable, the bot falls back to the bundled sample.
- Existing channel IDs, city, country, timezone, method, and last-post keys are preserved during catalog setup.
- Video category cannot be enabled until an HTTPS YouTube URL is configured.
- Scheduler remains daily per category and uses the persisted local-date key to avoid duplicates after restart.

## Verification
- `npm test`: 149 passed, 0 failed.
- `node --check` / static check: 72 JavaScript files passed.
- No live Discord send test was possible in this environment.

## Still requiring follow-up
- The image catalog still requires a source URL per feed. Universal extraction from every website is not technically possible; built-in image-provider presets and API-key integrations are a separate remaining implementation step.
- Hadith/adhkar/seerah and other non-Quran content currently use bundled content, not a live authenticated hadith API.
