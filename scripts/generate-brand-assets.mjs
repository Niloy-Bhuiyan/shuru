/**
 * Brand asset generator — app icons and the Open Graph card.
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT AS COMMITTED-ONCE BINARIES.
 * The mark is `src/components/PixelSun.tsx`, which is drawn in code. Icons
 * hand-exported from an image editor drift from the component the moment
 * anyone touches the palette; everything here is derived from the same
 * geometry and the same tailwind.config.ts colours, so regenerating is how
 * they stay honest.
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * Deliberately dependency-free. The art is a half-disc, five capsules and a
 * rule, which is little enough geometry that owning an image library costs
 * more than writing the PNG by hand.
 *
 * The previous version drew pixel art and could get away with filling whole
 * rectangles. Curves cannot: an aliased half-disc looks like a staircase at
 * 512px. Every shape is therefore sampled at 4×4 subpixels per output pixel
 * and blended by coverage, which is what antialiasing is.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Straight from tailwind.config.ts. Kept as literals because this script runs
// outside the bundler and cannot import the TS config.
const WHITE = [0xff, 0xff, 0xff];
const INK = [0x0f, 0x17, 0x2a];
const AMBER = [0xea, 0x58, 0x0c];
const LINE = [0xe2, 0xe8, 0xf0];

// ── minimal PNG writer ──────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode an RGB pixel buffer (w*h*3) as an opaque 8-bit truecolour PNG. */
function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  // 10..12 = compression, filter, interlace — all zero.

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const src = y * width * 3;
    const dst = y * (1 + width * 3);
    raw[dst] = 0;
    rgb.copy(raw, dst + 1, src, src + width * 3);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── shapes, in unit space ───────────────────────────────────────────────────

/** Upper half of a disc — the sun as it clears the horizon. */
const halfDisc = (cx, cy, r) => (x, y) =>
  y <= cy && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** A thick line segment with round caps. Distance-to-segment, thresholded. */
const capsule = (x1, y1, x2, y2, w) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const hw = w / 2;
  return (x, y) => {
    let t = ((x - x1) * dx + (y - y1) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x1 + t * dx - x;
    const py = y1 + t * dy - y;
    return px * px + py * py <= hw * hw;
  };
};

/**
 * A canvas that composites shapes by coverage.
 *
 * `SS` subpixels per axis. 4 is the point where the half-disc edge stops
 * reading as steps at 512px; 8 costs four times as much for no visible gain.
 */
const SS = 4;

function canvas(width, height, fill) {
  const buf = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    buf[i * 3] = fill[0];
    buf[i * 3 + 1] = fill[1];
    buf[i * 3 + 2] = fill[2];
  }
  return {
    width,
    height,
    /** Paint `colour` wherever `inside(x, y)` holds, in unit space. */
    paint(inside, colour, scale, ox = 0, oy = 0) {
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          let hits = 0;
          for (let sy = 0; sy < SS; sy++) {
            for (let sx = 0; sx < SS; sx++) {
              const ux = (px + (sx + 0.5) / SS - ox) / scale;
              const uy = (py + (sy + 0.5) / SS - oy) / scale;
              if (inside(ux, uy)) hits++;
            }
          }
          if (!hits) continue;
          const a = hits / (SS * SS);
          const i = (py * width + px) * 3;
          for (let c = 0; c < 3; c++) {
            buf[i + c] = Math.round(buf[i + c] * (1 - a) + colour[c] * a);
          }
        }
      }
    },
    toPng() {
      return encodePng(width, height, buf);
    },
  };
}

// ── the mark ────────────────────────────────────────────────────────────────

/*
 * On a 64-unit grid, matching the proportions of PixelSun's redrawn arc: a
 * half-disc sitting on a horizon at y=42, five rays set back from the edge.
 */
const GRID = 64;
const HORIZON_Y = 42;
const SUN_R = 17;
const RAY_W = 3.4;

const RAYS = [
  [32, 8, 32, 15], // above
  [15.5, 15.5, 20.5, 20.5], // upper left
  [48.5, 15.5, 43.5, 20.5], // upper right
  [7, 36, 13, 36], // left
  [57, 36, 51, 36], // right
];

