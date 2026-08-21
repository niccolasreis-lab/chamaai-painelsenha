import sharp from 'sharp';

const source = process.argv[2];
const destination = process.argv[3];
if (!source || !destination) throw new Error('Uso: node scripts/generate-tv-banner.mjs <origem> <destino>');

const overlay = Buffer.from(`
  <svg width="320" height="180" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="42" width="280" height="96" rx="18"
      fill="#020b18" fill-opacity="0.78" stroke="#2dd4bf" stroke-opacity="0.55"/>
    <text x="160" y="91" text-anchor="middle" fill="white"
      font-family="sans-serif" font-weight="800" font-size="31">ChamaAí</text>
    <text x="160" y="119" text-anchor="middle" fill="#5eead4"
      font-family="sans-serif" font-weight="700" font-size="15" letter-spacing="4">TELÃO</text>
  </svg>
`);

await sharp(source)
  .resize(320, 180, { fit: 'cover' })
  .composite([{ input: overlay }])
  .png({ compressionLevel: 9 })
  .toFile(destination);
