// SHA-256 integrity of the approved HTML pages and of the protected shared CSS/JS.
// Detects any byte change against baseline/integrity.json (recorded from the approved pre-CMS state).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MANIFEST, QA_ROOT } = require('../lib/common');
const { SITE_ROOT } = require('../lib/server');

const BASELINE = path.join(QA_ROOT, 'baseline', 'integrity.json');
// Protected shared code: custom GDECOM scripts/styles and the WordPress/Elementor runtime the pages depend on.
const PROTECTED_DIRS = ['assets/gdecom', 'assets/wp-content/plugins', 'assets/wp-content/themes', 'assets/wp-includes', 'assets/wp-content/uploads/elementor/css'];

function walk(rel) {
	const abs = path.join(SITE_ROOT, rel);
	if (!fs.existsSync(abs)) return [];
	return fs.readdirSync(abs).flatMap((f) => {
		const r = rel + '/' + f;
		return fs.statSync(path.join(SITE_ROOT, r)).isDirectory() ? walk(r) : [r];
	});
}

function currentHashes() {
	const files = [...MANIFEST.map((p) => p.file), ...PROTECTED_DIRS.flatMap(walk).filter((f) => /\.(css|js)$/i.test(f))];
	const out = {};
	for (const f of [...new Set(files)].sort()) out[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(SITE_ROOT, f))).digest('hex');
	return out;
}

async function run(R) {
	if (!fs.existsSync(BASELINE)) return R.check('integrity baseline exists', false, 'baseline/integrity.json missing - run npm run baseline:record');
	const was = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).files;
	const now = currentHashes();
	const changed = Object.keys(was).filter((f) => now[f] && now[f] !== was[f]);
	const missing = Object.keys(was).filter((f) => !now[f]);
	const added = Object.keys(now).filter((f) => !was[f]);
	const html = Object.keys(was).filter((f) => f.endsWith('.html'));
	R.check(`approved HTML pages unchanged (${html.length} files, SHA-256)`, !changed.some((f) => f.endsWith('.html')) && !missing.some((f) => f.endsWith('.html')), changed.filter((f) => f.endsWith('.html')));
	const code = Object.keys(was).filter((f) => !f.endsWith('.html'));
	R.check(`protected shared CSS/JS unchanged (${code.length} files, SHA-256)`, !changed.some((f) => !f.endsWith('.html')) && !missing.some((f) => !f.endsWith('.html')), { changed: changed.filter((f) => !f.endsWith('.html')), missing });
	R.check('no unexpected new protected CSS/JS files', added.length === 0, added);
}

function recordBaseline() {
	const files = currentHashes();
	fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
	fs.writeFileSync(BASELINE, JSON.stringify({ algorithm: 'sha256', files }, null, 1));
	return files;
}

module.exports = { run, recordBaseline };
