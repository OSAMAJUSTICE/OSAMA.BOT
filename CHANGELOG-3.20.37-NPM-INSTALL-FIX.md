# IMYD 3.20.37 — npm install reliability

- Added project `.npmrc` with `legacy-peer-deps=true` to prevent npm from trying to auto-install an optional `opusscript@^0.0.8` peer alongside the project's explicit `opusscript@^0.1.1` dependency.
- Disabled npm audit/funding network requests during ordinary installs; these are not required to install or run the bot.
- Added an explicit Reviactyl/Pterodactyl install procedure and guidance for allowing only required native/binary install scripts.
- Bumped package and lockfile root version to 3.20.37 without changing dependency versions or the database schema.

Validation limitation: external npm registry access failed with `EAI_AGAIN` in the build environment, so a full clean install could not be completed here. This release does not claim a verified successful `npm install` on the user's host.
