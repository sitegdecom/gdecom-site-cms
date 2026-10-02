// Derives assets/wp-content/uploads/2026/10/home/contato-comunidade.webp (Home "Encontre o GDECOM" community photo)
// from the approved visual reference design/reference/contato-inicial.png (repository only, not published).
// Crop = the photo area at the right of the reference card (x 995-1604, y 99-668 = 609x569 px). The bottom-left of that
// rectangle contains part of the rendered e-mail text and the white panel: it is painted white (it is also outside the
// curved clip used on the page), so the asset holds no raster text. The reference card's rounded top-right corner
// (navy outside it) is painted white too. Output: WebP q86, native crop size.
// Usage (repository root): node tools/assets/derive-contato-comunidade.js
'use strict';
const path = require('path');
const sharp = require('sharp');
const ROOT = path.join(__dirname, '..', '..');
const REFERENCE = path.join(ROOT, 'design', 'reference', 'contato-inicial.png');
const DIR = path.join(ROOT, 'assets', 'wp-content', 'uploads', '2026', '10', 'home');
const L = 995, T = 99, W = 609, H = 569;
(async () => {
	const crop = await sharp(REFERENCE).extract({ left: L, top: T, width: W, height: H }).toBuffer();
	const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="0" y="${560 - T}" width="${1250 - L}" height="${H}" fill="#fff"/><path d="M${W - 100},0 H${W} V100 A100,100 0 0 0 ${W - 100},0 Z" fill="#fff"/></svg>`);
	const out = path.join(DIR, 'contato-comunidade.webp');
	const info = await sharp(crop).composite([{ input: mask }]).webp({ quality: 86 }).toFile(out);
	console.log(path.relative(process.cwd(), out), info.width + 'x' + info.height, info.size + ' bytes');
})();
