// ONE-TIME migration: cuts the approved HTML pages into templates/ + content/ (+ schema for Pages CMS).
// Every extracted value is checked so that rendering the template with the extracted content reproduces
// the approved file byte-for-byte. Refuses to run if content/ already exists (content is then the source of truth).
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../../build/lib/html');

const ROOT = path.resolve(__dirname, '..', '..');
if (fs.existsSync(path.join(ROOT, 'content')) && !process.argv.includes('--force')) {
	console.error('content/ already exists: the migration extractor must not overwrite edited content. Aborting.');
	process.exit(1);
}

// ---------------------------------------------------------------- page registry
const ARTICLES = ['arte-como-caminho-de-pertencimento-e-transformacao-social', 'parcerias-que-geram-transformacao-o-trabalho-do-gdecom-em-rede', 'projetos-com-impacto-social-parcerias-que-fortalecem-comunidades'];
const PAGES = [
	{ id: 'home', file: 'index.html', kind: 'home', content: 'content/home.json', label: 'Página inicial' },
	{ id: 'historia', file: 'historia/index.html', kind: 'generic', content: 'content/historia.json', label: 'Nossa história' },
	{ id: 'contato', file: 'fale-com-a-gente/index.html', kind: 'contato', content: 'content/contato.json', label: 'Fale com a gente' },
	{ id: 'volei', file: 'servico-de-convivencia/volei/index.html', kind: 'generic', content: 'content/volei.json', label: 'Vôlei' },
	{ id: 'creche', file: 'programas/creche-educacao-infantil/index.html', kind: 'generic', content: 'content/programas/creche.json', label: 'Creche Patatí-Patatá' },
	{ id: 'atendimento', file: 'artigos/atendimento-educacional-integrado-inclusao-aprendizagem-e-cuidado-no-territorio/index.html', kind: 'generic', content: 'content/programas/atendimento.json', label: 'Atendimento Educacional Integrado' },
	{ id: 'maior-cuidado', file: 'artigos/programa-maior-cuidado-atencao-vinculo-e-protecao-no-cotidiano/index.html', kind: 'generic', content: 'content/programas/maior-cuidado.json', label: 'Programa Maior Cuidado' },
	{ id: 'qualificacao', file: 'artigos/qualificacao-profissional-cursos-gratuitos-que-ampliam-oportunidades/index.html', kind: 'generic', content: 'content/programas/qualificacao.json', label: 'Qualificação Profissional' },
	{ id: 'scfv', file: 'artigos/scfv-para-adolescentes-de-15-a-17-anos-convivencia-escuta-e-protagonismo/index.html', kind: 'generic', content: 'content/programas/scfv.json', label: 'SCFV para adolescentes' },
	...ARTICLES.map((slug) => ({ id: 'artigo:' + slug, file: 'artigos/' + slug + '/index.html', kind: 'article', content: 'content/artigos/' + slug + '.md', slug })),
	{ id: 'privacidade', file: 'politica-de-privacidade/index.html', kind: 'static' },
	{ id: '404', file: '404.html', kind: 'static' }
];

// ---------------------------------------------------------------- site data (from the approved pages)
const SITE = {
	nome_publico: 'GDECOM – Grupo de Desenvolvimento Comunitário',
	razao_social: 'GRUPO DE DESENVOLVIMENTO COMUNITARIO - GDECOM',
	natureza_juridica: 'Associação Privada',
	cnpj: '21.516.315/0001-66',
	endereco: { logradouro: 'Rua Cajuí, 100', bairro: 'Bairro Suzana', cidade: 'Belo Horizonte', uf: 'MG', cep: '31260-480' },
	telefone: '(31) 3497-7255',
	email: 'gdecom@gdecom.org.br',
	instagram: '@gdecom',
	instagram_url: 'https://www.instagram.com/gdecom/',
	rodape_texto: '© 2026 GDECOM – Organização da Sociedade Civil sem fins lucrativos'
};
const SITE_ENT = { rodape_texto: { '–': '&#8211;' } };

// ---------------------------------------------------------------- per-page extraction state
function Page(def) {
	const h = fs.readFileSync(path.join(ROOT, def.file), 'utf8');
	const depth = def.file === '404.html' ? null : def.file.split('/').length - 1;
	return { def, h, depth, reps: [], content: {}, schema: [], meta: { entities: {}, slots: {}, computed: {} }, used: new Set(), errors: [] };
}
// Containers are created from the NEXT key: numeric -> array (Pages CMS list), otherwise object.
const setPath = (obj, p, v) => { const ks = p.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; };
function rep(P, start, end, token) {
	for (const r of P.reps) if (start < r.end && end > r.start) throw new Error(`${P.def.id}: overlapping replacement at ${start} (${token}) vs ${r.token}`);
	P.reps.push({ start, end, token });
}
function uniqueName(P, base) { let n = base, i = 2; while (P.used.has(n)) n = base + '_' + i++; P.used.add(n); return n; }
function field(P, def) { P.schema.push(def); }

