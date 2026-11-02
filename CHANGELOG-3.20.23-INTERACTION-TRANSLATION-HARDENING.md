# IMYD 3.20.23 — Interaction & Translation Hardening

- Slash-command replies are acknowledged before runtime translation waits on external providers.
- Ephemeral replies keep their private visibility when the initial response is deferred.
- Runtime translation coalesces simultaneous requests for identical text/language pairs.
- Runtime translation concurrency is limited to reduce provider throttling during busy periods.
- Existing features, command definitions, automatic per-guild slash synchronization, and database behavior are preserved.
- Verification: `npm test` passed 136 tests, including new regression checks for early acknowledgement and translation request coalescing/concurrency.

This package does not include `.env` secrets or live database files. Keep the server's current `.env` and database when deploying.
