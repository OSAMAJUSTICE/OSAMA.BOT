# IMYD 3.20.23 — Prefix Add-on

- Added default `!` prefix commands while keeping the existing Slash command registration and interaction handlers.
- Added `!help` / `!commands`, `!ping`, `!serverinfo`, `!userinfo [@member]`, `!avatar [@member]`, and `!botinfo`.
- Kept existing `+` monitoring commands and configurable `#kick` / `#ban` / `#unban` moderation triggers.
- Uses the already-enabled Discord Message Content intent in the client configuration.
- No database schema changes and no `.env` or database files are included in this archive.
- Prefix support in this update covers the commands listed above; the remaining advanced commands continue to be available through Slash commands and are not automatically converted to Prefix commands.
