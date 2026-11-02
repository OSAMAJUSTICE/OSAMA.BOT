'use strict';

// A single presentation layer for bot embeds. Keep this module pure so it can
// be tested without logging into Discord or opening the SQLite database.
const DEFAULT_BLUE = new Set([0x3446A8, 0x5865F2, 0x4D64FF]);
const BRAND = 'IM YOUR DADDY';
const MAX_EMBEDS = 10;
const MAX_TOTAL = 6000;
const MAX_TITLE = 256;
const MAX_DESCRIPTION = 4096;
const MAX_FIELD_NAME = 256;
const MAX_FIELD_VALUE = 1024;

function asPlain(value) {
  if (value && typeof value.toJSON === 'function') {
    try { return value.toJSON(); } catch { /* use the original object below */ }
  }
  return value && typeof value === 'object' ? { ...value } : {};
}
function safeText(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : value;
}
function embedTextSize(embed) {
  return (embed.title || '').length + (embed.description || '').length +
    (embed.footer?.text || '').length + (embed.author?.name || '').length +
    (embed.fields || []).reduce((sum, field) => sum + (field.name || '').length + (field.value || '').length, 0);
}
function polishEmbedPayload(payload, guildId = null, guildNameOverride = '') {
  if (!payload || typeof payload !== 'object') return payload;
  const source = asPlain(payload);
  if (!Array.isArray(source.embeds) || source.embeds.length === 0) return payload;
  const guildName = String(guildNameOverride || '').trim();
  const embeds = source.embeds.slice(0, MAX_EMBEDS).map((raw) => {
    const e = asPlain(raw);
    // Consistent vivid-blue accent for generic/legacy blue cards; preserve status colors.
    if (!Number.isInteger(e.color) || DEFAULT_BLUE.has(e.color)) e.color = 0x3B82F6;
    if (typeof e.title === 'string') e.title = safeText(e.title.trim(), MAX_TITLE);
    if (typeof e.description === 'string') e.description = safeText(e.description.trim(), MAX_DESCRIPTION);
    if (e.author && typeof e.author.name === 'string') e.author.name = safeText(e.author.name, 256);
    const oldFooter = typeof e.footer?.text === 'string' ? e.footer.text.trim() : '';
    const footerParts = [...new Set([BRAND, guildName, oldFooter].filter(Boolean))];
    e.footer = { ...(e.footer || {}), text: footerParts.join('  ·  ').slice(0, 2048) };
    if (!e.timestamp) e.timestamp = new Date().toISOString();
    // Discord allows at most 25 fields and 6,000 characters per embed.
    const fields = Array.isArray(e.fields) ? e.fields : [];
    e.fields = [];
    let used = embedTextSize(e);
    for (const rawField of fields.slice(0, 25)) {
      if (!rawField || typeof rawField.name !== 'string' || typeof rawField.value !== 'string') continue;
      const field = { ...rawField, name: rawField.name.slice(0, MAX_FIELD_NAME), value: rawField.value.slice(0, MAX_FIELD_VALUE) };
      const room = MAX_TOTAL - used;
      if (room < 8) break;
      const chars = field.name.length + field.value.length;
      if (chars > room) {
        const nameRoom = Math.min(field.name.length, Math.max(1, Math.floor(room * 0.25)));
        field.name = field.name.slice(0, nameRoom);
        field.value = field.value.slice(0, Math.max(1, room - field.name.length));
      }
      used += field.name.length + field.value.length;
      e.fields.push(field);
    }
    return e;
  });
  return { ...source, embeds };
}

module.exports = { polishEmbedPayload };