// Plain text value between [a,b)
function text(P, a, b, p, label, opts = {}) {
	const raw = P.h.slice(a, b);
	const value = H.decode(raw);
	const prefer = H.entityPreferences(raw);
	if (H.encodeText(value, prefer) !== raw) throw new Error(`${P.def.id}: text field ${p} cannot round-trip: ${JSON.stringify(raw.slice(0, 80))}`);
	if (Object.keys(prefer).length) P.meta.entities[p] = prefer;
	setPath(P.content, p, value);
	field(P, { path: p, type: opts.multiline ? 'text' : 'string', label, required: opts.required !== false, description: opts.description });
	rep(P, a, b, `{{t:${p}}}`);
}
// Plain text, or rich text when the approved value contains markup.
function auto(P, a, b, p, label, opts = {}) { return /</.test(P.h.slice(a, b)) ? html(P, a, b, p, label, opts) : text(P, a, b, p, label, opts); }
function attrText(P, a, b, p, label, opts = {}) {
	const raw = P.h.slice(a, b);
	const value = H.decode(raw);
	const prefer = H.entityPreferences(raw);
	if (H.encodeAttr(value, prefer) !== raw) throw new Error(`${P.def.id}: attribute field ${p} cannot round-trip: ${raw.slice(0, 80)}`);
	if (Object.keys(prefer).length) P.meta.entities[p] = prefer;
	setPath(P.content, p, value);
	if (!opts.noSchema) field(P, { path: p, type: opts.multiline ? 'text' : 'string', label, required: opts.required !== false, description: opts.description });
	rep(P, a, b, `{{a:${p}}}`);
}
function html(P, a, b, p, label, opts = {}) {
	const raw = P.h.slice(a, b);
	if (H.sanitize(raw) !== raw) throw new Error(`${P.def.id}: rich text ${p} would be altered by the sanitizer: ${raw.slice(0, 120)}`);
	setPath(P.content, p, raw);
	field(P, { path: p, type: 'rich-text', label, required: opts.required !== false, description: opts.description });
	rep(P, a, b, `{{h:${p}}}`);
}
// Root-relative path ("/assets/...") of a reference written relative to the page.
function rootPath(P, ref) {
	if (ref.startsWith('/')) return ref;
	return '/' + path.posix.normalize(path.posix.join(path.posix.dirname(P.def.file), ref));
}
function image(P, node, p, label, opts = {}) {
	const tag = node.open;
	const src = H.getAttr(tag, 'src');
	const altRaw = H.getAttr(tag, 'alt') || '';
	const srcset = H.getAttr(tag, 'srcset');
	const widths = srcset ? srcset.split(',').map((c) => c.trim().split(/\s+/)).filter((c) => /-(\d+)\.webp$/.test(c[0])).map((c) => +c[1].replace('w', '')) : [];
	const origRoot = rootPath(P, src);
	let dims = 'natural';
	const wAttr = H.getAttr(tag, 'width'), hAttr = H.getAttr(tag, 'height');
	if (wAttr && hAttr) {
		const { dimensions } = require('../../build/lib/images');
		const d = dimensions(path.join(ROOT, decodeURI(origRoot.slice(1))));
		if (d && Math.abs(d[0] / d[1] - (+wAttr) / (+hAttr)) > 0.01) dims = 'keep';
	}
	setPath(P.content, p + '.imagem', origRoot);
	setPath(P.content, p + '.texto_alternativo', H.decode(altRaw));
	P.meta.slots[p] = { label, originalTag: tag, originalSrc: origRoot, originalAltDecoded: H.decode(altRaw), altEntities: H.entityPreferences(altRaw), widths, sizes: H.getAttr(tag, 'sizes'), dims };
	field(P, { path: p, type: 'image-object', label, description: opts.description });
	rep(P, node.start, node.openEnd, `{{i:${p}}}`);
}
function site(P, a, b, key, kind = 's') {
	rep(P, a, b, `{{${kind}:${key}}}`);
}
// Replace every occurrence of a literal inside [from,to) with a token (asserting the expected count).
function literal(P, needle, token, { from = 0, to = P.h.length, count = 1 } = {}) {
	const idx = []; let i = P.h.indexOf(needle, from);
	while (i >= 0 && i + needle.length <= to) { idx.push(i); i = P.h.indexOf(needle, i + needle.length); }
	if (count !== null && idx.length !== count) throw new Error(`${P.def.id}: expected ${count} × ${JSON.stringify(needle.slice(0, 60))}, found ${idx.length}`);
	for (const s of idx) rep(P, s, s + needle.length, token);
	return idx.length;
}
// inner text range of an element, trimmed of surrounding whitespace
function innerTrim(P, node) { let a = node.innerStart, b = node.innerEnd; while (a < b && /\s/.test(P.h[a])) a++; while (b > a && /\s/.test(P.h[b - 1])) b--; return [a, b]; }
const elId = (P, dataId) => { const n = H.find(H.parse(P.h), (e) => H.getAttr(e.open, 'data-id') === dataId); if (n.length !== 1) throw new Error(`${P.def.id}: data-id ${dataId} found ${n.length}×`); return n[0]; };

