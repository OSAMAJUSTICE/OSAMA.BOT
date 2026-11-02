# IMYD 3.20.31 — Image Command Visibility Compatibility

- Preserves the original `/image-source` and `/image-collect` commands and their existing handlers.
- Adds `/image-sources` and `/collect-images` as compatibility aliases using identical options and behavior.
- Arabic server labels are provided for the aliases; both English and Arabic command names route to the original handlers.
- Guild sync now requires all four image command names in the desired, bulk-response, and independent read-back sets, and logs each one explicitly.
- No database schema, stored settings, environment values, or existing image-feed records are changed.
- Static validation and the full Node test suite pass (149 tests).
