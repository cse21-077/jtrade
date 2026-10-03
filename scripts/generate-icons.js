import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgPath = path.resolve('public', 'icon.svg');
const svgBuffer = fs.readFileSync(svgPath);

// Maskable SVG has full bleed canvas (no rounded corners on rect) so Android can mask it to any shape (circle, squircle, teardrop)
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <!-- Full bleed white background -->
  <rect width="512" height="512" fill="#ffffff"/>
  
  <!-- Mascot placed well inside the 80% safe zone (radius < 205) -->
  <circle cx="256" cy="275" r="150" fill="#fbcfe8" stroke="#0f172a" stroke-width="11"/>
  
  <!-- Mascot Curly J Hair Swoop -->
  <path d="M 220 145 C 220 85 260 55 290 40 C 305 32 318 56 288 75 C 260 92 246 115 246 148" stroke="#0f172a" stroke-width="11" stroke-linecap="round" fill="none"/>
  
  <!-- Eyes -->
  <circle cx="210" cy="255" r="11" fill="#0f172a"/>
  <circle cx="302" cy="255" r="11" fill="#0f172a"/>
  
  <!-- Blush Cheeks -->
  <circle cx="186" cy="285" r="16" fill="#f472b6" fill-opacity="0.35"/>
  <circle cx="326" cy="285" r="16" fill="#f472b6" fill-opacity="0.35"/>
  
  <!-- Cute Nose -->
  <path d="M 252 272 V 286 H 261" stroke="#0f172a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  
  <!-- Gentle Smile -->
  <path d="M 205 312 Q 256 362 307 312" stroke="#0f172a" stroke-width="11" stroke-linecap="round" fill="none"/>
</svg>
`;

async function generate() {
  console.log('Generating launcher icons with mascot...');

  // 1. pwa-512x512.png
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public', 'pwa-512x512.png'));
  console.log('Generated pwa-512x512.png');

  // 2. pwa-192x192.png
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve('public', 'pwa-192x192.png'));
  console.log('Generated pwa-192x192.png');

  // 3. apple-touch-icon.png (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.resolve('public', 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // 4. pwa-maskable-512x512.png
  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public', 'pwa-maskable-512x512.png'));
  console.log('Generated pwa-maskable-512x512.png');

  // 5. favicon.ico (as 48x48 PNG or ICO)
  await sharp(svgBuffer)
    .resize(48, 48)
    .png()
    .toFile(path.resolve('public', 'favicon.ico'));
  console.log('Generated favicon.ico');

  console.log('All launcher icons generated successfully!');
}

generate().catch(console.error);
