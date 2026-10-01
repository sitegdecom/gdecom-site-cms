// Generates .pages.yml (Pages CMS configuration) from the field schema produced by extract.js.
// Run once during the migration; afterwards .pages.yml is maintained by the site administrator.
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
function label(key, parent) {
	const m = key.match(/^(.*?)(?:_(\d+))?$/); const base = m[1], n = m[2];
	if (parent === 'gallery' && (key === 'imagem' || base === 'img')) return 'Foto ' + (n || 1);
	if (parent === 'seo' && key === 'titulo') return 'Título da aba e do Google';
	if (parent === 'seo' && key === 'descricao') return 'Descrição para o Google e redes sociais';
	if (GROUPS[key]) return GROUPS[key];
	if (LEAF[key]) return LEAF[key];
	const word = { p: 'Parágrafo', h2: 'Título', h3: 'Subtítulo', texto: 'Texto', split: 'Bloco texto e imagem', subtitulo: 'Subtítulo destacado', img: 'Foto', cta_selo: 'Selo', titulo: 'Título' }[base];
	if (word) return word + ' ' + (n || 1);
	return key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// ---- field builders
const imageObject = (name, lbl, desc) => ({
	name, label: lbl, type: 'object', description: desc,
	fields: [
		{ name: 'imagem', label: 'Imagem', type: 'image', required: true, description: 'JPG, PNG ou WebP, até 12 MB. As versões otimizadas são geradas automaticamente.', options: { extensions: IMG_EXT } },
		{ name: 'texto_alternativo', label: 'Texto alternativo (descrição da imagem)', type: 'string', required: true, description: 'Descreva o que aparece na imagem para quem usa leitor de tela. Obrigatório.' }
	]
});
function leaf(def, key, parent) {
	const lbl = label(key, parent);
	if (def.type === 'image-object') return imageObject(key, parent === 'split' || /^split/.test(parent || '') ? 'Imagem do bloco' : lbl === 'Imagem' ? 'Imagem' : lbl, def.description);
	if (def.type === 'reference') return { name: key, label: lbl, type: 'reference', required: true, description: def.description, options: { collection: 'artigos', search: 'titulo' } };
	const f = { name: key, label: lbl, type: def.type === 'rich-text' ? 'rich-text' : def.type, required: def.required !== false };
	if (def.description) f.description = def.description;
	if (f.type === 'rich-text') f.options = { format: 'html' };
	if (/whatsapp_link$/.test(key)) f.pattern = { regex: '^https://(wa\\.me|api\\.whatsapp\\.com)/', message: 'Use um link do WhatsApp, por exemplo https://wa.me/5531999999999' };
	if (/instagram_link$/.test(key)) f.pattern = { regex: '^https://(www\\.)?instagram\\.com/', message: 'Use o endereço completo do Instagram, por exemplo https://www.instagram.com/perfil/' };
	return f;
}
// flat schema paths -> nested Pages CMS fields (numeric segments become fixed-size lists)
function nest(fields) {
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
	const toFields = (node, parentKey) => [...node.children.values()].map((n) => {
		if (n.def && !n.children.size) return leaf(n.def, n.key, parentKey);
		const f = { name: n.key, label: label(n.key, parentKey), type: 'object', fields: toFields(n, n.key) };
		if (n.list) { const c = counts[n.list]; f.list = { min: c, max: c }; f.description = `Lista com ${c} itens fixos (a quantidade não muda para preservar o layout).`; }
		return f;
	});
	return toFields(root, null);
}

// ---- content entries
const entry = (name, lbl, file, fields, description) => ({ name, label: lbl, description, type: 'file', path: file, format: 'json', fields });
const S = (f) => schema[f];
const content = [
	entry('home', 'Página inicial', 'content/home.json', nest(S('content/home.json').fields), 'Textos, cartões, fotos do carrossel e chamadas da página inicial.'),
	{
		name: 'artigos', label: 'Artigos', type: 'collection', path: 'content/artigos', format: 'yaml-frontmatter',
		description: 'Artigos do site. Para criar um novo, clique em "Adicionar". O endereço da página é definido na criação e não deve ser alterado depois.',
		filename: { template: '{primary}.md', field: 'create' },
		view: { primary: 'titulo', fields: ['titulo', 'chamada'] },
		fields: [
			{ name: 'titulo', label: 'Título do artigo', type: 'string', required: true },
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
	},
	entry('programa-atendimento', 'Programa — Atendimento Educacional Integrado', 'content/programas/atendimento.json', nest(S('content/programas/atendimento.json').fields)),
	entry('programa-creche', 'Programa — Creche Patatí-Patatá', 'content/programas/creche.json', nest(S('content/programas/creche.json').fields)),
	entry('programa-maior-cuidado', 'Programa — Maior Cuidado', 'content/programas/maior-cuidado.json', nest(S('content/programas/maior-cuidado.json').fields)),
	entry('programa-qualificacao', 'Programa — Qualificação Profissional', 'content/programas/qualificacao.json', nest(S('content/programas/qualificacao.json').fields)),
	entry('programa-scfv', 'Programa — SCFV', 'content/programas/scfv.json', nest(S('content/programas/scfv.json').fields)),
	entry('pagina-historia', 'Página — Nossa história', 'content/historia.json', nest(S('content/historia.json').fields)),
	entry('pagina-contato', 'Página — Fale com a gente', 'content/contato.json', nest(S('content/contato.json').fields), 'Endereço, telefone, e-mail e Instagram vêm de "Dados institucionais".'),
	entry('pagina-volei', 'Página — Vôlei', 'content/volei.json', nest(S('content/volei.json').fields)),
	entry('dados-institucionais', '⚙ Dados institucionais (administração)', 'content/site.json', [
		{ name: 'nome_publico', label: 'Nome público', type: 'string', required: true },
		{ name: 'razao_social', label: 'Razão social (CNPJ)', type: 'string', required: true },
		{ name: 'natureza_juridica', label: 'Natureza jurídica', type: 'string', required: true },
		{ name: 'cnpj', label: 'CNPJ', type: 'string', required: true, pattern: { regex: '^\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}$', message: 'Formato: 00.000.000/0000-00' } },
		{ name: 'endereco', label: 'Endereço', type: 'object', fields: [
			{ name: 'logradouro', label: 'Rua e número', type: 'string', required: true },
			{ name: 'bairro', label: 'Bairro', type: 'string', required: true },
			{ name: 'cidade', label: 'Cidade', type: 'string', required: true },
			{ name: 'uf', label: 'UF', type: 'string', required: true, pattern: { regex: '^[A-Z]{2}$', message: 'Duas letras maiúsculas, ex.: MG' } },
			{ name: 'cep', label: 'CEP', type: 'string', required: true, pattern: { regex: '^\\d{5}-\\d{3}$', message: 'Formato: 00000-000' } }
		] },
		{ name: 'telefone', label: 'Telefone', type: 'string', required: true, description: 'Formato exibido no site, ex.: (31) 3497-7255. O link de ligação é gerado automaticamente.' },
		{ name: 'email', label: 'E-mail público', type: 'string', required: true, pattern: { regex: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', message: 'E-mail inválido' } },
		{ name: 'instagram', label: 'Instagram (como aparece no site)', type: 'string', required: true, description: 'Ex.: @gdecom' },
		{ name: 'instagram_url', label: 'Instagram (endereço completo)', type: 'string', required: true, pattern: { regex: '^https://(www\\.)?instagram\\.com/', message: 'Ex.: https://www.instagram.com/gdecom/' } },
		{ name: 'rodape_texto', label: 'Texto do rodapé', type: 'string', required: true, description: 'Aparece no rodapé de todas as páginas, antes do CNPJ.' }
	], 'Usado no rodapé, na página inicial e em "Fale com a gente". Alterar com cuidado. Atenção: a Política de Privacidade não é atualizada automaticamente.')
];

const config = {
	media: { input: 'media', output: '/media', extensions: IMG_EXT },
	content
};
const header = '# Pages CMS configuration for the GDECOM website.\n# Only editorial content is exposed. Templates, CSS, JavaScript, build, QA files and the Privacy Policy are intentionally NOT listed here.\n# Generated by tools/migration/pages-config.js during the CMS migration; maintained by the site administrator afterwards.\n';
fs.writeFileSync(path.join(ROOT, '.pages.yml'), header + yaml.dump(config, { lineWidth: -1, noRefs: true }));
const count = (fs2) => fs2.reduce((a, f) => a + (f.fields ? count(f.fields) : 1), 0);
for (const c of content) console.log(c.label.padEnd(48), count(c.fields), 'campos');
