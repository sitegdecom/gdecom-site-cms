// GDECOM static build: content/ + templates/ -> dist/
//   npm run build
// Fails (exit code 1) on missing required content, unresolved template tokens, missing/invalid images,
// invalid article slugs or broken local references, with messages in Portuguese.
'use strict';
const fs = require('fs');
const path = require('path');
const { render, parseFrontmatter } = require('./lib/render');
const H = require('./lib/html');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
let sharp = null; try { sharp = require('sharp'); } catch (e) { /* only needed when an editor replaces an image */ }

// Fixed pages: template (relative to templates/) -> content file -> output path (relative to dist/)
const PAGES = [
	{ label: 'Página inicial', template: 'index.html', content: 'content/home.json' },
	{ label: 'Nossa história', template: 'historia/index.html', content: 'content/historia.json' },
	{ label: 'Fale com a gente', template: 'fale-com-a-gente/index.html', content: 'content/contato.json' },
	{ label: 'Vôlei', template: 'servico-de-convivencia/volei/index.html', content: 'content/volei.json' },
	{ label: 'Creche Patatí-Patatá', template: 'programas/creche-educacao-infantil/index.html', content: 'content/programas/creche.json' },
	{ label: 'Atendimento Educacional Integrado', template: 'artigos/atendimento-educacional-integrado-inclusao-aprendizagem-e-cuidado-no-territorio/index.html', content: 'content/programas/atendimento.json' },
	{ label: 'Programa Maior Cuidado', template: 'artigos/programa-maior-cuidado-atencao-vinculo-e-protecao-no-cotidiano/index.html', content: 'content/programas/maior-cuidado.json' },
	{ label: 'Qualificação Profissional', template: 'artigos/qualificacao-profissional-cursos-gratuitos-que-ampliam-oportunidades/index.html', content: 'content/programas/qualificacao.json' },
	{ label: 'SCFV', template: 'artigos/scfv-para-adolescentes-de-15-a-17-anos-convivencia-escuta-e-protagonismo/index.html', content: 'content/programas/scfv.json' },
	{ label: 'Política de Privacidade', template: 'politica-de-privacidade/index.html', content: null },
	{ label: 'Página 404', template: '404.html', content: null }
];
const ARTICLE_MODEL = 'artigos/_modelo.html'; // template used by new articles (approved article layout)
// Repository paths that are not part of the published website.
const NOT_SITE = new Set(['.git', 'node_modules', 'dist', 'qa', 'build', 'tools', 'templates', 'content', '_archive_do_not_deploy', '.playwright-mcp', '.pages.yml', 'package.json', 'package-lock.json', '.gitignore', 'README.md', 'CMS.md']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function copySite(src, dst) {
	for (const f of fs.readdirSync(src)) {
		if (src === ROOT && NOT_SITE.has(f)) continue;
		if (f.startsWith('.')) continue; // hidden files (e.g. media/.gitkeep) are never published
		const s = path.join(src, f), d = path.join(dst, f);
		if (fs.statSync(s).isDirectory()) { fs.mkdirSync(d, { recursive: true }); copySite(s, d); }
		else fs.copyFileSync(s, d);
	}
}
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const loadTemplate = (rel) => ({ html: fs.readFileSync(path.join(ROOT, 'templates', rel), 'utf8'), meta: readJSON('templates/' + rel.replace(/\.html$/, '.meta.json')) });

function loadArticles(errors) {
	const dir = path.join(ROOT, 'content', 'artigos');
	const out = {};
	for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort() : []) {
		const slug = f.replace(/\.md$/, '');
		if (!SLUG_RE.test(slug)) { errors.push(`Artigo "${f}": o nome do arquivo (endereço da página) deve ter só letras minúsculas sem acento, números e hífens`); continue; }
		if (['index', '_modelo'].includes(slug)) { errors.push(`Artigo "${f}": nome reservado`); continue; }
		try { out[slug] = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8')); }
		catch (e) { errors.push(`Artigo "${f}": arquivo inválido (${e.message})`); }
	}
	return out;
}

// Every local src/href/srcset in a generated page must exist in dist/.
function checkRefs(html, outRel, errors) {
	const dir = path.posix.dirname(outRel);
	const refs = new Set();
	const noScript = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
	for (const m of noScript.matchAll(/\s(?:src|href)=["']([^"']+)["']/gi)) refs.add(m[1]);
	for (const m of noScript.matchAll(/\ssrcset=["']([^"']+)["']/gi)) for (const c of m[1].split(',')) refs.add(c.trim().split(/\s+/)[0]);
	for (const r of refs) {
		if (/^(https?:|\/\/|mailto:|tel:|data:|javascript:|#)/i.test(r)) continue;
		const clean = decodeURI(r.split('#')[0].split('?')[0]); if (!clean) continue;
		let f = clean.startsWith('/') ? path.join(DIST, clean) : path.join(DIST, dir, clean);
		if (clean.endsWith('/') || (fs.existsSync(f) && fs.statSync(f).isDirectory())) f = path.join(f, 'index.html');
		if (!fs.existsSync(f)) errors.push(`${outRel}: referência local quebrada (${r})`);
	}
}

(async () => {
	const t0 = Date.now();
	const errors = [];
	fs.rmSync(DIST, { recursive: true, force: true });
	fs.mkdirSync(DIST, { recursive: true });
	copySite(ROOT, DIST);

	const site = readJSON('content/site.json');
	const siteEntities = readJSON('templates/_site.meta.json').entities;
	const articles = loadArticles(errors);
	const ctx = { site, siteEntities, articles, errors, siteRoot: ROOT, outRoot: DIST, generated: new Set(), sharp };
	const outputs = [];

	for (const p of PAGES) {
		const { html, meta } = loadTemplate(p.template);
		const content = p.content ? readJSON(p.content) : {};
		outputs.push([p.template, await render(html, meta, content, { ...ctx, pageLabel: p.label })]);
	}
	const reserved = new Set(PAGES.map((p) => p.template.split('/')[1]).filter(Boolean));
	for (const [slug, art] of Object.entries(articles)) {
		if (reserved.has(slug)) { errors.push(`Artigo "${slug}": endereço já usado por outra página`); continue; }
		const own = path.join(ROOT, 'templates', 'artigos', slug + '.html');
		const { html, meta } = loadTemplate(fs.existsSync(own) ? 'artigos/' + slug + '.html' : ARTICLE_MODEL);
		// SEO fields are optional for editors: blank ones fall back to the article's title / highlight sentence.
		const seo = art.seo || {};
		const blank = (v) => v === undefined || v === null || String(v).trim() === '';
		art.seo = {
			titulo: blank(seo.titulo) ? (art.titulo || '') + ' | GDECOM' : seo.titulo,
			descricao: blank(seo.descricao) ? art.destaque : seo.descricao,
			titulo_social: blank(seo.titulo_social) ? (art.titulo || '') + ' – GDECOM' : seo.titulo_social
		};
		outputs.push([`artigos/${slug}/index.html`, await render(html, meta, art, { ...ctx, pageLabel: 'Artigo "' + (art.titulo || slug) + '"' })]);
	}

	for (const [rel, html] of outputs) {
		const left = html.match(/\{\{[a-z]:[^}]+\}\}/);
		if (left) errors.push(`${rel}: marcador de modelo não resolvido ${left[0]}`);
		fs.mkdirSync(path.dirname(path.join(DIST, rel)), { recursive: true });
		fs.writeFileSync(path.join(DIST, rel), html);
	}
	for (const [rel, html] of outputs) checkRefs(html, rel, errors);

	if (errors.length) {
		console.error('\n✗ A publicação foi interrompida para proteger o site. Corrija no Pages CMS:\n');
		for (const e of [...new Set(errors)]) console.error('  - ' + e);
		process.exit(1);
	}
	console.log(`✓ dist/ gerado: ${outputs.length} páginas, ${ctx.generated.size} imagens WebP novas (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
})().catch((e) => { console.error(e); process.exit(1); });