// ---------------------------------------------------------------- common parts (every page)
function common(P) {
	const h = P.h;
	// SEO (not for static pages)
	if (P.def.kind !== 'static') {
		const t = h.match(/<title>([^<]*)<\/title>/); const ts = t.index + 7;
		text(P, ts, ts + t[1].length, 'seo.titulo', 'Título da aba e do Google', { description: 'Aparece na aba do navegador e nos resultados de busca. Ideal: até 60 caracteres.' });
		const metaVal = (re) => { const m = h.match(re); if (!m) return null; const s = m.index + m[0].indexOf('content="') + 9; return [s, s + m[1].length, m[1]]; };
		const d = metaVal(/<meta name="description" content="([^"]*)"/), od = metaVal(/<meta property="og:description" content="([^"]*)"/), td = metaVal(/<meta name="twitter:description" content="([^"]*)"/);
		attrText(P, d[0], d[1], 'seo.descricao', 'Descrição para o Google e redes sociais', { multiline: true, description: 'Resumo da página usado pelo Google e no compartilhamento. Ideal: até 160 caracteres.' });
		for (const x of [od, td]) { if (x[2] !== d[2]) throw new Error(P.def.id + ': og/twitter description differs from description'); rep(P, x[0], x[1], '{{a:seo.descricao}}'); }
		const ot = metaVal(/<meta property="og:title" content="([^"]*)"/), tt = metaVal(/<meta name="twitter:title" content="([^"]*)"/);
		attrText(P, ot[0], ot[1], 'seo.titulo_social', 'Título no compartilhamento (redes sociais)');
		if (tt[2] !== ot[2]) throw new Error(P.def.id + ': twitter:title differs'); rep(P, tt[0], tt[1], '{{a:seo.titulo_social}}');
	}
	// institutional footer (every page)
	const f = '© 2026 GDECOM &#8211; Organização da Sociedade Civil sem fins lucrativos | CNPJ 21.516.315/0001-66 | ';
	const i = h.indexOf(f); if (i < 0 || h.indexOf(f, i + 1) >= 0) throw new Error(P.def.id + ': footer text not found exactly once');
	const a = i, b = i + '© 2026 GDECOM &#8211; Organização da Sociedade Civil sem fins lucrativos'.length;
	site(P, a, b, 'rodape_texto');
	const c = h.indexOf('21.516.315/0001-66', b); site(P, c, c + 18, 'cnpj');
}

