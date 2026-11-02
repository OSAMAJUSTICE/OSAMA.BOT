# IMYD 3.20.39 — Quran video player preview

- Quran video posts now send the canonical YouTube watch URL as ordinary Discord message content instead of wrapping it in a custom embed.
- This allows Discord to generate its native YouTube player preview when the video/channel permits embedding and the target channel allows Embed Links.
- Video source discovery remains based on the two configured public YouTube Atom feeds; this change does not download, mirror, or re-upload copyrighted video files.
- Image collection code and database schema are unchanged in this release. Existing image tests are included in the full test run; real Pinterest/site extraction still depends on each site's public accessibility and cannot be guaranteed by unit tests.
- No database or user settings are included in the archive.
