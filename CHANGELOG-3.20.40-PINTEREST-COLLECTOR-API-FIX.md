# IM YOUR DADDY BOT 3.20.40 — Pinterest collector API fix

- Connected the one-time `/image-collect` flow to the existing `PINTEREST_ACCESS_TOKEN` / Pinterest API integration.
- Pinterest Pin URLs now use the API for their original image variants when the token is configured. A single Pin still represents one image, not a gallery.
- Pinterest search URLs (`/search/pins/?q=...`) can return multiple Pins and are suitable as automatic image catalog sources.
- Existing non-Pinterest public-page extraction remains unchanged.
- API authentication, permission, and rate-limit errors are surfaced instead of being hidden behind a generic download error.
- No database schema or stored feed data was intentionally changed.

## Important limitations

- A Pin URL is a single Pin. To collect many images, use a Pinterest search URL, then configure it with `/image-catalog-add` and select the target category, channel, and interval.
- Category matching on Pinterest depends primarily on the search query because Pinterest CDN image URLs often do not contain category words. Use a matching query such as `boys` for a boys channel and `girls` for a girls channel.
- Actual API access still depends on the token being valid and the Pinterest app having the required read permissions.