// ---------------------------------------------------------------- generic component walker
const TEXT_GROUP = new Set(['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'hr']);
const INLINE = new Set(['span', 'strong', 'em', 'b', 'i', 'br', 'small', 'sup', 'sub', 'u', 's']);
const FIXED = new Set(['svg', 'script', 'style', 'form', 'iframe', 'input', 'textarea', 'select', 'button', 'label', 'picture', 'source', 'br']);
const LABEL_WORDS = { titulo: 'Título', title: 'Título', desc: 'Descrição', descricao: 'Descrição', eyebrow: 'Chamada acima do título', tagline: 'Frase de destaque', texto: 'Texto', text: 'Texto', selo: 'Selo', label: 'Rótulo', num: 'Número', fone: 'Telefone', btn: 'Botão', cta: 'Chamada', split: 'Bloco texto e imagem', gallery: 'Galeria', pillar: 'Pilar', pillars: 'Pilares', dimension: 'Dimensão', dimensions: 'Dimensões', pair: 'Par de destaques', final: 'Imagem final', visual: 'Ilustração', hero: 'Topo da página', col: 'Coluna', chip: 'Ícone', card: 'Cartão', item: 'Item', foto: 'Foto', heading: 'Subtítulo', star: 'Estrela', quote: 'Citação', figure: 'Figura', caption: 'Legenda' };
function humanize(name) { return name.split('_').map((w) => LABEL_WORDS[w] || (/^\d+$/.test(w) ? w : w)).join(' ').replace(/^\w/, (c) => c.toUpperCase()); }
function nameFor(P, node, scope) {
	const c = H.cls(node).filter((x) => !/^(wp-block|has-|is-|alignwide|aligncenter)/.test(x))[0];
	let base = c ? c.replace(new RegExp('^(' + ['creche', 'qualif', 'qualificacao', 'scfv', 'atendimento', 'maior-cuidado', 'cuidado', 'historia', 'volei', 'artigo', 'programa'].join('|') + ')-'), '') : node.tag;
	base = base.replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_|_$/g, '') || node.tag;
	return uniqueName(P, scope + base);
}
const hasElementChildren = (n) => (n.children || []).some((c) => c.type === 'el');
const onlyInline = (n) => (n.children || []).every((c) => c.type !== 'el' || (INLINE.has(c.tag) && onlyInline(c)));
const nonBlankText = (P, n) => (n.children || []).some((c) => c.type === 'text' && P.h.slice(c.start, c.end).trim());

function walkComponent(P, node, scope, labelPrefix) {
	for (const ch of node.children || []) {
		if (ch.type === 'text') {
			const t = P.h.slice(ch.start, ch.end);
			if (t.trim() && hasElementChildren(node)) { let a = ch.start, b = ch.end; while (/\s/.test(P.h[a])) a++; while (/\s/.test(P.h[b - 1])) b--; const n = uniqueName(P, scope + 'texto'); text(P, a, b, n, labelPrefix + humanize(n.split('.').pop())); }
			continue;
		}
		if (ch.type !== 'el' || FIXED.has(ch.tag)) continue;
		if (H.getAttr(ch.open, 'aria-hidden') === 'true') continue; // decorative (arrows, dots, icons): stays fixed
		if (ch.tag === 'img') { const n = nameFor(P, ch, scope).replace(/_?img$/, '') || uniqueName(P, scope + 'imagem'); image(P, ch, n.endsWith('.') ? n + 'imagem' : n, labelPrefix + 'Imagem ' + humanize(n.split('.').pop())); continue; }
		if (ch.tag === 'a') {
			const href = H.getAttr(ch.open, 'href') || '';
			if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|(www\.)?instagram\.com)\//i.test(href)) {
				const n = uniqueName(P, scope + (/instagram/i.test(href) ? 'instagram_link' : 'whatsapp_link'));
				const s = ch.start + ch.open.indexOf(href); attrText(P, s, s + href.length, n, labelPrefix + (/instagram/i.test(href) ? 'Link do Instagram' : 'Link do WhatsApp'), { description: /instagram/i.test(href) ? 'Endereço completo do perfil, ex.: https://www.instagram.com/perfil/' : 'Link completo do WhatsApp, ex.: https://wa.me/5531999999999' });
			}
		}
		const label = H.cls(ch)[0] || ch.tag;
		if (!hasElementChildren(ch) && nonBlankText(P, ch)) { const [a, b] = innerTrim(P, ch); const n = nameFor(P, ch, scope); text(P, a, b, n, labelPrefix + humanize(n.split('.').pop()), { multiline: ['p', 'div'].includes(ch.tag) }); continue; }
		const decorativeInside = H.find(ch, (e) => H.getAttr(e.open, 'aria-hidden') === 'true').length > 0;
		if (hasElementChildren(ch) && onlyInline(ch) && nonBlankText(P, ch) && !decorativeInside && ['p', 'h1', 'h2', 'h3', 'h4', 'li', 'div'].includes(ch.tag)) { const [a, b] = innerTrim(P, ch); const n = nameFor(P, ch, scope); html(P, a, b, n, labelPrefix + humanize(n.split('.').pop())); continue; }
		walkComponent(P, ch, scope, labelPrefix);
	}
}
// .artigo-content: consecutive text elements become one rich-text section; components are walked.
function walkContent(P, node, scope) {
	let group = null, n = 0;
	const flush = () => { if (!group) return; n++; html(P, group.a, group.b, uniqueName(P, scope + 'texto_' + n), 'Texto ' + n, { description: 'Parágrafos, subtítulos e listas desta parte da página.' }); group = null; };
	for (const ch of node.children) {
		const decorated = ch.type === 'el' && TEXT_GROUP.has(ch.tag) && H.find(ch, (e) => e.tag === 'svg').length > 0;
		const isText = ch.type === 'el' && TEXT_GROUP.has(ch.tag) && !decorated;
		const blank = ch.type === 'text' && !P.h.slice(ch.start, ch.end).trim();
		if (isText) { if (!group) group = { a: ch.start, b: ch.end }; else group.b = ch.end; continue; }
		if (blank) continue;
		flush();
		// Heading with a decorative icon (e.g. star): the icon stays fixed, only the heading text is editable.
		if (decorated) { const s = uniqueName(P, scope + 'subtitulo'); walkComponent(P, { children: [ch] }, s + '.', 'Subtítulo — '); continue; }
		if (ch.type !== 'el' || FIXED.has(ch.tag)) continue;
		if (ch.tag === 'img') { image(P, ch, uniqueName(P, scope + 'imagem'), 'Imagem'); continue; }
		const name = nameFor(P, ch, scope);
		walkComponent(P, ch, name + '.', humanize(name.split('.').pop()) + ' — ');
	}
	flush();
}
function generic(P) {
	const root = H.parse(P.h);
	const main = H.find(root, (e) => e.tag === 'main')[0];
	for (const ch of main.children) {
		if (ch.type !== 'el') continue;
		const c = H.cls(ch);
		if (c.includes('artigo-hero')) walkComponent(P, ch, 'topo.', 'Topo — ');
		else if (c.includes('artigo-body-wrap')) {
			for (const b of ch.children) {
				if (b.type !== 'el') continue;
				if (b.tag === 'img') image(P, b, uniqueName(P, 'imagem_principal'), 'Imagem principal');
				else if (H.cls(b).includes('artigo-content')) walkContent(P, b, 'conteudo.');
				else walkComponent(P, b, nameFor(P, b, '') + '.', humanize(H.cls(b)[0] || b.tag) + ' — ');
			}
		} else if (c.includes('programa-cta-wrap')) walkComponent(P, ch, 'chamada.', 'Chamada final — ');
	}
}

