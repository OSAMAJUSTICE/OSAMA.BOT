# IM YOUR DADDY Discord Bot — v3.20.28

This build has the **Quest announcement system and Lavalink music player removed**. The separate voice/media commands and Quran audio features are retained because they use the shared voice player and are not the Lavalink music system.

## Included systems

- Moderation, server management, permissions, audit/event logs, and server backups
- Welcome/goodbye, verification, autorole, temporary voice rooms, tickets, suggestions, anti-raid, and control panels
- Community games, roulette, and virtual economy
- Quran audio and Islamic auto-posting
- Image feeds, media-link voice playback, server-language settings, and translation
- One-command Islamic catalog setup via `/setup-islamic-catalog`; it creates/reuses category channels and automatically enables prayer times and Ramadan countdown. Other religious text/video categories remain guarded until their source, translation, and reuse rights are reviewed.

## Setup

1. Use Node.js 22.12 or newer.
2. Copy `.env.example` to `.env` and fill in your own Discord bot token and application ID. Never share `.env` or commit it.
3. Install dependencies with `npm install`.
4. Run `npm run check` and `npm test`.
5. Start with `npm start`.

The bot needs the appropriate Discord intents and permissions for the features enabled in your server. The dashboard requires Discord OAuth credentials if you want to use it. Quran and generic voice playback continue to rely on the shared voice/audio dependencies.

## Removed systems and data preservation

- Quest polling, announcements, Quest commands, Quest panel artwork, Quest-specific source modules, and Quest-specific tests are removed from the active application.
- Lavalink music startup, music player handlers, music panel artwork, and music-specific settings are removed from the active application.
- Existing deployed SQLite databases are not automatically deleted or destructively migrated. Legacy Quest tables already present in a database are left intact so their data is preserved.
- Generic voice commands and Quran audio are intentionally retained; do not delete `src/voice-player.js`, `@discordjs/voice`, or `ffmpeg-static`, because the remaining features use them.

## Before production

Static checks and automated tests cannot prove live Discord behavior. First test this build in a separate test server and keep a backup of the current project and SQLite database. Slash-command changes may require a successful command sync after startup. The registrar checks the 100 guild chat-input command limit, removes only stale commands owned by this application when needed, and reports a safe failure if there are not enough stale commands to free the required slots. It does not bulk-delete the guild command set.

## Native Discord AutoMod

The `/automod` command creates real Discord AutoMod rules (visible in **Server Settings → AutoMod**), rather than only using the bot's local message filter. The person running it needs **Manage Server** or **Administrator**, and the bot also needs **Manage Server**.

- `/automod setup-batch` — create up to 10 native AutoMod rules in the current server: six custom keyword categories plus the supported preset, spam-content, mention-spam, and member-profile rule types. Discord's per-trigger limits and the server's overall rule capacity still apply.
- `/automod progress` — count rules created by this bot that are currently readable across its accessible servers, and show the remaining number toward 100. Servers whose rules cannot be read are reported separately.
- `/automod flagged-words` — enable Discord's preset filters for commonly flagged words.
- `/automod keyword word:<text>` — add a custom word or phrase to the general keyword rule.
- `/automod mention-spam limit:<2–50>` — block messages that exceed the selected mention limit (defaults to 5).
- `/automod spam-messages` — block messages Discord detects as spam.

The batch command never deletes existing rules. It distinguishes rules already present, trigger-type limits, total-server limits, and actual Discord API failures. It counts a new rule only after Discord returns the created rule. Review the keyword lists and actions in **Server Settings → AutoMod** before using these templates in a production community. The 100-rule counter is an estimate of bot-created rules the bot can currently read; Discord alone determines badge eligibility and when a badge appears.


## Version 3.20.14 — Organized Help Panel
- Reworked `/help` into a categorized, Arabic-labeled embed with an interactive dropdown, matching the requested screenshot layout.
- The menu updates the same message and organizes registered commands across moderation, roles, server panels, protection, automod, voice, levels, community, media, information, Islamic features, and bot utilities.
- Existing command handlers and database files are unchanged.

## Translation connectivity diagnosis (3.20.19)

Run `npm run diagnose:i18n` from the same Reviactyl/Codnex container that runs the bot. It checks DNS resolution for `api.mymemory.translated.net` and sends live English-to-Arabic and Arabic-to-English test requests. A PASS from a different computer does not prove the hosting container can reach the service. If DNS fails, copy the full output and contact the host about container DNS/outbound HTTPS; do not hard-code the API IP.

Runtime translation now avoids the old 250ms race that silently returned untranslated payloads, uses a longer request timeout, and splits translation requests by UTF-8 bytes (MyMemory documents a 500-byte query maximum). Automated tests mock provider responses; only `npm run diagnose:i18n` on the target host proves live provider connectivity. MyMemory's anonymous quota is limited, so high-volume use may still receive rate/quota errors.


## Version 3.20.28 — Pinterest-aware image sources

- Optional Pinterest API integration reads `PINTEREST_ACCESS_TOKEN` from the root `.env` file. It supports Pinterest Pin URLs and Pinterest Pins search URLs when the app token has the required access.
- `/image-source` provides `list`, `status`, `edit`, `pause`, `resume`, and `remove`. Use `/image-catalog-add` to create a source; the existing catalog commands remain available.
- Added the `anime` source category and source scan/post statistics.
- The API integration does not bypass Pinterest login, access tiers, privacy controls, or anti-bot restrictions. A token can be valid but still receive HTTP 403 if its app lacks permission to read Pins. Live API access must be verified on the host; never share the token.
- Keep the real `.env` file private. `.env.example` is a template only.
