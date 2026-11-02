'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { polishEmbedPayload } = require('../src/embed-style');

test('modern embed styling applies vivid blue and branded footer without losing links/images/components', () => {
  const payload = { content: 'hello', components: [{ type: 1 }], embeds: [{ color: 0x5865F2, title: '  Example  ', description: 'Body', url: 'https://example.com', image: { url: 'https://example.com/image.png' }, fields: [{ name: 'A', value: 'B' }] }] };
  const result = polishEmbedPayload(payload, 'guild-id', 'My Server');
  assert.equal(result.embeds[0].color, 0x3B82F6);
  assert.equal(result.embeds[0].title, 'Example');
  assert.match(result.embeds[0].footer.text, /IM YOUR DADDY/);
  assert.match(result.embeds[0].footer.text, /My Server/);
  assert.equal(result.embeds[0].url, 'https://example.com');
  assert.equal(result.embeds[0].image.url, 'https://example.com/image.png');
  assert.equal(result.components, payload.components);
});

test('embed styling preserves intentional status colors and enforces Discord embed limits', () => {
  const fields = Array.from({ length: 30 }, (_, i) => ({ name: `Field ${i}`, value: 'x'.repeat(1500) }));
  const result = polishEmbedPayload({ embeds: [{ color: 0x2ECC71, title: 'T'.repeat(400), description: 'D'.repeat(5000), fields }] });
  const e = result.embeds[0];
  assert.equal(e.color, 0x2ECC71);
  assert.equal(e.title.length, 256);
  assert.equal(e.description.length, 4096);
  assert.ok(e.fields.length <= 25);
  const total = e.title.length + e.description.length + e.footer.text.length + (e.author?.name.length || 0) + e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  assert.ok(total <= 6000);
});

test('non-embed payloads are returned unchanged', () => {
  const payload = { content: 'plain response' };
  assert.equal(polishEmbedPayload(payload), payload);
});