// ---------------------------------------------------------------- articles (fixed article schema)
function article(P) {
	const root = H.parse(P.h);
	const main = H.find(root, (e) => e.tag === 'main')[0];
	const hero = main.children.find((c) => c.type === 'el' && H.cls(c).includes('artigo-hero'));
	const eyebrow = H.find(hero, (e) => H.cls(e).includes('artigo-hero-eyebrow'))[0];
	const h1 = H.find(hero, (e) => e.tag === 'h1')[0];
	const tag = H.find(hero, (e) => H.cls(e).some((x) => /-hero-tagline$/.test(x)))[0];
	text(P, ...innerTrim(P, eyebrow), 'chamada', 'Chamada acima do título');
	text(P, ...innerTrim(P, h1), 'titulo', 'Título do artigo');
	text(P, ...innerTrim(P, tag), 'destaque', 'Frase de destaque', { multiline: true });
	const wrap = main.children.find((c) => c.type === 'el' && H.cls(c).includes('artigo-body-wrap'));
	const img = wrap.children.find((c) => c.type === 'el' && c.tag === 'img');
	image(P, img, 'imagem', 'Imagem principal');
	const body = wrap.children.find((c) => c.type === 'el' && H.cls(c).includes('artigo-content'));
	html(P, body.innerStart, body.innerEnd, 'body', 'Texto do artigo');
	// Social image follows the article image (also for new articles built from the model template)
	const leadRel = H.getAttr(img.open, 'src');
	for (const re of [/<meta property="og:image" content="([^"]*)"/, /<meta name="twitter:image" content="([^"]*)"/]) {
		const m = P.h.match(re);
		if (m && m[1] === leadRel) { const s = m.index + m[0].indexOf('content="') + 9; rep(P, s, s + m[1].length, '{{x:og_image}}'); }
	}
}

