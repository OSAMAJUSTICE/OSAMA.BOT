# IMYD 3.20.23 — Prefix 50006 / Translation Rate-Limit Fix

## Changes
- Removed duplicate localization from `message.reply`; Prefix replies now use the shared `channel.send` localization path exactly once.
- Added a pre-send guard that blocks empty Discord payloads before they reach Discord's API and reports the guild/channel for diagnosis.
- Added fallback to the original payload if localization unexpectedly removes all sendable content or embed styling fails.
- Added a 60-second runtime translation-provider cooldown after HTTP 429 / rate-limit responses to prevent repeated requests while providers are throttling.
- Updated regression tests to assert the new single-localization and empty-payload guard behavior.

## Preservation
- No database file or `.env` file is included or modified.
- Existing Slash command definitions and registration logic are unchanged.
- Prefix command set remains the same; this patch does not claim that all 94 Slash commands are now Prefix-enabled.

## Verification
- `node --check src/index.js`: passed
- `node --check src/i18n.js`: passed
- `node --check scripts/i18n-completion.test.js`: passed
- `npm test`: 139 passed, 0 failed
- Live Discord/API test: not performed in this environment.
