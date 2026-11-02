# IMYD 3.20.28 — Slash-command sync hardening

- Avoids sending a Discord bulk-overwrite request when the guild already has the exact desired slash-command definitions.
- Keeps atomic bulk registration for actual command changes and stale-command cleanup.
- Raises the Discord REST request timeout to 60 seconds for large guild command sets.
- Keeps the existing 96-command definition set below Discord's 100 guild slash-command limit.
- Does not modify or delete the existing database, `.env`, server configuration, or user data.

## Validation
- `node scripts/check.js`: passed; 72 JavaScript files passed syntax validation and static configuration checks.
- Focused tests: 13 passed, 0 failed (command localization, Pinterest URL/image parsing and no-token status, slash-command synchronization checks).
- Full `npm test` could not be run in the build environment because `npm ci` did not finish before the install timeout.
- Live Discord slash registration and authenticated Pinterest API access require the user's live credentials and have not been verified by this package build.
