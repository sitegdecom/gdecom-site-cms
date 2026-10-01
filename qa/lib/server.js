// Local static server for QA: serves the site root (the folder above qa/) the way a static host would.
// - a directory request serves its index.html
// - anything missing (or a non-site folder) returns /404.html with HTTP 404
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const SITE_ROOT = path.resolve(__dirname, '..', '..');
// Folders that exist in the repository but are not part of the website.
const NOT_SITE = ['/qa/', '/.git/', '/node_modules/', '/.playwright-mcp/', '/_archive_do_not_deploy/'];
const TYPES = {
	'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
	'.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
	'.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2'
};

function resolve(urlPath) {
	let p;
	try { p = decodeURIComponent(urlPath); } catch (e) { return null; }
	if (NOT_SITE.some((d) => (p + '/').startsWith(d))) return null;
	let f = path.join(SITE_ROOT, p);
	if (!f.startsWith(SITE_ROOT)) return null;
	if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
	return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
}

function start(port = 0) {
	const server = http.createServer((req, res) => {
		const urlPath = new URL(req.url, 'http://localhost').pathname;
		const file = resolve(urlPath);
		if (!file) {
			res.writeHead(404, { 'Content-Type': TYPES['.html'] });
			return fs.createReadStream(path.join(SITE_ROOT, '404.html')).pipe(res);
		}
		res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
		fs.createReadStream(file).pipe(res);
	});
	return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ server, origin: 'http://127.0.0.1:' + server.address().port })));
}

module.exports = { start, SITE_ROOT };

if (require.main === module) {
	const port = Number(process.env.PORT || 8765);
	start(port).then(({ origin }) => console.log('GDECOM QA server: ' + origin + '  (site root: ' + SITE_ROOT + ')'));
}
