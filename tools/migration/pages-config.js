// Generates .pages.yml (Pages CMS configuration) from the field schema produced by extract.js.
// Re-run after changing labels/help texts here (node tools/migration/pages-config.js); it reads tools/migration/schema.json and content/.
'use strict';
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const { schema } = JSON.parse(fs.readFileSync(path.join(__dirname, 'schema.json'), 'utf8'));
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp'];

// ---- Portuguese labels from the technical keys
const GROUPS = {
	seo: 'Busca e compartilhamento', topo: 'Topo da página', hero: 'Topo (mensagem principal)', quem_somos: 'Quem somos', servicos: 'Seção Programas',
	programas: 'Cartões dos programas', atendimento: 'Atendimento Educacional Integrado', creche: 'Creche Patatí-Patatá', maior_cuidado: 'Programa Maior Cuidado',
	qualificacao: 'Qualificação Profissional', scfv: 'SCFV', projetos: 'Projetos em destaque', volei: 'Vôlei', conecsons: 'CONECSONS-CRJ', parcerias: 'Seção Parcerias',
	vozes: 'Cartões de artigos (Parcerias)', galeria: 'Galeria de fotos (carrossel)', fotos: 'Fotos do carrossel', chamada_historia: 'Faixa com foto (Nossa história)',
	contato: 'Contato', conteudo: 'Conteúdo da página', chamada: 'Botão final', cartoes: 'Cartões de contato', formulario: 'Formulário', chamada_final: 'Chamada final',
	imagem_principal: 'Imagem principal', gallery: 'Galeria de fotos', pillars: 'Pilares', dimensions: 'Dimensões', pair: 'Destaques lado a lado',
	final_visual: 'Ilustração final', cta: 'Caixa de contato', figure: 'Foto com legenda', split_text: 'Bloco de texto', endereco: 'Endereço'
};
const LEAF = {
	h1: 'Título da página', titulo: 'Título', titulo_destaque: 'Trecho destacado do título', selo: 'Selo', descricao: 'Descrição', categoria: 'Categoria',
	resumo: 'Resumo', artigo: 'Artigo', foto: 'Foto', botao: 'Texto do botão', a: 'Texto do botão', back: 'Texto do botão', explicacao: 'Texto explicativo',
	hero_eyebrow: 'Chamada acima do título', fcg_hero_eyebrow: 'Chamada acima do título', hero_tagline: 'Frase de destaque', fcg_hero_tagline: 'Frase de destaque',
	cta_eyebrow: 'Chamada acima do título', cta_titulo: 'Título', cta_desc: 'Descrição', cta_fone_label: 'Rótulo do número', cta_fone_num: 'Número exibido',
	whatsapp_link: 'Link do WhatsApp', instagram_link: 'Link do Instagram', cta_foto: 'Foto', figcaption: 'Legenda', texto: 'Texto', chamada: 'Chamada acima do título',
	cartao_titulo: 'Título do cartão', cartao_subtitulo: 'Subtítulo do cartão', titulo_linha_1: 'Título — linha 1', titulo_linha_2: 'Título — linha 2',
	endereco_rotulo: 'Rótulo — Endereço', telefone_rotulo: 'Rótulo — Telefone', email_rotulo: 'Rótulo — E-mail', instagram_rotulo: 'Rótulo — Instagram',
	titulo_social: 'Título ao compartilhar (redes sociais)', imagem: 'Imagem'
};
// siblings: keys of the same object (used to drop the number when an item is unique, e.g. "Título" instead of "Título 1").
function label(key, parent, siblings = [], isGroup = false) {
	const m = key.match(/^(.*?)(?:_(\d+))?$/); const base = m[1], n = m[2];
	const unique = !siblings.some((k) => k === base + '_2');
	const inSplit = /^split/.test(parent || '');
	if (parent === 'gallery' && (key === 'imagem' || base === 'img')) return 'Foto ' + (n || 1);
	if (parent === 'seo' && key === 'titulo') return 'Título da aba e do Google';
	if (parent === 'seo' && key === 'descricao') return 'Descrição para o Google e redes sociais';
	if (parent === 'pillars' && (base === 'h3' || base === 'p')) return 'Pilar ' + (n || 1) + (base === 'h3' ? ' — título' : ' — texto');
	if (parent === 'fotos' && key === 'titulo') return 'Legenda da foto';
	if (parent === 'subtitulo' && key === 'texto') return 'Texto do subtítulo';
	if (parent === 'topo' && key === 'p') return 'Texto de apresentação';
	if (parent === 'cta') {
		const cta = { texto: 'Chamada acima do título', texto_2: 'Texto do botão do WhatsApp', texto_3: 'Frase abaixo do botão', cta_fone_num: 'Número do WhatsApp exibido', cta_selo: 'Selo sobre a foto 1', cta_selo_2: 'Selo sobre a foto 2' }[key];
		if (cta) return cta;
	}
	if (inSplit && key === 'texto') return 'Título do bloco';
	if (inSplit && key === 'h2' && unique) return 'Título do bloco';
	if (inSplit && key === 'h3' && unique) return 'Subtítulo do bloco';
	if (parent === 'conteudo' && base === 'texto') return 'Trecho de texto ' + (n || 1);
	if (isGroup && GROUPS[key]) return GROUPS[key];
	if (LEAF[key]) return LEAF[key];
	if (GROUPS[key]) return GROUPS[key];
	const word = { p: 'Parágrafo', h2: 'Título', h3: 'Subtítulo', texto: 'Texto', split: 'Bloco com texto e imagem', subtitulo: 'Subtítulo destacado', img: 'Foto', titulo: 'Título' }[base];
	if (word && !n && unique && !['split', 'subtitulo'].includes(base)) return word;
	if (word) return word + ' ' + (n || 1);
	return key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
// Short help texts for fields that may confuse a non-technical editor.
const HELP = {
	cta_fone_num: 'Escreva o mesmo número usado no link do WhatsApp logo abaixo.',
	cta_selo: 'Frase curta que aparece sobre a foto.', cta_selo_2: 'Frase curta que aparece sobre a foto.'
};
const GROUP_HELP = {
	dimensions: 'Subtítulos e parágrafos na ordem em que aparecem na página.',
	pair: 'Dois quadros de texto exibidos lado a lado, na ordem em que aparecem na página.',
	pillars: 'Quatro quadros, cada um com um título curto e um texto.',
	gallery: 'Troque as fotos sem mudar a quantidade.',
	chamada: 'Botão no fim da página que leva ao perfil do programa.',
	cta: 'Quadro no fim da página com o contato do programa pelo WhatsApp.'
};

// ---- field builders
const imageObject = (name, lbl, desc) => ({
	name, label: lbl, type: 'object', description: desc,
	fields: [
		{ name: 'imagem', label: 'Imagem', type: 'image', required: true, description: 'Envie uma foto em JPG, PNG ou WebP, com até 12 MB. Não precisa diminuir nem converter a foto: o site prepara tudo sozinho.', options: { extensions: IMG_EXT } },
		{ name: 'texto_alternativo', label: 'Texto alternativo (descrição da imagem)', type: 'string', required: true, description: 'Obrigatório. Descreva em uma frase o que aparece na foto, por exemplo: "Crianças pintando um painel no pátio". Ajuda quem usa leitor de tela.' }
	]
});
function leaf(def, key, parent, siblings, value) {
	let lbl = label(key, parent, siblings);
	if (def.type === 'image-object') return imageObject(key, parent === 'split' || /^split/.test(parent || '') ? 'Imagem do bloco' : lbl === 'Imagem' ? 'Imagem' : lbl, def.description);
	if (def.type === 'reference') return { name: key, label: 'Artigo exibido neste cartão', type: 'reference', required: true, description: 'Escolha o artigo que aparece neste cartão da página inicial. O título e o link vêm do próprio artigo. Um artigo novo só aparece na página inicial quando é escolhido aqui.', options: { collection: 'artigos', search: 'titulo' } };
	if (def.type === 'rich-text' && typeof value === 'string' && /^<hr[^>]*>$/.test(value.trim())) lbl = 'Linha divisória';
	const f = { name: key, label: lbl, type: def.type === 'rich-text' ? 'rich-text' : def.type, required: def.required !== false };
	if (def.description) f.description = def.description;
	if (lbl === 'Linha divisória') f.description = 'Apenas uma linha que separa duas partes da página. Normalmente não precisa ser alterada.';
	if (HELP[key]) f.description = HELP[key];
	if (f.type === 'rich-text') f.options = { format: 'html' };
	if (/whatsapp_link$/.test(key)) f.pattern = { regex: '^https://(wa\\.me|api\\.whatsapp\\.com)/', message: 'Use um link do WhatsApp, por exemplo https://wa.me/5531999999999' };
	if (/instagram_link$/.test(key)) f.pattern = { regex: '^https://(www\\.)?instagram\\.com/', message: 'Use o endereço completo do Instagram, por exemplo https://www.instagram.com/perfil/' };
	return f;
}
// flat schema paths -> nested Pages CMS fields (numeric segments become fixed-size lists)
function nest(fields, data) {
	const root = { children: new Map() };
	const counts = {};
	for (const def of fields) {
		const segs = def.path.split('.');
		let node = root, parentKey = null;
		for (let i = 0; i < segs.length; i++) {
			const s = segs[i];
			if (/^\d+$/.test(s)) { counts[segs.slice(0, i).join('.')] = Math.max(counts[segs.slice(0, i).join('.')] || 0, +s + 1); continue; }
			const isLast = i === segs.length - 1;
			const isList = /^\d+$/.test(segs[i + 1] || '');
			if (!node.children.has(s)) node.children.set(s, { key: s, parentKey, def: isLast ? def : null, list: isList ? segs.slice(0, i + 1).join('.') : null, children: new Map() });
			const n = node.children.get(s);
			if (isLast) n.def = def;
			if (isList) n.list = segs.slice(0, i + 1).join('.');
			parentKey = s; node = n;
		}
	}
	const toFields = (node, parentKey, value) => {
		const siblings = [...node.children.keys()];
		const out = [...node.children.values()].map((n) => {
			const v = value == null ? undefined : Array.isArray(value[n.key]) ? value[n.key][0] : value[n.key];
			if (n.def && !n.children.size) return leaf(n.def, n.key, parentKey, siblings, v);
			const f = { name: n.key, label: label(n.key, parentKey, siblings, true), type: 'object', fields: toFields(n, n.key, v) };
			if (GROUP_HELP[n.key]) f.description = GROUP_HELP[n.key];
			if (n.list) { const c = counts[n.list]; f.list = { min: c, max: c }; f.description = `Lista com ${c} itens fixos: troque o conteúdo, a quantidade não muda para preservar o layout.`; }
			// SEO of fixed pages is technical configuration maintained by the administrator: kept in the schema
			// (so Pages CMS preserves the values when saving) but hidden from the editor.
			if (n.key === 'seo' && parentKey === null) f.hidden = true;
			return f;
		});
		// Running text blocks ("Trecho de texto N"): say where they sit on the page.
		const visible = out.filter((f) => !f.hidden);
		let seq = 0;
		visible.forEach((f, i) => {
			if (parentKey !== 'conteudo' || !/^Trecho de texto/.test(f.label)) return;
			f.label = 'Trecho de texto ' + (++seq); // numbered in display order (a "Linha divisória" does not count)
			const before = visible[i - 1], after = visible[i + 1];
			const where = [before && `depois de "${before.label}"`, after && `antes de "${after.label}"`].filter(Boolean).join(' e ');
			f.description = `Texto corrido da página${where ? ', ' + where : ''}. Use "Título 2" e "Título 3" do editor para subtítulos.`;
		});
		return out;
	};
	return toFields(root, null, data);
}

// ---- content entries
// content/site.json (CNPJ, razão social, endereço, telefone, e-mail, Instagram, texto do rodapé) is intentionally NOT listed:
// Pages CMS has no per-collaborator permissions, so institutional data is edited only by the administrator, directly in the repository.
const entry = (name, lbl, file, description) => ({ name, label: lbl, description, type: 'file', path: file, format: 'json',
	fields: nest(schema[file].fields, JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'))) });
const content = [
	entry('home', 'Página inicial', 'content/home.json', 'Textos, cartões, fotos do carrossel e chamadas da página inicial. Os cartões "Vozes" mostram os artigos escolhidos aqui.'),
	entry('pagina-historia', 'Nossa história', 'content/historia.json', 'Textos e imagens da página Nossa história.'),
	entry('pagina-contato', 'Fale com a gente', 'content/contato.json', 'Textos da página de contato. Endereço, telefone, e-mail e Instagram são dados institucionais e só podem ser alterados pela administração do site.'),
	entry('pagina-volei', 'Vôlei', 'content/volei.json', 'Textos e imagens da página do projeto de Vôlei.'),
	entry('programa-atendimento', 'Programa — Atendimento Educacional Integrado', 'content/programas/atendimento.json', 'Textos e imagens da página do programa.'),
	entry('programa-creche', 'Programa — Creche Patatí-Patatá', 'content/programas/creche.json', 'Textos, imagens, galeria e contato pelo WhatsApp da página da Creche.'),
	entry('programa-maior-cuidado', 'Programa — Programa Maior Cuidado', 'content/programas/maior-cuidado.json', 'Textos e imagens da página do programa.'),
	entry('programa-qualificacao', 'Programa — Qualificação Profissional', 'content/programas/qualificacao.json', 'Textos, imagens, galeria e contato pelo WhatsApp da página do programa.'),
	entry('programa-scfv', 'Programa — SCFV', 'content/programas/scfv.json', 'Textos, imagens e galeria da página do SCFV.'),
	{
		name: 'artigos', label: 'Artigos', type: 'collection', path: 'content/artigos', format: 'yaml-frontmatter',
		description: 'Artigos do site. Para criar um novo, clique em "Adicionar". O endereço da página é criado a partir do título e não deve ser alterado depois. Um artigo só aparece na página inicial quando é escolhido em um dos cartões "Vozes" (Página inicial → Cartões de artigos).',
		filename: { template: '{primary}.md', field: 'create' },
		view: { primary: 'titulo', fields: ['titulo', 'chamada'] },
		fields: [
			{ name: 'titulo', label: 'Título do artigo', type: 'string', required: true, description: 'Na criação, o endereço da página é gerado a partir deste título (minúsculas, sem acentos, com hífens).' },
			{ name: 'chamada', label: 'Chamada acima do título', type: 'string', required: true, description: 'Texto curto acima do título, por exemplo "Projetos e impacto social".' },
			{ name: 'destaque', label: 'Frase de destaque', type: 'text', required: true, description: 'Aparece abaixo do título e é usada como resumo no Google quando a descrição abaixo fica em branco.' },
			imageObject('imagem', 'Imagem principal'),
			{ name: 'body', label: 'Texto do artigo', type: 'rich-text', required: true, options: { format: 'html' }, description: 'Use "Título 2" e "Título 3" para os subtítulos.' },
			{ name: 'seo', label: 'Busca e compartilhamento (opcional)', type: 'object', description: 'Pode deixar em branco: o site usa o título e a frase de destaque automaticamente.', fields: [
				{ name: 'titulo', label: 'Título da aba e do Google', type: 'string', required: false },
				{ name: 'descricao', label: 'Descrição para o Google e redes sociais', type: 'text', required: false },
				{ name: 'titulo_social', label: 'Título ao compartilhar (redes sociais)', type: 'string', required: false }
			] }
		]
	}
];

const config = {
	// Keep keys that are not shown in the editor (e.g. hidden page SEO) when a file is saved.
	settings: { content: { merge: true } },
	media: { input: 'media', output: '/media', extensions: IMG_EXT },
	content
};
const header = '# Pages CMS configuration for the GDECOM website.\n# Only editorial content is exposed. Institutional data (content/site.json), page SEO, the Privacy Policy, the 404 page,\n# templates, CSS, JavaScript, build and QA files are intentionally NOT editable here.\n# Generated by tools/migration/pages-config.js; maintained by the site administrator.\n';
fs.writeFileSync(path.join(ROOT, '.pages.yml'), header + yaml.dump(config, { lineWidth: -1, noRefs: true }));
const count = (fs2) => fs2.reduce((a, f) => a + (f.fields ? count(f.fields) : 1), 0);
const visible = (fs2) => fs2.filter((f) => !f.hidden).reduce((a, f) => a + (f.fields ? visible(f.fields) : 1), 0);
for (const c of content) console.log(c.label.padEnd(48), visible(c.fields), 'campos visíveis /', count(c.fields), 'no total');
