const path = require('path');
const fs = require('fs');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const fontPath = path.join(__dirname, 'fonts', 'NotoSansArabic-Bold.ttf');
if (fs.existsSync(fontPath)) GlobalFonts.registerFromPath(fontPath, 'NotoArabic');
else console.warn('الخط غير موجود:', fontPath);

const FONT = '"NotoArabic", "Noto Sans Arabic", "Noto Sans", sans-serif';
const S = 400;
const C = S / 2;
const R = 152;
const SPIN_FRAMES = 84;
const SPIN_DELAY = 40;
const GLOW_FRAMES = 14;
const GLOW_DELAY = 60;
const HOLD_DELAY = 4500;
const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4'];
const LIGHTS = 28;
const tick = () => new Promise(r => setImmediate(r));

function colorOf(k, n) {
  let idx = k % COLORS.length;
  if (n > 1 && k === n - 1 && idx === 0) idx = Math.floor(COLORS.length / 2);
  return COLORS[idx];
}

function fitText(ctx, text, size, maxWidth) {
  let s = size;
  ctx.font = `bold ${s}px ${FONT}`;
  while (s > 8 && ctx.measureText(text).width > maxWidth) {
    s -= 1;
    ctx.font = `bold ${s}px ${FONT}`;
  }
  return s;
}

function draw(ctx, labels, rotation, opts = {}) {
  const n = labels.length;
  const step = (Math.PI * 2) / n;
  const { frame = 0, winner = -1, glow = 0 } = opts;

  ctx.fillStyle = '#16181d';
  ctx.fillRect(0, 0, S, S);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 5;
  ctx.beginPath();
  ctx.arc(C, C, R + 17, 0, Math.PI * 2);
  ctx.fillStyle = '#2b2f38';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(C, C, R + 17, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#d4af37';
  ctx.stroke();

  for (let k = 0; k < LIGHTS; k++) {
    const a = (k / LIGHTS) * Math.PI * 2;
    const on = (k + frame) % 2 === 0;
    ctx.beginPath();
    ctx.arc(C + Math.cos(a) * (R + 9), C + Math.sin(a) * (R + 9), 3.2, 0, Math.PI * 2);
    ctx.fillStyle = on ? '#fff3b0' : '#8a7a3a';
    ctx.fill();
  }

  for (let k = 0; k < n; k++) {
    const a0 = rotation + k * step;
    ctx.beginPath();
    ctx.moveTo(C, C);
    ctx.arc(C, C, R, a0, a0 + step);
    ctx.closePath();
    ctx.fillStyle = colorOf(k, n);
    ctx.fill();
  }

  if (n > 1) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(17,24,39,0.85)';
    for (let k = 0; k < n; k++) {
      const a = rotation + k * step;
      ctx.beginPath();
      ctx.moveTo(C, C);
      ctx.lineTo(C + Math.cos(a) * R, C + Math.sin(a) * R);
      ctx.stroke();
    }
  }

  const baseSize = n <= 6 ? 26 : n <= 10 ? 21 : n <= 16 ? 17 : n <= 30 ? 13 : 10;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (let k = 0; k < n; k++) {
    const text = labels[k].replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim() || labels[k];
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(rotation + (k + 0.5) * step);
    fitText(ctx, text, baseSize, R - 78);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(text, R - 16, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, R - 16, 0);
    ctx.restore();
  }

  if (winner >= 0) {
    for (let k = 0; k < n; k++) {
      if (k === winner) continue;
      const a0 = rotation + k * step;
      ctx.beginPath();
      ctx.moveTo(C, C);
      ctx.arc(C, C, R, a0, a0 + step);
      ctx.closePath();
      ctx.fillStyle = 'rgba(10,12,16,0.45)';
      ctx.fill();
    }
    const a0 = rotation + winner * step;
    ctx.beginPath();
    ctx.moveTo(C, C);
    ctx.arc(C, C, R, a0, a0 + step);
    ctx.closePath();
    ctx.lineWidth = 3 + glow * 3;
    ctx.strokeStyle = '#fff3b0';
    ctx.stroke();
  }

  const hub = ctx.createRadialGradient(C - 6, C - 6, 2, C, C, 30);
  hub.addColorStop(0, '#ffffff');
  hub.addColorStop(1, '#9ca3af');
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(C, C, 26, 0, Math.PI * 2);
  ctx.fillStyle = hub;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(C, C, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#d4af37';
  ctx.fill();

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = -2;
  ctx.beginPath();
  ctx.moveTo(C + R + 4, C);
  ctx.lineTo(C + R + 38, C - 17);
  ctx.lineTo(C + R + 38, C + 17);
  ctx.closePath();
  ctx.fillStyle = '#ef4444';
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(C + R + 4, C);
  ctx.lineTo(C + R + 38, C - 17);
  ctx.lineTo(C + R + 38, C + 17);
  ctx.closePath();
  ctx.stroke();
}

async function makeWheelGif(labels, winnerIndex) {
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const step = (Math.PI * 2) / labels.length;
  const final = -(winnerIndex + 0.5) * step + (Math.random() - 0.5) * step * 0.5;
  const start = final - Math.PI * 2 * (4 + Math.random() * 1.5);
  const gif = GIFEncoder();
  let first = true;

  const push = (delay, opts) => {
    const { data } = ctx.getImageData(0, 0, S, S);
    const palette = quantize(data, 256, { format: 'rgb444' });
    const index = applyPalette(data, palette);
    gif.writeFrame(index, S, S, first ? { palette, delay, repeat: -1 } : { palette, delay });
    first = false;
  };

  for (let f = 0; f < SPIN_FRAMES; f++) {
    const t = f / (SPIN_FRAMES - 1);
    const eased = 1 - Math.pow(1 - t, 4);
    draw(ctx, labels, start + (final - start) * eased, { frame: f });
    push(SPIN_DELAY);
    if (f % 6 === 5) await tick();
  }
  for (let f = 0; f < GLOW_FRAMES; f++) {
    const last = f === GLOW_FRAMES - 1;
    draw(ctx, labels, final, { frame: SPIN_FRAMES + f, winner: winnerIndex, glow: f % 2 });
    push(last ? HOLD_DELAY : GLOW_DELAY);
    if (f % 6 === 5) await tick();
  }

  gif.finish();
  return { buffer: Buffer.from(gif.bytes()), duration: SPIN_FRAMES * SPIN_DELAY + (GLOW_FRAMES - 1) * GLOW_DELAY };
}

module.exports = { makeWheelGif };
