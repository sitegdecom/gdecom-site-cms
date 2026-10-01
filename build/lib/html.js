// HTML utilities shared by the build and the one-time migration extractor.
// No dependencies. Works on byte offsets so templates can be cut out of the approved HTML exactly.
'use strict';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'svg', 'textarea']); // contents are opaque (never edited field by field)

// ---------- entities ----------
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', rarr: '→', larr: '←', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×', copy: '©', middot: '·', bull: '•', deg: '°', ordm: 'º', ordf: 'ª' };
function decode(s) {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
		if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
		return Object.prototype.hasOwnProperty.call(NAMED, e.toLowerCase()) ? NAMED[e.toLowerCase()] : m;
	});
}
// Plain text -> HTML text. `prefer` maps characters to the entity spelling used by the approved page (keeps output byte-identical).
function encodeText(s, prefer = {}) {
	let out = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	for (const [ch, ent] of Object.entries(prefer)) out = out.split(ch).join(ent);
	return out;
}
function encodeAttr(s, prefer = {}) { return encodeText(s, prefer).replace(/"/g, '&quot;'); }

// Which entity spellings does a raw snippet use? -> {char: '&entity;'} so encode(decode(raw)) === raw when possible.
function entityPreferences(raw) {
	const prefer = {};
	for (const m of raw.matchAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi)) {
		const ch = decode(m[0]);
		if (ch !== m[0] && !['&', '<', '>'].includes(ch)) prefer[ch] = m[0];
	}
	return prefer;
}

// ---------- attributes ----------
function getAttr(tag, name) {
	const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
	return m ? (m[2] !== undefined ? m[2] : m[3]) : null;
}
// Replace (or append before the tag end) an attribute value; value must already be attribute-encoded.
function setAttr(tag, name, value) {
	const re = new RegExp('(\\s' + name + '\\s*=\\s*)("[^"]*"|\'[^\']*\')', 'i');
	if (re.test(tag)) return tag.replace(re, (m, a) => a + '"' + value.replace(/\$/g, '$$$$') + '"');
	return tag.replace(/\s*(\/?)>$/, (m, slash) => ' ' + name + '="' + value + '"' + (slash ? ' /' : '') + '>');
}

// ---------- parser (byte offsets) ----------
// Node: {type:'el', tag, start, openEnd, innerStart, innerEnd, end, open, children} | {type:'text', start, end}
function parse(h, from = 0, to = h.length) {
	const root = { type: 'root', children: [], innerStart: from, innerEnd: to };
	const stack = [root];
	const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
	re.lastIndex = from;
	let last = from, m;
	const pushText = (a, b) => { if (b > a) stack[stack.length - 1].children.push({ type: 'text', start: a, end: b }); };
	while ((m = re.exec(h)) && m.index < to) {
		pushText(last, m.index);
		last = re.lastIndex;
		if (m[0].startsWith('<!--')) { stack[stack.length - 1].children.push({ type: 'comment', start: m.index, end: re.lastIndex }); continue; }
		if (m[1]) { // closing tag
			const tag = m[1].toLowerCase();
			for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) {
				while (stack.length - 1 > i) { const n = stack.pop(); n.innerEnd = n.end = m.index; }
				const n = stack.pop(); n.innerEnd = m.index; n.end = re.lastIndex; break;
			}
			continue;
		}
		const tag = m[2].toLowerCase();
		const node = { type: 'el', tag, start: m.index, open: m[0], openEnd: re.lastIndex, innerStart: re.lastIndex, children: [] };
		stack[stack.length - 1].children.push(node);
		if (VOID.has(tag) || m[0].endsWith('/>')) { node.innerEnd = node.end = re.lastIndex; continue; }
		if (RAW.has(tag)) {
			const close = h.toLowerCase().indexOf('</' + tag, re.lastIndex);
			const closeEnd = h.indexOf('>', close) + 1;
			node.innerEnd = close; node.end = closeEnd; re.lastIndex = last = closeEnd; continue;
		}
		stack.push(node);
	}
	pushText(last, to);
	return root;
}
const cls = (node) => (getAttr(node.open || '', 'class') || '').trim().split(/\s+/).filter(Boolean);
function find(node, pred, out = []) { for (const c of node.children || []) { if (c.type === 'el') { if (pred(c)) out.push(c); find(c, pred, out); } } return out; }

// ---------- rich text sanitizer ----------
const ALLOWED = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'a', 'br', 'hr', 'blockquote', 'span', 'sup', 'sub', 'small', 'u', 's']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'svg', 'math', 'template', 'noscript']);
const ALLOWED_ATTR = /^(class|href|target|rel|title|id|lang|aria-[a-z-]+)$/i;
// Returns the HTML unchanged when it only uses allowed markup (so approved content stays byte-identical).
function sanitize(html) {
	let s = html;
	for (const t of DROP_WITH_CONTENT) s = s.replace(new RegExp('<' + t + '\\b[\\s\\S]*?</' + t + '\\s*>', 'gi'), '').replace(new RegExp('<' + t + '\\b[^>]*>', 'gi'), '');
	s = s.replace(/<!--[\s\S]*?-->/g, '');
	return s.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (tagStr, name, attrs) => {
		const t = name.toLowerCase();
		if (!ALLOWED.has(t)) return '';
		if (tagStr[1] === '/') return tagStr;
		let bad = false;
		const kept = attrs.replace(/\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g, (a, an, eq, v) => {
			if (!ALLOWED_ATTR.test(an)) { bad = true; return ''; }
			if (/^href$/i.test(an) && v && /^["']?\s*(javascript|data|vbscript):/i.test(v)) { bad = true; return ''; }
			return a;
		});
		return bad ? '<' + name + kept + '>' : tagStr;
	});
}

module.exports = { VOID, decode, encodeText, encodeAttr, entityPreferences, getAttr, setAttr, parse, cls, find, sanitize };
