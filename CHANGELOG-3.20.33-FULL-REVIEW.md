# IMYD 3.20.33 — Full review pass

- Kept the startup alias compatibility fix: slash command aliases serialize JSON directly rather than calling `SlashCommandBuilder.from()`.
- Preserved both canonical image commands and compatibility aliases, with routing normalized through `canonicalCommandName`. `/image-source` and `/image-collect` now keep those exact names even when the server language is Arabic; the aliases remain available separately.
- Added a per-server, per-category Islamic-content review acknowledgement. The database migration adds `content_approved` with a safe default of 0 and preserves all existing settings.
- Added `/islamic review-category` with an explicit confirmation boolean. The command records that the server administrator reviewed the source, wording/translation, and reuse rights; it does not claim automatic religious verification. Setting confirm=false withdraws approval and stops that category.
- `/islamic enable`, `/islamic post-now`, and the scheduler now respect the category's stored approval. Status reports show whether review approval is recorded.
- Successful scheduled or manual publishing stores the current local-date key after the send succeeds, so manual publication also suppresses an accidental same-day scheduled duplicate.
- Existing SQLite database and settings are retained; no destructive reset or mass deletion is performed.

## Verification

Run `npm test` on Node.js 22. This validates syntax and the bundled automated tests. Discord live registration, real channel permissions, and external provider delivery still require a deployment smoke test with the bot online.
