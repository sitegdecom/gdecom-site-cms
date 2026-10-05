// Keyboard / pointer interaction checks over HTTP (port of the approved manual QA, 220/220 on 2026-10-01):
// desktop navigation + Programas submenu, mobile menu, Home carousel lightbox, inline lightboxes,
// focus restoration, scroll preservation, footer Privacy Policy link, 404 and Privacy Policy specifics.
'use strict';
const { MANIFEST, wait, isExpectedConsole } = require('../lib/common');

const PRIVACY_TITLE = 'Política de Privacidade | GDECOM';
const lbOpen = (pg) => pg.evaluate(() => { const d = document.querySelector('#gdecom-lightbox'); return !!d && d.classList.contains('is-open'); });

async function desktop(R, browser, origin, entry) {
	const k = entry.id;
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	let pg = await ctx.newPage();
	const errs = [];
	pg.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !isExpectedConsole(m.text(), entry)) errs.push(m.text().slice(0, 140)); });
	pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 140)));
	await pg.goto(origin + entry.url); await wait(700); await pg.mouse.move(5, 890);

	// Tab order through the header (wait > 0.25s transitions before reading focus styles)
	const seq = [];
	for (let i = 0; i < 11; i++) {
		await pg.keyboard.press('Tab'); await wait(350);
		seq.push(await pg.evaluate(() => {
			const a = document.activeElement; const c = getComputedStyle(a);
			return { t: (a.textContent || '').trim().slice(0, 16), inSub: !!a.closest('.programas-submenu'), ring: (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== 'none' };
		}));
	}
	const iProg = seq.findIndex((s) => s.t === 'Programas');
	R.check(`[${k}] skip link is the first Tab stop`, /Pular/.test(seq[0].t), seq[0].t);
	R.check(`[${k}] Programas reachable by Tab`, iProg > 0, seq.map((s) => s.t));
	R.check(`[${k}] Tab enters the 5 submenu items`, iProg > 0 && seq.slice(iProg + 1, iProg + 6).every((s) => s.inSub), seq.map((s) => s.t));
	R.check(`[${k}] visible focus ring on every header stop`, iProg > 0 && seq.slice(0, iProg + 6).every((s) => s.ring), seq.filter((s) => !s.ring).map((s) => s.t));

	const prog = pg.locator('a.has-submenu').first();
	await prog.focus(); await wait(350);
	const ae = () => prog.getAttribute('aria-expanded');
	const vis = () => pg.evaluate(() => getComputedStyle(document.querySelector('.programas-submenu')).visibility);
	R.check(`[${k}] submenu: aria-expanded=true and visible on focus`, (await ae()) === 'true' && (await vis()) === 'visible');
	await pg.keyboard.press('Tab'); await wait(350); await pg.keyboard.press('Escape'); await wait(400);
	R.check(`[${k}] submenu: Escape closes it`, (await ae()) === 'false' && (await vis()) === 'hidden');
	R.check(`[${k}] submenu: Escape returns focus to Programas`, await pg.evaluate(() => document.activeElement.classList.contains('has-submenu')));

	await pg.mouse.move(5, 890); await pg.goto(origin + entry.url); await wait(500);
	let navs = 0; const onNav = (f) => { if (f === pg.mainFrame()) navs++; }; pg.on('framenavigated', onNav);
	await pg.locator('a.has-submenu').first().focus(); await wait(350); await pg.keyboard.press('Tab'); await wait(350); await pg.keyboard.press('Enter'); await wait(1500);
	R.check(`[${k}] Enter on a submenu item navigates exactly once`, navs === 1, 'navigations=' + navs);
	pg.off('framenavigated', onNav);

	// Lightboxes
	if (entry.lightbox !== 'none') {
		await pg.goto(origin + entry.url); await wait(700);
		if (entry.lightbox === 'home-carousel') await homeCarousel(R, pg, k);
		else await inlineLightboxes(R, pg, k);
	}

	// Footer Privacy Policy link: same look as footer text, yellow focus ring, navigates to the policy
	await pg.goto(origin + entry.url); await wait(600);
	const fl = pg.locator('a.footer-privacidade');
	R.check(`[${k}] footer Privacy Policy link present`, (await fl.count()) === 1);
	if (await fl.count()) {
		await fl.focus(); await wait(200);
		const st = await fl.evaluate((a) => { const c = getComputedStyle(a); return { fv: a.matches(':focus-visible'), outline: c.outlineStyle + ' ' + c.outlineColor, color: c.color, deco: c.textDecorationLine }; });
		R.check(`[${k}] footer link keeps footer look and shows the yellow focus ring`, st.color === 'rgb(255, 255, 255)' && st.deco === 'none' && /solid rgb\(255, 210, 31\)/.test(st.outline), st);
		await Promise.all([pg.waitForURL(/\/politica-de-privacidade\//, { timeout: 10000 }).catch(() => {}), fl.click()]); await wait(400);
		R.check(`[${k}] footer link opens the Privacy Policy`, (await pg.title()) === PRIVACY_TITLE, await pg.title());
	}

	R.check(`[${k}] no console errors/warnings during desktop interactions`, errs.length === 0, errs);
	await ctx.close();
}

async function homeCarousel(R, pg, k) {
	await pg.locator('[data-id="56537ef"]').scrollIntoViewIfNeeded(); await wait(600);
	const hiddenFocusable = await pg.evaluate(() => document.querySelectorAll('[data-gdecom-lightbox] [aria-hidden="true"] [tabindex="0"]').length);
	R.check(`[${k}] carousel: no focusable trigger inside aria-hidden slides`, hiddenFocusable === 0, 'found ' + hiddenFocusable);
	const pick = async () => (await pg.evaluateHandle(() => [...document.querySelectorAll('[data-gdecom-lightbox] a[tabindex="0"]')].find((a) => { const r = a.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }))).asElement();
	let t = await pick();
	await t.focus(); const y0 = await pg.evaluate(() => Math.round(scrollY));
	await pg.keyboard.press('Enter'); await wait(500);
	R.check(`[${k}] carousel: Enter opens the lightbox`, await lbOpen(pg));
	const lbImg = await pg.evaluate(() => { const i = document.querySelector('#gdecom-lightbox img'); return { src: i.getAttribute('src') || '', w: i.naturalWidth }; });
	R.check(`[${k}] carousel lightbox shows the full original (not a reduced WebP)`, !/-(600|1050)\.webp$/.test(lbImg.src), lbImg.src);
	for (let i = 0; i < 4; i++) await pg.keyboard.press('Tab');
	R.check(`[${k}] carousel: focus stays trapped in the lightbox`, await pg.evaluate(() => document.querySelector('#gdecom-lightbox').contains(document.activeElement)));
	const before = await pg.evaluate(() => document.querySelector('#gdecom-lightbox img').getAttribute('src'));
	await pg.keyboard.press('ArrowRight'); await wait(250);
	R.check(`[${k}] carousel: ArrowRight shows the next image`, (await pg.evaluate(() => document.querySelector('#gdecom-lightbox img').getAttribute('src'))) !== before);
	await pg.keyboard.press('Escape'); await wait(500);
	R.check(`[${k}] carousel: Escape closes`, !(await lbOpen(pg)));
	R.check(`[${k}] carousel: focus returns to the trigger`, await pg.evaluate(() => !!document.activeElement.closest('[data-gdecom-lightbox]')));
	R.check(`[${k}] carousel: scroll position preserved`, Math.abs((await pg.evaluate(() => Math.round(scrollY))) - y0) <= 1);
	t = await pick(); await t.focus(); await pg.keyboard.press(' '); await wait(500);
	R.check(`[${k}] carousel: Space opens the lightbox`, await pg.evaluate(() => document.querySelector('#gdecom-lightbox').classList.contains('is-open')));
	await pg.keyboard.press('Enter'); await wait(500); // Enter on the focused close button
	R.check(`[${k}] carousel: close button (Enter) closes`, !(await lbOpen(pg)));
	t = await pick(); await t.focus();
	await pg.keyboard.down('Enter'); await wait(80); await pg.keyboard.down('Enter'); await pg.keyboard.down('Enter'); await pg.keyboard.up('Enter'); await wait(300);
	R.check(`[${k}] carousel: holding Enter does not close it again`, await lbOpen(pg));
	await pg.keyboard.press('Escape'); await wait(400);
	t = await pick(); const b = await t.boundingBox(); await pg.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await wait(500);
	R.check(`[${k}] carousel: click opens`, await lbOpen(pg));
	const x = await pg.locator('#gdecom-lightbox .gl-close').boundingBox(); await pg.mouse.click(x.x + x.width / 2, x.y + x.height / 2); await wait(500);
	R.check(`[${k}] carousel: X click closes`, !(await lbOpen(pg)));
}

async function inlineLightboxes(R, pg, k) {
	const n = await pg.locator('.zoom-wrap').count();
	R.check(`[${k}] inline lightbox triggers present`, n > 0, 'found ' + n);
	let ok = 0; const problems = [];
	for (let i = 0; i < n; i++) {
		const trig = await pg.locator('.zoom-wrap').nth(i).elementHandle();
		await trig.scrollIntoViewIfNeeded(); await trig.focus();
		const y = await pg.evaluate(() => Math.round(scrollY));
		const tabbable = await trig.evaluate((e) => e.tabIndex >= 0);
		await pg.keyboard.press('Enter'); await wait(450); const o1 = await lbOpen(pg);
		const lbSrc = await pg.evaluate(() => document.querySelector('#gdecom-lightbox img').getAttribute('src') || '');
		await pg.keyboard.press('Escape'); await wait(450); const c1 = !(await lbOpen(pg));
		const back = await trig.evaluate((e) => e === document.activeElement || e.contains(document.activeElement));
		const y2 = await pg.evaluate(() => Math.round(scrollY));
		await pg.keyboard.press(' '); await wait(450); const o2 = await lbOpen(pg); await pg.keyboard.press('Escape'); await wait(400);
		const bb = await trig.boundingBox(); await pg.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await wait(450); const o3 = await lbOpen(pg);
		const closeBtn = await pg.$('#gdecom-lightbox.is-open .lightbox-close'); if (closeBtn) { await closeBtn.click(); await wait(450); }
		const c3 = !(await lbOpen(pg));
		const good = tabbable && o1 && c1 && back && Math.abs(y - y2) <= 1 && o2 && o3 && !!closeBtn && c3 && !/-\d{3,4}\.webp$/.test(lbSrc);
		if (good) ok++; else problems.push({ i, tabbable, o1, c1, back, y, y2, o2, o3, closeBtn: !!closeBtn, c3, lbSrc });
	}
	R.check(`[${k}] inline lightboxes: Enter/Space/click open, Escape/X close, focus returns, scroll kept, original image (${ok}/${n})`, ok === n, problems.slice(0, 3));
}

// A point that is not a link/button/field/menu, to test "tap outside". Chrome's touch adjustment snaps a tap to a
// nearby clickable element, so every point within 32px must also be non-interactive.
async function neutralPoint(pg) {
	return pg.evaluate(() => {
		const bad = 'a,button,input,textarea,select,iframe,label,[role=button],[tabindex],nav,.elementor-menu-toggle,.elementor-nav-menu--dropdown,.zoom-wrap';
		const clear = (x, y) => { const el = document.elementFromPoint(x, y); return !el || !el.closest(bad); };
		const nav = document.querySelector('nav.elementor-nav-menu--dropdown'); const top = nav ? nav.getBoundingClientRect().bottom + 40 : 140;
		for (let y = Math.max(top, 140); y < innerHeight - 40; y += 12) for (let x = 40; x <= innerWidth - 40; x += 20) {
			if (!document.elementFromPoint(x, y)) continue;
			let ok = true;
			for (const dx of [-32, 0, 32]) for (const dy of [-32, 0, 32]) if (!clear(x + dx, y + dy)) ok = false;
			if (ok) return { x, y };
		}
		return null;
	});
}

async function mobile(R, browser, origin, entry) {
	const k = entry.id + '@390';
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
	const pg = await ctx.newPage(); const errs = [];
	pg.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !isExpectedConsole(m.text(), entry)) errs.push(m.text().slice(0, 140)); });
	pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 140)));
	await pg.goto(origin + entry.url); await wait(700);
	const tg = pg.locator('.elementor-menu-toggle').first();
	const ae = () => tg.getAttribute('aria-expanded');
	const nav = () => pg.evaluate(() => { const n = document.querySelector('nav.elementor-nav-menu--dropdown'); return { ah: n.getAttribute('aria-hidden'), h: Math.round(n.getBoundingClientRect().height) }; });
	await tg.focus(); await pg.keyboard.press('Enter'); await wait(600);
	const n1 = await nav();
	R.check(`[${k}] mobile menu: Enter opens (aria-expanded, aria-hidden, height)`, (await ae()) === 'true' && n1.ah === 'false' && n1.h > 100, n1);
	await pg.keyboard.press('Enter'); await wait(600);
	R.check(`[${k}] mobile menu: Enter closes (no double fire)`, (await ae()) === 'false' && (await nav()).ah === 'true');
	await pg.keyboard.press(' '); await wait(600);
	R.check(`[${k}] mobile menu: Space opens`, (await ae()) === 'true');
	await pg.keyboard.press('Escape'); await wait(600);
	R.check(`[${k}] mobile menu: Escape closes`, (await ae()) === 'false' && (await nav()).ah === 'true');
	await tg.tap(); await wait(600);
	R.check(`[${k}] mobile menu: tap opens`, (await ae()) === 'true');
	const pt = await neutralPoint(pg);
	if (R.check(`[${k}] mobile menu: neutral point found for tap-outside`, !!pt)) { await pg.touchscreen.tap(pt.x, pt.y); await wait(600); }
	R.check(`[${k}] mobile menu: tap outside closes`, (await ae()) === 'false');
	await tg.focus(); await pg.keyboard.press('Enter');
	// wait until the dropdown has finished opening; otherwise Tab can skip the (still hidden) items
	await pg.waitForFunction(() => { const n = document.querySelector('nav.elementor-nav-menu--dropdown'); return n && n.getAttribute('aria-hidden') === 'false' && n.getBoundingClientRect().height > 100 && getComputedStyle(n.querySelector('a')).visibility === 'visible'; }, null, { timeout: 3000 }).catch(() => {});
	await wait(300);
	await pg.keyboard.press('Tab'); await wait(250);
	const focusInMenu = await pg.evaluate(() => !!document.activeElement.closest('nav.elementor-nav-menu--dropdown') && document.activeElement.tagName === 'A');
	R.check(`[${k}] mobile menu: Tab from the toggle moves into the open menu`, focusInMenu);
	let navs = 0; pg.on('framenavigated', (f) => { if (f === pg.mainFrame()) navs++; });
	await pg.keyboard.press('Enter'); await wait(1500);
	R.check(`[${k}] mobile menu: Enter on an item navigates exactly once`, navs === 1, 'navigations=' + navs);
	R.check(`[${k}] no console errors/warnings during mobile interactions`, errs.length === 0, errs);
	await ctx.close();
}

