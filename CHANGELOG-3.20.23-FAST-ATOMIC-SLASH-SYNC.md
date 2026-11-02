# IMYD 3.20.23 — Fast Atomic Slash Sync

- Replaced per-command sequential POST/PATCH/DELETE synchronization with one Discord guild-command bulk overwrite request per guild.
- This makes the desired slash-command set register atomically instead of exposing commands gradually while dozens of requests run.
- Preserves existing non-chat-input application commands in the bulk payload.
- Checks Discord's 100 chat-input-command guild limit before sending the update.
- Continues to localize command definitions per guild and stores command-definition fingerprints only after Discord accepts the bulk update.
- No `.env`, SQLite database, or user runtime data is included in this archive.

Validation: `npm test` passed (136 tests), including static checks for 94 unique slash commands and JavaScript syntax checks for 69 files.

Note: Discord client UI caching/refresh and API availability can still introduce a short delay; this change removes the bot's own delay caused by sending one request per command. It cannot guarantee that Discord displays every command instantly in every client.
