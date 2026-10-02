// Template rendering: replaces {{type:path}} tokens with content values.
//   {{t:path}} plain text        {{a:path}} attribute text      {{h:path}} rich text (sanitized HTML)
//   {{i:path}} image slot        {{s:key}}  site data (content/site.json)   {{x:name}} computed value
'use strict';
const yaml = require('js-yaml');
const H = require('./html');
const { renderSlot, elementorHash, toRel } = require('./images');

const get = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

function parseFrontmatter(src) {
	const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!m) throw new Error('front matter (---) ausente');
	return { ...(yaml.load(m[1]) || {}), body: m[2] };
}
function toFrontmatter(data, body) {
	return '---\n' + yaml.dump(data, { lineWidth: -1, quotingType: '"' }) + '---\n' + body;
}

// Google Maps query in the approved spelling: spaces -> '+', non-ASCII percent-encoded, ',' and '/' kept.
function mapsQuery(site) {
	const e = site.endereco;
	const q = `${e.logradouro}, ${e.bairro}, ${e.cidade}/${e.uf}`;
	return [...q].map((ch) => (ch === ' ' ? '+' : /[A-Za-z0-9,/.\-]/.test(ch) ? ch : encodeURIComponent(ch))).join('');
}
const telHref = (site) => 'tel:+55' + String(site.telefone).replace(/\D/g, '');

// Resolve a Pages CMS reference value (slug, file name or file path) to an article slug.
const refSlug = (v) => String(v || '').replace(/\\/g, '/').split('/').pop().replace(/\.md$/i, '');

const INLINE_CONTEXT = /<(p|span|h[1-6]|a|li|figcaption)\b[^>]*>\s*$/;
function unwrapParagraphs(html) {
	const m = html.match(/^(\s*)<p(?:\s[^>]*)?>([\s\S]*)<\/p>(\s*)$/);
	if (!m) return html;
	return m[1] + m[2].replace(/<\/p>\s*<p(?:\s[^>]*)?>/g, '<br>') + m[3];
}

async function render(template, meta, content, ctx) {
	const { site, siteEntities, articles, errors } = ctx;
	const prefix = meta.depth === null ? '/' : '../'.repeat(meta.depth);
	const slotCtx = { ...ctx, prefix, page: ctx.pageLabel };
	const tokens = [...template.matchAll(/\{\{([a-z]):([^}]+)\}\}/g)];
	const values = new Map();
	for (const m of tokens) {
		const [whole, type, key] = m;
		if (values.has(whole)) continue;
		let v;
		if (type === 't' || type === 'a') {
			const raw = get(content, key);
			if (raw === undefined || raw === null || String(raw).trim() === '') { errors.push(`${ctx.pageLabel}: campo obrigatório vazio (${key})`); v = ''; }
			else v = (type === 't' ? H.encodeText : H.encodeAttr)(String(raw), (meta.entities || {})[key] || {});
		} else if (type === 'h') {
			const raw = get(content, key);
			if (raw === undefined || raw === null || String(raw).trim() === '') { errors.push(`${ctx.pageLabel}: texto obrigatório vazio (${key})`); v = ''; }
			else {
				v = H.sanitize(String(raw));
				// The Pages CMS editor wraps rich text in <p>. When the template already puts the field inside a paragraph-like
				// element, that wrapper would nest (<p><p>…</p></p>): unwrap it, turning extra paragraphs into line breaks.
				if (INLINE_CONTEXT.test(template.slice(Math.max(0, m.index - 300), m.index))) v = unwrapParagraphs(v);
			}
		} else if (type === 'i') {
			const slot = meta.slots[key];
			const val = get(content, key) || {};
			v = await renderSlot({ ...slot, label: slot.label }, val.imagem, val.texto_alternativo, slotCtx);
		} else if (type === 's') {
			const raw = get(site, key);
			if (raw === undefined || String(raw).trim() === '') { errors.push(`Dados institucionais: campo vazio (${key})`); v = ''; }
			else v = H.encodeText(String(raw), (siteEntities || {})[key] || {});
		} else if (type === 'x') {
			v = computed(key, meta, content, { ...ctx, prefix });
		} else errors.push(`${ctx.pageLabel}: token desconhecido ${whole}`);
		values.set(whole, v);
	}
	return template.replace(/\{\{([a-z]):([^}]+)\}\}/g, (whole) => values.get(whole));
}

function computed(key, meta, content, ctx) {
	const { site, articles, errors, prefix } = ctx;
	if (key === 'tel') return telHref(site);
	if (key === 'maps') return 'https://www.google.com/maps?q=' + mapsQuery(site);
	if (key === 'og_image') return toRel(get(content, 'imagem.imagem') || '', prefix);
	let m;
	if ((m = key.match(/^vozes\.(\d)\.(href|titulo|aria)$/))) {
		const slug = refSlug(get(content, `vozes.${m[1]}.artigo`));
		const art = articles[slug];
		if (!art) { errors.push(`Página inicial: artigo escolhido em "Vozes ${+m[1] + 1}" não existe (${slug || 'vazio'})`); return ''; }
		if (m[2] === 'href') return prefix + 'artigos/' + slug + '/index.html';
		const rawTitle = meta.computed[`vozes.${m[1]}.titulo_raw`];
		const sameTitle = rawTitle !== undefined && H.decode(rawTitle) === art.titulo;
		if (m[2] === 'titulo') return sameTitle ? rawTitle : H.encodeText(art.titulo);
		const rawAria = meta.computed[`vozes.${m[1]}.aria_raw`];
		if (sameTitle && rawAria !== undefined) return rawAria;
		return H.encodeAttr('Saiba mais sobre ' + art.titulo);
	}
	if ((m = key.match(/^galeria\.fotos\.(\d+)\.hash$/))) {
		const raw = meta.computed[`galeria.fotos.${m[1]}.hash_raw`];
		const slot = meta.slots[`galeria.fotos.${m[1]}.foto`];
		const src = get(content, `galeria.fotos.${m[1]}.foto.imagem`);
		return src === slot.originalSrc ? raw : elementorHash(raw, src.replace(/^\//, ''));
	}
	errors.push(`${ctx.pageLabel}: valor calculado desconhecido (${key})`);
	return '';
}

module.exports = { render, parseFrontmatter, toFrontmatter, mapsQuery, telHref, refSlug };
