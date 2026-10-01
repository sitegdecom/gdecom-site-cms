// Records the regression baseline from the CURRENT site state into qa/baseline/:
//   integrity.json  SHA-256 of the approved HTML pages and protected shared CSS/JS
//   structure.json  headings, local references, image/srcset counts per page
//   layout.json     page heights, image boxes and chosen srcset candidates at the 6 viewports
// Only run this on an approved state (it defines what later CMS output is compared against).
'use strict';
const { start } = require('../lib/server');
const { launchBrowser } = require('../lib/common');

(async () => {
	const integrity = require('../tests/integrity').recordBaseline();
	console.log('integrity.json  ' + Object.keys(integrity).length + ' files hashed');
	const structure = require('../tests/static').recordBaseline();
	console.log('structure.json  ' + Object.keys(structure).length + ' pages');
	const { server, origin } = await start(0);
	const browser = await launchBrowser();
	try {
		const layout = await require('../tests/browser').recordBaseline({ browser, origin });
		console.log('layout.json     ' + Object.keys(layout).length + ' page x viewport combinations');
	} finally { await browser.close(); server.close(); }
})();
