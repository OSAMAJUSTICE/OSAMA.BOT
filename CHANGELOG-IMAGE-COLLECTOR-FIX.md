# IMYD 3.20.25 — Image collector reliability fixes

Based on `IMYD-PREFIX-COMBINED-50006-AUTOMOD-VERIFIED`.

## Changes
- Extract extensionless image URLs from JSON image arrays and common image-bearing API fields.
- Support more lazy-loading attributes, reversed metadata attribute order, `itemprop=image`, CSS backgrounds, and serialized URLs.
- When a user sends a single HTTPS URL by itself, inspect it even when the hostname and path do not contain image/search keywords.
- Keep validating downloaded payloads by image signatures and preserve HTTPS/public-host protections in `net-safe.js`.
- Keep guild-level content-hash deduplication; cap the stored seen-image history to the latest 5,000 entries per guild.
- Prevent a database bookkeeping failure after a successful Discord post from being reported as if image extraction itself failed.

## Validation
- `npm test`: 142 tests passed.
- `npm run check`: passed; 94 unique slash commands remain declared.

## Limitations
Sites that require JavaScript execution, login, cookies, or anti-bot challenges may not expose image URLs to a simple HTTPS fetch. Such sites need a dedicated supported source or browser-based integration. A page containing only a single fixed image cannot provide unlimited unique images; use a gallery/search page or rotating feed for variety.

## 3.20.26 — full-page collection
- Added `/image-collect` to collect up to 80 new images from a public HTTPS page and post them to a chosen text channel.
- A URL pasted by itself still triggers the automatic collector in the current channel.
- Direct image URLs yield that single image; gallery/search pages yield multiple downloadable images when exposed in their HTML/JSON.
- Automatic catalog feeds now post up to 30 unseen images per run, in Discord-safe batches, instead of only one image.
- Content-hash deduplication remains enabled; images are marked seen after successful sends.
- Websites requiring browser JavaScript, login, or anti-bot challenges may still need site-specific support.
