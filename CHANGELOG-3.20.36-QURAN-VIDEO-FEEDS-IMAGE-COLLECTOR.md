# IMYD 3.20.36 — trusted Quran video feeds

## Changes
- Quran video autopost now reads the public YouTube Atom feeds for the Saudi Broadcasting Corporation's official KSA Qur'an TV channel and the Al-Majd Quran channel. No YouTube API key or administrator-pasted video URL is required.
- The catalog setup enables the Quran video category automatically and stores the last posted video ID to avoid reposting the same upload.
- If both feeds are unavailable or return malformed data, the bot fails closed and does not publish a substitute or guessed video.
- Added a persistent `last_video_id` column migration to `islamic_settings`; existing settings and channels remain intact.
- Removed the obsolete manual `/islamic video-url` setup path.
- Existing image collection still accepts public HTTPS page links and extracts embedded image URLs; it does not perform computer-vision similarity matching, and sites that require login/JavaScript or block scraping may not be extractable.

## Verification
- `node --check` passed for the edited source files.
- Focused Islamic autopost and image extraction tests passed (see release validation).
- The YouTube channel identities were checked against public channel information. Live Atom-feed reachability and actual Discord posting could not be verified in this environment; the bot retries the next configured feed and fails closed if neither works.
- No database file is included in the ZIP.
