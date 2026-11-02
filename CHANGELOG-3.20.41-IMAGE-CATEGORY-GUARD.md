# IMYD 3.20.41 — Image category matching hardening

- Pinterest search feeds now verify that the Pinterest search query matches the configured category before treating opaque `i.pinimg.com` URLs as category-specific.
- Prevents a Pinterest `girls` search from being silently posted into a `boys` feed (and vice versa) when CDN image filenames contain no category clues.
- Supports English and Arabic category query terms, plus GIF/banner searches.
- Preserves the existing per-feed scheduling, multi-image batches, and content-hash duplicate protection.
- Does not add computer-vision classification: Pinterest search relevance is still provided by Pinterest, and non-Pinterest sites may expose insufficient metadata for reliable gender/category classification.