// ---------------------------------------------------------------- Home (explicit spec)
function home(P) {
	const h = P.h;
	const root = H.parse(h);
	const byData = (id) => H.find(root, (e) => H.getAttr(e.open, 'data-id') === id || H.getAttr(e.open, 'data-interaction-id') === id)[0];
	const inner = (n) => innerTrim(P, n);
	const first = (n, pred) => H.find(n, pred)[0];
	text(P, ...inner(byData('c4d20be')), 'hero.titulo', 'Título principal');
	text(P, ...inner(byData('a47dbff')), 'hero.texto', 'Texto de apresentação', { multiline: true });
	// Quem somos: "Uma organização feita pela <span class=quemsomos-highlight>força coletiva</span>"
	const qs = byData('510de81'); const hl = first(qs, (e) => H.cls(e).includes('quemsomos-highlight'));
	text(P, qs.innerStart, hl.start, 'quem_somos.titulo', 'Quem somos — título (início)', { description: 'Primeira parte do título, antes do trecho destacado.' });
	text(P, ...inner(hl), 'quem_somos.titulo_destaque', 'Quem somos — título (trecho destacado)');
	text(P, ...inner(byData('b4a1765')), 'quem_somos.texto', 'Quem somos — texto', { multiline: true });
	text(P, ...inner(first(root, (e) => H.cls(e).includes('qs-selo'))), 'quem_somos.selo', 'Quem somos — selo amarelo');
	text(P, ...inner(byData('c0b1b50')), 'servicos.titulo', 'Programas — título da seção');
	text(P, ...inner(byData('fa39c3d')), 'servicos.texto', 'Programas — texto da seção', { multiline: true });
	const CARDS = [['9ced3d9', 'atendimento', 'Atendimento Educacional Integrado'], ['4e07a7d', 'creche', 'Creche Patatí-Patatá'], ['5ab0c7e', 'maior_cuidado', 'Programa Maior Cuidado'], ['de31850', 'qualificacao', 'Qualificação Profissional'], ['71f4271', 'scfv', 'SCFV']];
	for (const [id, key, name] of CARDS) {
		const w = byData(id);
		image(P, first(w, (e) => e.tag === 'img'), `programas.${key}.imagem`, `Cartão ${name} — imagem`);
		text(P, ...inner(first(first(w, (e) => e.tag === 'h3'), (e) => e.tag === 'a')), `programas.${key}.titulo`, `Cartão ${name} — título`);
		auto(P, ...inner(first(w, (e) => H.cls(e).includes('elementor-icon-box-description'))), `programas.${key}.descricao`, `Cartão ${name} — descrição`, { multiline: true });
	}
	text(P, ...inner(byData('f19ccd4')), 'projetos.titulo', 'Projetos — título da seção');
	for (const [id, key, name] of [['6a4af83', 'volei', 'Vôlei'], ['38cc992', 'conecsons', 'CONECSONS-CRJ']]) {
		const w = byData(id);
		image(P, first(w, (e) => e.tag === 'img'), `projetos.${key}.imagem`, `Projeto ${name} — imagem`);
		const cat = first(w, (e) => e.tag === 'h2'); const strong = first(cat, (e) => e.tag === 'strong');
		text(P, ...inner(strong || cat), `projetos.${key}.categoria`, `Projeto ${name} — categoria`);
		text(P, ...inner(first(first(w, (e) => e.tag === 'h3'), (e) => e.tag === 'a')), `projetos.${key}.titulo`, `Projeto ${name} — título`);
		auto(P, ...inner(first(w, (e) => H.cls(e).includes('elementor-icon-box-description'))), `projetos.${key}.descricao`, `Projeto ${name} — descrição`, { multiline: true });
	}
	text(P, ...inner(byData('e68294e')), 'parcerias.titulo', 'Parcerias (Vozes) — título da seção');
	text(P, ...inner(byData('f7fc2d7')), 'parcerias.texto', 'Parcerias (Vozes) — texto da seção', { multiline: true });
	// Vozes: two article cards. Title + links come from the chosen article; image and summary are card fields.
	const posts = H.find(root, (e) => e.tag === 'article' && H.cls(e).includes('elementor-post'));
	if (posts.length !== 2) throw new Error('home: expected 2 Vozes cards');
	posts.forEach((post, i) => {
		const href = H.getAttr(first(post, (e) => e.tag === 'a').open, 'href');
		const slug = href.split('/')[1];
		setPath(P.content, `vozes.${i}.artigo`, slug);
		field(P, { path: `vozes.${i}.artigo`, type: 'reference', label: `Vozes — artigo ${i + 1}`, required: true, description: 'Artigo exibido neste cartão (o título e o link vêm do artigo).' });
		for (const a of H.find(post, (e) => e.tag === 'a')) { const s = a.start + a.open.indexOf(href); rep(P, s, s + href.length, `{{x:vozes.${i}.href}}`); }
		const t = first(first(post, (e) => e.tag === 'h3'), (e) => e.tag === 'a'); const [ta, tb] = inner(t);
		P.meta.computed[`vozes.${i}.titulo_raw`] = h.slice(ta, tb); rep(P, ta, tb, `{{x:vozes.${i}.titulo}}`);
		image(P, first(post, (e) => e.tag === 'img'), `vozes.${i}.imagem`, `Vozes — imagem do cartão ${i + 1}`);
		const ex = first(first(post, (e) => H.cls(e).includes('elementor-post__excerpt')), (e) => e.tag === 'p');
		text(P, ...inner(ex), `vozes.${i}.resumo`, `Vozes — resumo do cartão ${i + 1}`, { multiline: true });
		const rm = first(post, (e) => H.cls(e).includes('elementor-post__read-more')); const al = H.getAttr(rm.open, 'aria-label');
		if (al) { const s = rm.start + rm.open.indexOf(al); P.meta.computed[`vozes.${i}.aria_raw`] = al; rep(P, s, s + al.length, `{{x:vozes.${i}.aria}}`); }
	});
	text(P, ...inner(byData('ce8df52')), 'galeria.titulo', 'Galeria (carrossel) — título da seção');
	text(P, ...inner(byData('c1353b0')), 'galeria.texto', 'Galeria (carrossel) — texto da seção', { multiline: true });
	const slides = H.find(byData('56537ef'), (e) => e.tag === 'a' && H.getAttr(e.open, 'data-elementor-open-lightbox') === 'yes');
	if (slides.length !== 8) throw new Error('home: expected 8 carousel slides');
	slides.forEach((a, i) => {
		const t = H.getAttr(a.open, 'data-elementor-lightbox-title'); const s = a.start + a.open.indexOf('data-elementor-lightbox-title="') + 31;
		attrText(P, s, s + t.length, `galeria.fotos.${i}.titulo`, `Foto ${i + 1} — legenda`);
		const hash = H.getAttr(a.open, 'data-e-action-hash'); const hs = a.start + a.open.indexOf(hash);
		P.meta.computed[`galeria.fotos.${i}.hash_raw`] = hash; rep(P, hs, hs + hash.length, `{{x:galeria.fotos.${i}.hash}}`);
		image(P, first(a, (e) => e.tag === 'img'), `galeria.fotos.${i}.foto`, `Foto ${i + 1}`);
	});
	const eyebrows = H.find(root, (e) => H.cls(e).includes('elementor-icon-list-text'));
	const cola = eyebrows.find((e) => h.slice(e.innerStart, e.innerEnd).includes('COLA COM A GENTE'));
	text(P, ...inner(cola), 'chamada_historia.chamada', 'Faixa com foto — chamada acima do título');
	const b8 = byData('b863a2e'); const br = h.indexOf('<br>', b8.innerStart);
	text(P, b8.innerStart, br, 'chamada_historia.titulo_linha_1', 'Faixa com foto — título (linha 1)');
	text(P, br + 4, b8.innerEnd, 'chamada_historia.titulo_linha_2', 'Faixa com foto — título (linha 2)');
	text(P, ...inner(byData('7be0371')), 'chamada_historia.texto', 'Faixa com foto — texto', { multiline: true });
	const btn = first(root, (e) => H.cls(e).includes('cta-foto-btn')); const bs = btn.innerStart; const be = h.indexOf('<svg', bs);
	text(P, bs, be, 'chamada_historia.botao', 'Faixa com foto — texto do botão');
	text(P, ...inner(first(root, (e) => H.cls(e).includes('contato-apoio'))), 'contato.titulo', 'Contato — título');
	text(P, ...inner(first(root, (e) => H.cls(e).includes('contato-apoio-txt'))), 'contato.texto', 'Contato — texto', { multiline: true });
	text(P, ...inner(first(root, (e) => H.cls(e).includes('gcard-title'))), 'contato.cartao_titulo', 'Contato — título do cartão');
	text(P, ...inner(first(root, (e) => H.cls(e).includes('gcard-sub'))), 'contato.cartao_subtitulo', 'Contato — subtítulo do cartão');
	// contact data from content/site.json
	const card = first(root, (e) => H.cls(e).includes('gcard'));
	const R = { from: card.start, to: card.end };
	literal(P, 'Rua Cajuí, 100&nbsp;—', '{{s:endereco.logradouro}}&nbsp;—', R);
	literal(P, '<span class="gcard-nw">Bairro Suzana</span>', '<span class="gcard-nw">{{s:endereco.bairro}}</span>', R);
	literal(P, 'Belo Horizonte / MG&nbsp;—', '{{s:endereco.cidade}} / {{s:endereco.uf}}&nbsp;—', R);
	literal(P, 'CEP 31260-480', 'CEP {{s:endereco.cep}}', R);
	literal(P, 'Tel.: (31) 3497-7255', 'Tel.: {{s:telefone}}', R);
	literal(P, 'tel:+553134977255', '{{x:tel}}', { from: 0, to: h.length, count: null });
	literal(P, 'mailto:gdecom@gdecom.org.br', 'mailto:{{s:email}}', { count: null });
	literal(P, '>gdecom@gdecom.org.br<', '>{{s:email}}<', R);
	literal(P, 'https://www.instagram.com/gdecom/', '{{s:instagram_url}}', { count: null });
	literal(P, '>@gdecom<', '>{{s:instagram}}<', R);
	literal(P, 'https://www.google.com/maps?q=Rua+Caju%C3%AD,+100,+Bairro+Suzana,+Belo+Horizonte/MG', '{{x:maps}}', { count: null });
}

