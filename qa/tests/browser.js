// Rendering checks over HTTP: 14 pages x 6 viewports.
// Status, console, failed requests, overflow, broken images, H1/headings, plus layout baseline
// (page height, image boxes, chosen srcset candidate) compared against baseline/layout.json.
'use strict';
const fs = require('fs');
const path = require('path');
const { MANIFEST, VIEWPORTS, QA_ROOT, contextOptions, loadEverything, isExpectedConsole, isLocal, wait } = require('../lib/common');

const BASELINE = path.join(QA_ROOT, 'baseline', 'layout.json');
const TOL = 2; // px tolerance for heights/positions (sub-pixel rounding)

async function measure(browser, origin, entry, vp) {
	const ctx = await browser.newContext(contextOptions(vp));
	const page = await ctx.newPage();
	const consoleMsgs = [], failedLocal = [], failedExternal = [];
	page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !isExpectedConsole(m.text(), entry)) consoleMsgs.push(m.type() + ': ' + m.text().slice(0, 160)); });
	page.on('pageerror', (e) => consoleMsgs.push('pageerror: ' + e.message.slice(0, 160)));
	page.on('requestfailed', (r) => (isLocal(r.url(), origin) ? failedLocal : failedExternal).push(r.url().replace(origin, '')));
	page.on('response', (r) => { if (r.status() >= 400 && isLocal(r.url(), origin) && r.url() !== origin + entry.url) failedLocal.push(r.status() + ' ' + r.url().replace(origin, '')); });
	const resp = await page.goto(origin + entry.url, { waitUntil: 'load' });
	await wait(1200);
	await loadEverything(page);
	const d = await page.evaluate(() => {
		const de = document.documentElement;
		const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((e) => e.getClientRects().length).map((e) => +e.tagName[1]);
		let skips = 0; for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) skips++;
		const visImgs = [...document.images].filter((i) => i.getClientRects().length);
		// Header/submenu images follow the sticky header and carousel slides move: excluded from geometry, kept in srcset check.
		const geo = visImgs.filter((i) => !i.closest('.hdr-navy, header, .swiper, #gdecom-lightbox')).map((i) => {
			const r = i.getBoundingClientRect();
			return [(i.getAttribute('src') || '').split('/').pop(), Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)];
		});
		const chosen = [...document.images].filter((i) => i.getAttribute('srcset') && i.currentSrc).map((i) => i.currentSrc.split('/').pop());
		return {
			overflow: de.scrollWidth > de.clientWidth + 1, docH: de.scrollHeight, h1: document.querySelectorAll('h1').length, skips,
			broken: visImgs.filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map((i) => i.getAttribute('src').split('/').pop()),
			geo, chosen: chosen.sort()
		};
	});
	await ctx.close();
	return { status: resp ? resp.status() : 0, console: consoleMsgs, failedLocal: [...new Set(failedLocal)], failedExternal: [...new Set(failedExternal)], ...d };
}

async function run(R, { browser, origin }) {
	const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
	if (!baseline) R.note('layout baseline', 'baseline/layout.json not found - geometry comparison skipped');
	for (const vp of VIEWPORTS) for (const entry of MANIFEST) {
		const k = `${entry.id}@${vp.name}`;
		const m = await measure(browser, origin, entry, vp);
		R.check(`[${k}] HTTP ${entry.http}`, m.status === entry.http, 'got ' + m.status);
		R.check(`[${k}] no console errors/warnings`, m.console.length === 0, m.console);
		R.check(`[${k}] no failed local requests`, m.failedLocal.length === 0, m.failedLocal);
		if (m.failedExternal.length) R.note(`[${k}] external requests failed (third-party/network)`, m.failedExternal);
		R.check(`[${k}] no horizontal overflow`, !m.overflow);
		R.check(`[${k}] no broken images`, m.broken.length === 0, m.broken);
		R.check(`[${k}] H1 = ${entry.h1}, no heading skips`, m.h1 === entry.h1 && m.skips === 0, { h1: m.h1, skips: m.skips });
		if (baseline && baseline[k]) {
			const b = baseline[k];
			R.check(`[${k}] page height matches baseline (${b.docH}px ±${TOL})`, Math.abs(m.docH - b.docH) <= TOL, 'now ' + m.docH);
			const moved = [];
			if (m.geo.length !== b.geo.length) moved.push(`image count ${b.geo.length} -> ${m.geo.length}`);
			else b.geo.forEach((g, i) => { const n = m.geo[i]; if (g[0] !== n[0] || [1, 2, 3, 4].some((j) => Math.abs(g[j] - n[j]) > TOL)) moved.push(g.join(',') + ' -> ' + n.join(',')); });
			R.check(`[${k}] image positions/sizes match baseline (${b.geo.length})`, moved.length === 0, moved.slice(0, 5));
			R.check(`[${k}] srcset candidates chosen match baseline (${b.chosen.length})`, JSON.stringify(m.chosen) === JSON.stringify(b.chosen), { now: m.chosen.filter((c) => !b.chosen.includes(c)), baseline: b.chosen.filter((c) => !m.chosen.includes(c)) });
		}
	}
}

async function recordBaseline({ browser, origin }) {
	const out = {};
	for (const vp of VIEWPORTS) for (const entry of MANIFEST) {
		const m = await measure(browser, origin, entry, vp);
		out[`${entry.id}@${vp.name}`] = { status: m.status, docH: m.docH, h1: m.h1, skips: m.skips, geo: m.geo, chosen: m.chosen, consoleCount: m.console.length, failedLocal: m.failedLocal };
	}
	fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
	fs.writeFileSync(BASELINE, JSON.stringify(out));
	return out;
}

module.exports = { run, recordBaseline, measure };
