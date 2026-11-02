# IMYD 3.20.23 — Prefix admin shortcut hardening

## Included
- Keeps the existing Slash command system and legacy `+` command handling.
- Keeps native `!` commands for help, ping, serverinfo, userinfo, avatar and botinfo.
- Adds server-wide `!shortcut` / `!shortcuts` management stored in the existing `guild_settings.settings_json` record; no new database or schema migration is required.
- Only users passing the existing `admin(member)` check can list, add, or remove shortcuts.
- Supported syntax: `!shortcut add <alias> <target>`, `!shortcut remove <alias>`, `!shortcut list`.
- Shortcut target validation only accepts commands actually implemented in the native `!` bridge, preventing shortcuts that point to Slash-only commands from appearing to work.
- Audits shortcut add/remove actions.

## Important limitation
This is not yet a complete all-94-commands Prefix port. The current codebase's command implementations are primarily routed through Discord interaction handlers and many require slash-only options, select menus, buttons, or attachments. Those need explicit message-command adapters and permission parity before claiming full Prefix coverage. Slash commands remain unchanged.

## Verification
- `npm test`: 139/139 tests passed locally.
- Static check passed: 94 unique Slash commands declared.
- Syntax check passed for 70 JavaScript files.
- No live Discord API or live server permission test was performed.
