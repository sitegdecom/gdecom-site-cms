// Static checks on the HTML files (no browser): pages, references, links, headings, robots, privacy rules.
'use strict';
const fs = require('fs');
const path = require('path');
const { MANIFEST, QA_ROOT } = require('../lib/common');
const { SITE_ROOT } = require('../lib/server');

const BASELINE = path.join(QA_ROOT, 'baseline', 'structure.json');
const PRIVACY_FOOTER_TARGET = 'politica-de-privacidade/index.html';

const stripComments = (h) => h.replace(/<!--[\s\S]*?-->/g, '');
const attr = (tag, name) => { const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i')); return m ? (m[2] !== undefined ? m[2] : m[3]) : null; };
const isExternal = (u) => /^(https?:|\/\/|mailto:|tel:|data:|javascript:|#)/i.test(u);

// Resolve a reference found in `pageFile` to a file on disk (relative or root-absolute).
function resolveRef(pageFile, ref) {
	const clean = decodeURI(ref.split('#')[0].split('?')[0]);
	if (!clean) return path.join(SITE_ROOT, pageFile);
	let f = clean.startsWith('/') ? path.join(SITE_ROOT, clean) : path.join(SITE_ROOT, path.dirname(pageFile), clean);
	if (clean.endsWith('/') || (fs.existsSync(f) && fs.statSync(f).isDirectory())) f = path.join(f, 'index.html');
	return f;
}

function collectPage(entry) {
	const file = path.join(SITE_ROOT, entry.file);
	const raw = fs.readFileSync(file, 'utf8');
	const h = stripComments(raw);
	const noScripts = h.replace(/<script\b[\s\S]*?<\/script>/gi, '');
	const refs = new Set();
	for (const m of noScripts.matchAll(/<[a-z][^>]*>/gi)) {
		const tag = m[0];
		for (const a of ['src', 'href', 'poster', 'data-src']) { const v = attr(tag, a); if (v && !isExternal(v)) refs.add(v); }
		const ss = attr(tag, 'srcset'); if (ss) for (const c of ss.split(',')) { const u = c.trim().split(/\s+/)[0]; if (u && !isExternal(u)) refs.add(u); }
	}
	for (const m of noScripts.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) if (!isExternal(m[1])) refs.add(m[1]);
	const ids = {};
	for (const m of noScripts.matchAll(/<[a-z][^>]*\sid\s*=\s*["']([^"']+)["']/gi)) ids[m[1]] = (ids[m[1]] || 0) + 1;
	const headings = [...noScripts.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => 'h' + m[1] + ':' + m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
	const imgs = [...noScripts.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
	const robots = (h.match(/<meta\s+name=["']robots["']\s+content=["']([^"']*)["']/i) || [])[1] || null;
	const links = [...noScripts.matchAll(/<a\b[^>]*>/gi)].map((m) => attr(m[0], 'href')).filter((v) => v !== null);
	const footer = (h.match(/<a class="footer-privacidade" href="([^"]+)">Política de Privacidade<\/a>/) || [])[1] || null;
	const mainText = (h.split(/<main\b/)[1] || '').split('</main>')[0].replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
	return {
		raw, refs: [...refs].sort(), ids, headings, imgs, robots, links, footer, mainText,
		imgCount: imgs.length, srcsetCount: imgs.filter((t) => attr(t, 'srcset')).length,
		canonical: /<link[^>]+rel=["']canonical["']/i.test(h), ogUrl: /property=["']og:url["']/i.test(h)
	};
}

function structureOf(entry, d) {
	return { headings: d.headings, refs: d.refs, imgCount: d.imgCount, srcsetCount: d.srcsetCount, robots: d.robots };
}

async function run(R) {
	const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
	if (!baseline) R.note('structure baseline', 'baseline/structure.json not found - structure comparison skipped');
	for (const entry of MANIFEST) {
		const id = entry.id;
		const exists = fs.existsSync(path.join(SITE_ROOT, entry.file));
		if (!R.check(`[${id}] page file exists`, exists, entry.file)) continue;
		const d = collectPage(entry);

		const missing = d.refs.filter((r) => !fs.existsSync(resolveRef(entry.file, r)));
		R.check(`[${id}] all local references resolve (${d.refs.length})`, missing.length === 0, missing);

		const badLinks = [];
		for (const href of d.links) {
			if (/^(https?:|\/\/|mailto:|tel:|javascript:)/i.test(href)) continue;
			const [p, hash] = href.split('#');
			if (!p) { if (hash && !d.ids[hash]) badLinks.push(href); continue; }
			const target = resolveRef(entry.file, p);
			if (!fs.existsSync(target)) { badLinks.push(href); continue; }
			if (hash && target.endsWith('.html')) {
				const t = fs.readFileSync(target, 'utf8');
				if (!new RegExp('\\sid=["\']' + hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']').test(t)) badLinks.push(href);
			}
		}
		R.check(`[${id}] internal links and anchors resolve (${d.links.length} links)`, badLinks.length === 0, badLinks);

		const h1 = d.headings.filter((x) => x.startsWith('h1:')).length;
		R.check(`[${id}] H1 count = ${entry.h1}`, h1 === entry.h1, 'found ' + h1);
		const dup = Object.entries(d.ids).filter(([, n]) => n > 1).map(([k, n]) => k + '×' + n);
		R.check(`[${id}] no duplicate IDs`, dup.length === 0, dup);
		const levels = d.headings.map((x) => +x[1]); const skips = [];
		for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) skips.push(d.headings[i - 1] + ' -> ' + d.headings[i]);
		R.check(`[${id}] no heading skips`, skips.length === 0, skips);
		const noAlt = d.imgs.filter((t) => attr(t, 'alt') === null).map((t) => attr(t, 'src'));
		R.check(`[${id}] every <img> has an alt attribute`, noAlt.length === 0, noAlt);

		R.check(`[${id}] robots = "${entry.robots}"`, d.robots === entry.robots, 'found ' + d.robots);
		R.check(`[${id}] no canonical / og:url (domain not configured)`, !d.canonical && !d.ogUrl, { canonical: d.canonical, ogUrl: d.ogUrl });

		const expectedFooter = entry.id === '404' ? '/politica-de-privacidade/' : '../'.repeat(entry.file.split('/').length - 1) + PRIVACY_FOOTER_TARGET;
		R.check(`[${id}] footer Privacy Policy link -> ${expectedFooter}`, d.footer === expectedFooter && fs.existsSync(resolveRef(entry.file, d.footer)), 'found ' + d.footer);

		if (entry.id === 'privacidade') {
			const dateRe = /(última atualização|atualizad[ao] em|publicad[ao] em|data da última|início desta página|\b\d{1,2}º? de (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de \d{4})/i;
			R.check('[privacidade] no visible update/publication date or reference to one', !dateRe.test(d.mainText), (d.mainText.match(dateRe) || [])[0]);
		}

		if (baseline && baseline[id]) {
			const now = structureOf(entry, d), was = baseline[id];
			R.check(`[${id}] headings match baseline`, JSON.stringify(now.headings) === JSON.stringify(was.headings), { now: now.headings.length, baseline: was.headings.length });
			const added = now.refs.filter((r) => !was.refs.includes(r)), removed = was.refs.filter((r) => !now.refs.includes(r));
			R.check(`[${id}] local references match baseline`, !added.length && !removed.length, { added, removed });
			R.check(`[${id}] image / srcset counts match baseline (${was.imgCount}/${was.srcsetCount})`, now.imgCount === was.imgCount && now.srcsetCount === was.srcsetCount, { now: [now.imgCount, now.srcsetCount] });
		}
	}
}

function recordBaseline() {
	const out = {};
	for (const entry of MANIFEST) out[entry.id] = structureOf(entry, collectPage(entry));
	fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
	fs.writeFileSync(BASELINE, JSON.stringify(out, null, 1));
	return out;
}

module.exports = { run, recordBaseline };
