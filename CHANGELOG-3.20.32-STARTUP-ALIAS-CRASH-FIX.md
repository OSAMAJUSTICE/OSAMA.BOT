# IMYD 3.20.32 — Startup alias crash fix

## Fixed
- Fixed startup crash in `src/commands.js` caused by calling `SlashCommandBuilder.from()`, which is not available on the installed `discord.js` builder class.
- Image compatibility aliases (`image-sources` and `collect-images`) now clone the source command's JSON payload for REST registration instead of attempting to construct a builder through the unavailable static method.
- Original `/image-source` and `/image-collect` commands and their handlers are unchanged.

## Validation performed
- `node scripts/check.js` passed: 98 unique slash commands declared and 72 JavaScript files passed syntax checks.
- `node --test scripts/*.test.js` passed: 149 tests, 0 failures.
- Full live Discord registration/login test was not performed in this environment. Deploy and verify startup logs and command visibility on Reviactyl.
