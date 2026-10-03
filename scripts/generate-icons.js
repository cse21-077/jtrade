import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng(size, isMaskable = false) {
  // RGBA raw scanlines: (1 + size * 4) bytes per row
  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(rowLen * size);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.44;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowLen;
    raw[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Light blue background: #0284c7 (2, 132, 199) or soft light blue gradient
      // Outer border / rounded rect or full bleed
      let bgR = 14, bgG = 165, bgB = 233; // Sky-500
      let bgA = 255;

      // Draw stylized "J" in white
      // J horizontal bar at top: y between 0.28*size and 0.36*size, x between 0.35*size and 0.68*size
      // J vertical bar: x between 0.52*size and 0.64*size, y between 0.28*size and 0.65*size
      // J bottom curve: center at (0.42*size, 0.65*size), radius around 0.16*size, angle from 0 to PI
      const nx = x / size;
      const ny = y / size;

      let isJ = false;
      // Top bar
      if (ny >= 0.26 && ny <= 0.34 && nx >= 0.36 && nx <= 0.68) {
        isJ = true;
      }
      // Vertical stem
      if (ny >= 0.28 && ny <= 0.64 && nx >= 0.52 && nx <= 0.64) {
        isJ = true;
      }
      // Hook
      const hookCx = 0.44;
      const hookCy = 0.64;
      const hdx = nx - hookCx;
      const hdy = ny - hookCy;
      const hDist = Math.sqrt(hdx * hdx + hdy * hdy);
      if (hDist >= 0.08 && hDist <= 0.20 && ny >= 0.60 && nx <= 0.64) {
        isJ = true;
      }
      // Hook tip
      if (nx >= 0.24 && nx <= 0.36 && ny >= 0.52 && ny <= 0.65) {
        isJ = true;
      }

      // Rounded app icon shape if not maskable
      if (!isMaskable) {
        // slight corner rounding
        const cornerR = size * 0.2;
        const cornerDx = Math.max(0, Math.abs(x - cx) - (cx - cornerR));
        const cornerDy = Math.max(0, Math.abs(y - cy) - (cy - cornerR));
        if (cornerDx * cornerDx + cornerDy * cornerDy > cornerR * cornerR) {
          bgA = 0;
        }
      }

      if (isJ && bgA > 0) {
        raw[pxOffset] = 255;     // R
        raw[pxOffset + 1] = 255; // G
        raw[pxOffset + 2] = 255; // B
        raw[pxOffset + 3] = 255; // A
      } else {
        // Gradient from light sky blue to vibrant cyan blue
        const t = (x + y) / (size * 2);
        const rVal = Math.round(2 + t * 40);
        const gVal = Math.round(132 + t * 30);
        const bVal = Math.round(199 + t * 40);
        raw[pxOffset] = rVal;
        raw[pxOffset + 1] = gVal;
        raw[pxOffset + 2] = bVal;
        raw[pxOffset + 3] = bgA;
      }
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createPng(48));

// Create SVG icon
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0284c7" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  <!-- Grid Trading Lines accent -->
  <path d="M64 128 H448 M64 256 H448 M64 384 H448" stroke="#ffffff" stroke-opacity="0.15" stroke-width="4" stroke-dasharray="8 8"/>
  <path d="M128 64 V448 M256 64 V448 M384 64 V448" stroke="#ffffff" stroke-opacity="0.15" stroke-width="4" stroke-dasharray="8 8"/>
  <!-- Bold Stylized J -->
  <path d="M184 144 H344 V196 H292 V328 C292 376 256 408 204 408 C156 408 128 376 128 336 H184 C184 352 192 364 206 364 C224 364 236 348 236 324 V196 H184 V144 Z" fill="#ffffff" filter="url(#glow)"/>
  <!-- Indicator Dots -->
  <circle cx="344" cy="144" r="16" fill="#67e8f9"/>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svg);
console.log('PWA icons created successfully.');
