/*!
 * GDECOM - controlador local do menu mobile (fallback em JavaScript puro).
 *
 * Motivo: os handlers de clique do widget nav-menu do Elementor Pro ficam num
 * chunk (nav-menu.*.bundle.min.js) carregado via import() do runtime do
 * webpack; se ele nao carregar a tempo, o botao hamburger fica sem listener de
 * clique e o menu nunca abre. Esse mesmo chunk, quando carrega, tambem registra
 * seu proprio atalho de teclado (Enter/Espaco em "keyup", chamando .click()).
 * Por isso este arquivo assume sozinho a ativacao por teclado (Enter/Espaco) e
 * intercepta o "keyup" antes que o shim do Elementor rode, evitando duplicacao
 * nos dois cenarios: com ou sem o chunk do Elementor Pro carregado.
 *
 * Este arquivo NAO redesenha nem substitui a marcacao: ele apenas liga/desliga o
 * estado que o proprio CSS do Elementor ja preve (classe .elementor-active no
 * toggle) e mantem aria-expanded / aria-hidden / tabindex sincronizados com o
 * estado real. Sem bibliotecas, sem jQuery, sem requisicoes externas.
 */
(function () {
	'use strict';

	/* Geometria do painel aberto. O Elementor normalmente calcula largura e
	   posicao via JS (opcao "stretch"); sem esse JS o painel nasce com ~130px de
	   largura. Estas regras substituem esse calculo de forma estatica. */
	var CSS = [
		'.hdr-navy .elementor-nav-menu--toggle{--menu-height:calc(100vh - 95px);}',
		'.hdr-navy .elementor-nav-menu--dropdown.elementor-nav-menu__container{',
		'top:var(--gdecom-menu-top,100%);margin-top:0;',
		'left:auto;right:var(--gdecom-menu-right,0px);width:min(320px,calc(100vw - 20px));',
		'border-radius:14px;box-shadow:0 16px 40px rgba(3,32,73,.25);',
		'-webkit-overflow-scrolling:touch;}',
		'.hdr-navy .elementor-nav-menu--dropdown .elementor-nav-menu{padding:6px 0;}',
		'.hdr-navy .elementor-nav-menu--dropdown .elementor-item{padding:11px 18px;}',
		'@media (prefers-reduced-motion:reduce){',
		'.elementor-nav-menu--dropdown.elementor-nav-menu__container{transition:none;}}'
	].join('');

	function injectStyle() {
		if (document.getElementById('gdecom-menu-mobile-css')) {
			return;
		}
		var s = document.createElement('style');
		s.id = 'gdecom-menu-mobile-css';
		s.appendChild(document.createTextNode(CSS));
		(document.head || document.documentElement).appendChild(s);
	}

	/* O painel e posicionado em relacao ao widget (position:relative), cuja altura
	   varia com o breakpoint. Sem um top explicito ele nasce colado ao topo do
	   widget e cobre o proprio botao de fechar. Calculamos o deslocamento a partir
	   da base do cabecalho fixo, que e identico em todas as 12 paginas. */
	function placePanel(ctx) {
		var header = ctx.toggle.closest('.hdr-navy');
		var box = ctx.toggle.offsetParent
			? ctx.toggle.offsetParent.getBoundingClientRect()
			: ctx.toggle.getBoundingClientRect();
		var tb = ctx.toggle.getBoundingClientRect();
		var bottom = header ? header.getBoundingClientRect().bottom : tb.bottom + 10;

		/* Vertical: logo abaixo da barra fixa. */
		ctx.nav.style.setProperty('--gdecom-menu-top', Math.max(0, Math.round(bottom - box.top + 6)) + 'px');

		/* Horizontal: borda direita do painel alinhada ao botao, sem sair da tela.
		   O widget ocupa 74% da largura e centraliza o botao, entao "right:0" puro
		   deixaria o painel deslocado em telas de 768-1024px. */
		var wanted = Math.min(tb.right + 8, window.innerWidth - 10);
		ctx.nav.style.setProperty('--gdecom-menu-right', Math.round(box.right - wanted) + 'px');
	}

	/* Quando o JS original do Elementor carrega (site antigo no ar), ele mesmo
	   abre/fecha o menu e posiciona o painel. Nesse caso este script so acompanha
	   o estado (aria/tabindex) e nao mexe em classe nem geometria. */
	function syncOnly(ctx, open) {
		ctx.open = open;
		for (var i = 0; i < ctx.links.length; i++) {
			if (open) {
				ctx.links[i].removeAttribute('tabindex');
			} else {
				ctx.links[i].setAttribute('tabindex', '-1');
			}
		}
	}

	/* Deixa o Elementor agir primeiro; so assume se ninguem mudou o estado. */
	function toggleOrDefer(ctx) {
		var before = ctx.toggle.classList.contains('elementor-active');
		setTimeout(function () {
			var now = ctx.toggle.classList.contains('elementor-active');
			if (now !== before) {
				syncOnly(ctx, now);
			} else {
				setState(ctx, !before);
			}
		}, 0);
	}

	function setState(ctx, open) {
		if (open) {
			injectStyle();
			placePanel(ctx);
		}
		ctx.open = open;
		ctx.toggle.classList.toggle('elementor-active', open);
		ctx.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
		ctx.nav.setAttribute('aria-hidden', open ? 'false' : 'true');

		/* Links escondidos nao devem ser alcancaveis pelo teclado. */
		for (var i = 0; i < ctx.links.length; i++) {
			if (open) {
				ctx.links[i].removeAttribute('tabindex');
			} else {
				ctx.links[i].setAttribute('tabindex', '-1');
			}
		}
	}

	function bind(widget) {
		var toggle = widget.querySelector('.elementor-menu-toggle');
		if (!toggle || toggle.getAttribute('data-gdecom-menu') === '1') {
			return;
		}

		var nav = null;
		var sib = toggle.nextElementSibling;
		while (sib) {
			if (sib.classList && sib.classList.contains('elementor-nav-menu--dropdown')) {
				nav = sib;
				break;
			}
			sib = sib.nextElementSibling;
		}
		if (!nav) {
			return;
		}

		var ctx = {
			toggle: toggle,
			nav: nav,
			links: nav.querySelectorAll('a'),
			open: toggle.classList.contains('elementor-active')
		};

		toggle.setAttribute('data-gdecom-menu', '1');
		syncOnly(ctx, ctx.open);

		toggle.addEventListener('click', function () {
			toggleOrDefer(ctx);
		});

		/* role="button" num <div> NAO da ativacao nativa por teclado (isso e
		   comportamento so de elementos realmente interativos). Por isso o
		   keydown aqui so cuida do que nao tem substituto: impedir a rolagem
		   da pagina no Espaco e fechar no Escape. A ativacao em si (abrir/
		   fechar no Enter/Espaco) fica por conta do keyup abaixo. */
		toggle.addEventListener('keydown', function (ev) {
			if (ev.key === ' ' || ev.key === 'Spacebar') {
				ev.preventDefault();
			} else if (ev.key === 'Escape' && ctx.open) {
				setState(ctx, false);
			}
		});

		/* Ativacao por teclado. Fica no document, em fase de captura, para
		   rodar antes de qualquer listener de "keyup" que o proprio Elementor
		   Pro registre no toggle (inclusive o shim triggerClickOnEnterSpace
		   do chunk nav-menu.*.bundle.min.js, quando ele carrega). Ao achar
		   Enter/Espaco no toggle, paramos a propagacao do keyup - o shim do
		   Elementor nunca chega a rodar - e disparamos um unico .click(),
		   que aciona o listener de "click" ja existente acima. Funciona com
		   ou sem o chunk do Elementor Pro presente. */
		document.addEventListener('keyup', function (ev) {
			if (ev.target !== toggle) {
				return;
			}
			if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
				ev.stopImmediatePropagation();
				toggle.click();
			}
		}, true);

		/* Clique em um link do menu: fecha (importante para ancoras da mesma pagina,
		   que nao recarregam o documento). Sem preventDefault - a navegacao segue. */
		nav.addEventListener('click', function (ev) {
			if (ev.target && ev.target.closest && ev.target.closest('a')) {
				setState(ctx, false);
			}
		});

		/* Esc em qualquer lugar fecha e devolve o foco ao botao. Sem focus trap. */
		document.addEventListener('keydown', function (ev) {
			if (ev.key === 'Escape' && ctx.open) {
				setState(ctx, false);
				toggle.focus();
			}
		});

		/* Clique fora fecha. */
		document.addEventListener('click', function (ev) {
			if (ctx.open && !nav.contains(ev.target) && !toggle.contains(ev.target)) {
				setState(ctx, false);
			}
		});

		/* Ao voltar para a largura de desktop o dropdown some por CSS; zera o estado
		   para que aria-expanded nao fique mentindo. */
		var mq = window.matchMedia('(min-width: 1025px)');
		var onChange = function (e) {
			if (e.matches && ctx.open) {
				setState(ctx, false);
			}
		};
		if (mq.addEventListener) {
			mq.addEventListener('change', onChange);
		} else if (mq.addListener) {
			mq.addListener(onChange);
		}
	}

	function init() {
		var widgets = document.querySelectorAll('.elementor-widget-nav-menu');
		for (var i = 0; i < widgets.length; i++) {
			bind(widgets[i]);
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