// ---------------------------------------------------------------- Fale com a gente (explicit spec)
function contato(P) {
	const h = P.h; const root = H.parse(h);
	const first = (n, pred) => H.find(n, pred)[0];
	const hero = first(root, (e) => H.cls(e).includes('fcg-hero'));
	walkComponent(P, hero, 'topo.', 'Topo — ');
	const labels = H.find(root, (e) => H.cls(e).includes('fcg-card-label'));
	const names = ['endereco', 'telefone', 'email', 'instagram'];
	labels.forEach((l, i) => text(P, ...innerTrim(P, l), `cartoes.${names[i]}_rotulo`, `Cartão ${['Endereço', 'Telefone', 'E-mail', 'Instagram'][i]} — rótulo`));
	const form = first(root, (e) => H.cls(e).includes('fcg-form'));
	text(P, ...innerTrim(P, first(form, (e) => e.tag === 'h2')), 'formulario.titulo', 'Formulário — título');
	text(P, ...innerTrim(P, first(form, (e) => H.cls(e).includes('fcg-form-note'))), 'formulario.explicacao', 'Formulário — texto explicativo', { multiline: true });
	const cta = first(root, (e) => H.cls(e).includes('fcg-cta'));
	walkComponent(P, cta, 'chamada_final.', 'Chamada final — ');
	literal(P, '<p class="fcg-card-value">Rua Cajuí, 100, Bairro Suzana, Belo Horizonte/MG</p>', '<p class="fcg-card-value">{{s:endereco.logradouro}}, {{s:endereco.bairro}}, {{s:endereco.cidade}}/{{s:endereco.uf}}</p>');
	literal(P, '<p class="fcg-card-value">(31) 3497-7255</p>', '<p class="fcg-card-value">{{s:telefone}}</p>');
	literal(P, '<p class="fcg-card-value">gdecom@gdecom.org.br</p>', '<p class="fcg-card-value">{{s:email}}</p>');
	literal(P, '<p class="fcg-card-value">@gdecom</p>', '<p class="fcg-card-value">{{s:instagram}}</p>');
	literal(P, 'tel:+553134977255', '{{x:tel}}');
	literal(P, 'mailto:gdecom@gdecom.org.br', 'mailto:{{s:email}}', { count: 2 });
	literal(P, 'https://www.instagram.com/gdecom/', '{{s:instagram_url}}');
	literal(P, 'https://www.google.com/maps?q=Rua+Caju%C3%AD,+100,+Bairro+Suzana,+Belo+Horizonte/MG', '{{x:maps}}', { count: 2 });
}

