# IMYD 3.20.29 — Image source visibility and extraction fallback

- Slash-command synchronization now explicitly checks that `/image-source` (English) or `/مصادر_الصور` (Arabic) is included in the assembled command definitions, exists in Discord before a no-op sync is accepted, and is present in Discord’s bulk-registration response.
- Startup logs identify the exact image-source command name per guild, making missing registration diagnosable instead of relying only on the total command count.
- Pinterest API failures (expired token, missing scope, rate limit, or temporary API/network error) no longer immediately prevent trying the public Pinterest page extraction path. The error is logged without exposing the token.
- Existing SSRF protections, HTTPS-only sources, image magic-byte validation, duplicate prevention, channel permissions, database tables, and scheduled feed behavior are retained.

## Validation

- `node --check` passed for every JavaScript file under `src/` and `scripts/`.
- Full built-in Node test suite: 149 tests passed.
- ZIP integrity checked after packaging.
- A live Discord command registration and live Pinterest download were not performed in this environment. Sites requiring login, browser JavaScript execution, or anti-bot bypass are not supported; use public pages or authorized APIs.
