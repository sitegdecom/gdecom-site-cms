// Shared helpers: browser launch, viewports, manifest, small result collector.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const QA_ROOT = path.resolve(__dirname, '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(QA_ROOT, 'pages.json'), 'utf8')).pages;

// The six project viewports. Phones use a touch/mobile context (DPR 3), like the approved manual QA.
const VIEWPORTS = [
	{ name: '1440x900', width: 1440, height: 900, mobile: false },
	{ name: '1280x800', width: 1280, height: 800, mobile: false },
	{ name: '1024x768', width: 1024, height: 768, mobile: false },
	{ name: '768x1024', width: 768, height: 1024, mobile: false },
	{ name: '390x844', width: 390, height: 844, mobile: true },
	{ name: '360x800', width: 360, height: 800, mobile: true }
];

function contextOptions(vp) {
	return vp.mobile
		? { viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
		: { viewport: { width: vp.width, height: vp.height } };
}

// Uses the locally installed Google Chrome by default (QA_BROWSER_CHANNEL), or an explicit executable (QA_CHROME_PATH).
async function launchBrowser() {
	const opts = process.env.QA_CHROME_PATH ? { executablePath: process.env.QA_CHROME_PATH } : { channel: process.env.QA_BROWSER_CHANNEL || 'chrome' };
	return chromium.launch(opts);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Scrolls the whole page so lazy images load, then waits for every image to settle.
async function loadEverything(page) {
	await page.evaluate(async () => {
		const H = () => document.documentElement.scrollHeight;
		for (let y = 0; y < H(); y += Math.round(innerHeight * 0.8)) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
		scrollTo(0, H());
		await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 5000); }))));
		await new Promise((r) => setTimeout(r, 400));
		scrollTo(0, 0);
	});
	await wait(300);
}

// Console messages that are expected and not caused by the site.
function isExpectedConsole(msg, pageEntry) {
	// A real 404 response makes Chrome log the document's own status; that is the intended behaviour of the 404 page.
	if (pageEntry && pageEntry.http === 404 && /Failed to load resource: the server responded with a status of 404/.test(msg)) return true;
	return false;
}

function isLocal(url, origin) { return url.startsWith(origin); }

class Results {
	constructor(suite) { this.suite = suite; this.checks = []; }
	check(name, ok, detail) { this.checks.push({ name, ok: !!ok, detail: ok ? undefined : detail }); return !!ok; }
	note(name, detail) { this.checks.push({ name, ok: true, note: detail }); }
	get failed() { return this.checks.filter((c) => !c.ok); }
	summary() { return { suite: this.suite, total: this.checks.length, passed: this.checks.length - this.failed.length, failed: this.failed.length }; }
}

module.exports = { QA_ROOT, MANIFEST, VIEWPORTS, contextOptions, launchBrowser, wait, loadEverything, isExpectedConsole, isLocal, Results };