/** Draw the square mark at `size` px onto a fresh canvas. */
function drawIcon(size, { bg = INK, rule = LINE, inset = 0 } = {}) {
  const c = canvas(size, size, bg);
  // `inset` shrinks the artwork inside the tile for maskable icons, where a
  // launcher may crop anything outside the middle 60%.
  const art = size * (1 - inset * 2);
  const scale = art / GRID;
  const off = (size - art) / 2;

  for (const [x1, y1, x2, y2] of RAYS) {
    c.paint(capsule(x1, y1, x2, y2, RAY_W), AMBER, scale, off, off);
  }
  c.paint(halfDisc(32, HORIZON_Y, SUN_R), AMBER, scale, off, off);
  c.paint(capsule(9, HORIZON_Y + 2, 55, HORIZON_Y + 2, 3.2), rule, scale, off, off);
  return c;
}

/*
 * Open Graph card, 1200x630.
 *
 * Deliberately wordless. The bitmap "SHURU" the old card carried was pixel
 * lettering, which no longer belongs, and this script has no font rasteriser
 * to set it in Inter instead. Every platform that renders this image also
 * renders `metadata.description` directly beneath it, so the name and the
 * sentence both still reach the reader — putting them in the picture too was
 * always the same words twice.
 */
function drawOpenGraph() {
  const W = 1200;
  const H = 630;
  const c = canvas(W, H, WHITE);

  // Positioned by where the horizon lands rather than by centring the mark:
  // the line is the strongest element on the card, and sitting it a little
  // below centre is what makes the space beneath read as ground rather than
  // as a margin nobody filled.
  const markSize = 430;
  const scale = markSize / GRID;
  const ox = (W - markSize) / 2;
  const oy = H * 0.63 - (HORIZON_Y + 2) * scale;

  for (const [x1, y1, x2, y2] of RAYS) {
    c.paint(capsule(x1, y1, x2, y2, RAY_W), AMBER, scale, ox, oy);
  }
  c.paint(halfDisc(32, HORIZON_Y, SUN_R), AMBER, scale, ox, oy);

  // The horizon runs the full width of the card rather than the width of the
  // mark, so the sun reads as rising out of the card instead of floating.
  c.paint(
    capsule(-400, HORIZON_Y + 2, 500, HORIZON_Y + 2, 2.6),
    INK,
    scale,
    ox,
    oy
  );
  return c;
}

/** The favicon, as vector — a tab icon has to survive 16px and a 3x display. */
function iconSvg() {
  const hex = (c) => `#${c.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}">`,
    `  <rect width="${GRID}" height="${GRID}" rx="12" fill="${hex(INK)}"/>`,
    `  <g stroke="${hex(AMBER)}" stroke-width="${RAY_W}" stroke-linecap="round">`,
    ...RAYS.map(([x1, y1, x2, y2]) => `    <path d="M${x1} ${y1}L${x2} ${y2}"/>`),
    `  </g>`,
    `  <path d="M${32 - SUN_R} ${HORIZON_Y}a${SUN_R} ${SUN_R} 0 0 1 ${SUN_R * 2} 0Z" fill="${hex(AMBER)}"/>`,
    `  <path d="M9 ${HORIZON_Y + 2}h46" stroke="${hex(LINE)}" stroke-width="3.2" stroke-linecap="round"/>`,
    `</svg>`,
    "",
  ].join("\n");
}

// ── emit ────────────────────────────────────────────────────────────────────

writeFileSync(join(ROOT, "src/app/icon.svg"), iconSvg());
console.log(`${"src/app/icon.svg".padEnd(34)} ${GRID}x${GRID} grid (vector)`);

const outputs = [
  ["src/app/apple-icon.png", drawIcon(180)],
  ["src/app/opengraph-image.png", drawOpenGraph()],
  ["public/icon-192.png", drawIcon(192)],
  ["public/icon-512.png", drawIcon(512)],
  // Maskable: pulled into the safe zone, since a launcher may crop to a circle.
  ["public/icon-512-maskable.png", drawIcon(512, { inset: 0.2 })],
];

for (const [rel, c] of outputs) {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  const png = c.toPng();
  writeFileSync(path, png);
  console.log(`${rel.padEnd(34)} ${c.width}x${c.height}  ${png.length} bytes`);
}