// ---------------------------------------------------------------- run
const H_RENDER = require('../../build/lib/render');
const out = { schema: {}, pages: [] };
for (const def of PAGES) {
	const P = Page(def);
	common(P);
	if (def.kind === 'home') home(P);
	else if (def.kind === 'contato') contato(P);
	else if (def.kind === 'generic') generic(P);
	else if (def.kind === 'article') article(P);
	// build template
	let t = P.h;
	for (const r of [...P.reps].sort((a, b) => b.start - a.start)) t = t.slice(0, r.start) + r.token + t.slice(r.end);
	const tplName = def.kind === 'article' ? 'templates/artigos/' + def.slug + '.html' : 'templates/' + def.file;
	fs.mkdirSync(path.join(ROOT, path.dirname(tplName)), { recursive: true });
	fs.writeFileSync(path.join(ROOT, tplName), t);
	fs.writeFileSync(path.join(ROOT, tplName.replace(/\.html$/, '.meta.json')), JSON.stringify({ page: def.id, depth: P.depth, entities: P.meta.entities, slots: P.meta.slots, computed: P.meta.computed }, null, 1));
	if (def.content) {
		fs.mkdirSync(path.join(ROOT, path.dirname(def.content)), { recursive: true });
		if (def.kind === 'article') {
			const { body, ...fm } = P.content;
			fs.writeFileSync(path.join(ROOT, def.content), H_RENDER.toFrontmatter(fm, body));
		} else fs.writeFileSync(path.join(ROOT, def.content), JSON.stringify(P.content, null, 2) + '\n');
		out.schema[def.content] = { label: def.label, kind: def.kind, fields: P.schema };
	}
	out.pages.push({ id: def.id, file: def.file, template: tplName, content: def.content || null, kind: def.kind, fields: P.schema.length, slots: Object.keys(P.meta.slots).length, tokens: P.reps.length });
	console.log(`${def.id.padEnd(70).slice(0, 70)} fields ${String(P.schema.length).padStart(3)}  images ${String(Object.keys(P.meta.slots).length).padStart(3)}  tokens ${P.reps.length}`);
}
fs.writeFileSync(path.join(ROOT, 'content', 'site.json'), JSON.stringify(SITE, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'templates', '_site.meta.json'), JSON.stringify({ entities: SITE_ENT }, null, 1));
fs.writeFileSync(path.join(ROOT, 'tools', 'migration', 'schema.json'), JSON.stringify(out, null, 1));
console.log('done');
