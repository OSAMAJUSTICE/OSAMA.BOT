# IMYD 3.20.27 — Pinterest-aware image sources and source management

## Included changes
- Added optional Pinterest API support using `PINTEREST_ACCESS_TOKEN` from the root `.env` file. The bearer token is sent only to the fixed `api.pinterest.com` origin and redirects are refused.
- Added API extraction for Pinterest Pin URLs and Pinterest Pins search URLs. Existing public-page extraction remains available when no token is configured.
- Added `/image-source` management subcommands: `list`, `status`, `edit`, `pause`, `resume`, and `remove`. Existing `/image-catalog-add`, `/image-catalog-list`, `/image-catalog-post`, and `/image-catalog-remove` remain supported.
- Added the `anime` image category.
- Added additive feed status columns for last check, scan count, match count, and post count. Existing feed rows and the main SQLite database are preserved.
- Automatic feed scheduling now uses the last check time, so an empty/no-new-image scan does not immediately count as a consecutive source failure or disable the feed.
- Added `.env.example` and `.gitignore` rules so real `.env` files, database files, and dependencies are not packaged accidentally.

## Pinterest limitations
- Pinterest API support depends on the token's actual scopes and the app's access tier. Pin and search endpoints can return 401/403 if the token is invalid, lacks `pins:read`, or Pinterest has not approved access to the requested data.
- The API search route uses Pinterest's documented `GET /v5/search/pins` endpoint. It does not grant access to arbitrary private boards or content.
- Public HTML fallback still cannot execute JavaScript, sign in, or bypass anti-bot controls. Board pages that do not expose image URLs may not be collectable.
- The bot downloads image media and validates file signatures before posting. It does not auto-execute Pinterest actions or create Pins.

## Validation
- `npm run check`: passed; 96 unique slash commands (below Discord's 100-command guild limit) and syntax checked across 72 JavaScript files.
- `npm test`: passed; 146 tests, 0 failures.
- `node --test scripts/pinterest-api.test.js`: passed.
- Live Pinterest API access was not tested because the user's token is not available in this workspace. Verify it on the host using `/image-source status <source>`; never paste the token into chat or logs.

## Follow-up hardening (2026-11-01)
- Slash-command sync now skips the Discord bulk-overwrite request when the guild already has the exact desired command definitions. This prevents needless full rewrites on every restart while retaining atomic registration when commands actually changed.
- Increased the per-request Discord REST timeout from 20 seconds to 60 seconds to reduce false failures during large guild command registration.
- Added regression checks for the no-op sync path and the longer REST timeout.
- Local validation: `node scripts/check.js` passed (72 JavaScript files); focused command-localization, Pinterest parsing/status-without-token, and slash-sync tests passed (13/13).
- Full `npm test` was not run in this environment because `npm ci` did not complete before the install timeout. Live Discord registration and authenticated Pinterest API access still require the user's running bot credentials and are not claimed as verified here.
