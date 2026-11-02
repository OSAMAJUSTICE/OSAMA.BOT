# 3.20.38 — Islamic automation and prayer-location scheduling

- Catalog setup now enables every configured Islamic category automatically; per-category manual review activation is no longer required.
- Added persistent per-category post timestamps and check timestamps with safe database migrations; existing rows/settings are preserved.
- Quran, hadith, adhkar, dua, benefits, tasbeeh, salawat, names, seerah and mushaf categories use independent 30-minute minimum intervals. The scheduler checks every 10 seconds and does not burst missed posts after downtime.
- Quran video feeds are checked no more than once per 30 minutes and only a newly-seen video is posted.
- Prayer timetable is refreshed once per local day using the configured city, country, timezone and calculation method. Country defaults are provided for common locations; an explicit IANA timezone is required when the country timezone is ambiguous or unknown.
- Ramadan countdown remains daily.
- Existing channel IDs, guild settings, last video IDs and existing database are retained. New columns are added by migration.