async function specials(R, browser, origin) {
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const pg = await ctx.newPage();
	// 404
	const e404 = MANIFEST.find((p) => p.id === '404');
	const r = await pg.goto(origin + e404.url); await wait(600);
	R.check('[404] nonexistent deep URL returns HTTP 404', r.status() === 404, r.status());
	R.check('[404] custom 404 page renders (H1 "Página não encontrada")', (await pg.locator('h1').innerText()).trim() === 'Página não encontrada');
	R.check('[404] robots = noindex', (await pg.getAttribute('meta[name="robots"]', 'content')) === 'noindex');
	const r2 = await pg.goto(origin + '/404.html'); R.check('[404] /404.html itself is served (200)', r2.status() === 200, r2.status());
	// Privacy Policy
	const ep = MANIFEST.find((p) => p.id === 'privacidade');
	await pg.goto(origin + ep.url); await wait(600);
	const txt = await pg.evaluate(() => document.querySelector('main').innerText);
	R.check('[privacidade] page exists with its title', (await pg.title()) === PRIVACY_TITLE, await pg.title());
	R.check('[privacidade] no visible update/publication date', !/(última atualização|atualizad[ao] em|publicad[ao] em|\b\d{1,2}º? de (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de \d{4})/i.test(txt));
	R.check('[privacidade] no sentence referring to a date at the top of the page', !/(data da última|início desta página)/i.test(txt));
	R.check('[privacidade] no meta robots (indexable)', (await pg.locator('meta[name="robots"]').count()) === 0);
	await ctx.close();
}

async function run(R, { browser, origin }) {
	for (const entry of MANIFEST) { await desktop(R, browser, origin, entry); await mobile(R, browser, origin, entry); }
	await specials(R, browser, origin);
}

module.exports = { run };
