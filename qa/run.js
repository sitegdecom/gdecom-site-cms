// QA runner. Usage: node run.js [static] [integrity] [browser] [interaction]   (no argument = all suites)
// Starts the local HTTP server, runs the selected suites, prints a summary, writes qa/output/report.json,
// and exits with code 1 if any check fails.
'use strict';
const fs = require('fs');
const path = require('path');
const { start } = require('./lib/server');
const { launchBrowser, Results, QA_ROOT } = require('./lib/common');

const SUITES = { static: require('./tests/static'), integrity: require('./tests/integrity'), browser: require('./tests/browser'), interaction: require('./tests/interaction') };
const NEEDS_BROWSER = ['browser', 'interaction'];

(async () => {
	const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SUITES);
	const unknown = wanted.filter((s) => !SUITES[s]); if (unknown.length) { console.error('Unknown suite(s): ' + unknown.join(', ')); process.exit(2); }
	const { server, origin } = await start(0);
	const browser = wanted.some((s) => NEEDS_BROWSER.includes(s)) ? await launchBrowser() : null;
	const report = { startedAt: new Date().toISOString(), origin, suites: [] };
	let failed = 0;
	try {
		for (const name of wanted) {
			const R = new Results(name); const t0 = Date.now();
			process.stdout.write(`\n▶ ${name} ... `);
			try { await SUITES[name].run(R, { browser, origin }); } catch (e) { R.check(`${name}: suite crashed`, false, e.stack); }
			const s = R.summary(); failed += s.failed;
			console.log(`${s.passed}/${s.total} passed (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
			for (const f of R.failed) console.log(`   ✗ ${f.name}\n     ${JSON.stringify(f.detail)}`);
			report.suites.push({ ...s, checks: R.checks });
		}
	} finally {
		if (browser) await browser.close();
		server.close();
	}
	report.finishedAt = new Date().toISOString();
	const outDir = path.join(QA_ROOT, 'output'); fs.mkdirSync(outDir, { recursive: true });
	fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
	const total = report.suites.reduce((a, s) => a + s.total, 0);
	console.log(`\n${failed ? '✗ FAILED' : '✓ ALL PASSED'}: ${total - failed}/${total} checks (report: qa/output/report.json)`);
	process.exit(failed ? 1 : 0);
})();
