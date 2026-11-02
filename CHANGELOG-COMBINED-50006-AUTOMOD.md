# Combined repair package

This package combines the root-layout 50006 empty-message guard/localization payload fix with native Discord AutoMod rule-management commands.

## AutoMod commands
- `/automod list-bot-rules` — list rules whose Discord creator ID matches this bot.
- `/automod remove-rule` — delete one supported named rule only when created by this bot.
- `/automod remove-bot-rules confirm:DELETE` — delete rules created by this bot in the current server after explicit confirmation.

Existing AutoMod setup commands are retained. Rules created by other bots or administrators are not targeted.

## Safety notes
- ZIP contents use project-root paths (`src/`, `scripts/`, `package.json`), not an extra nested `imyfix/` folder.
- Do not overwrite or delete `.env` or the live database. Keep a backup of the current project before replacing source files.
- Static checks and automated tests passed in the build environment. A live Discord server/API runtime test has not been performed as part of packaging.
