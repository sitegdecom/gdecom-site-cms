/*!
 * GDECOM - ativa localmente os carrosseis do Elementor.
 *
 * O Elementor so monta os carrosseis depois de baixar pedacos extras de codigo
 * (nested-carousel e image-carousel). Esses pedacos nao existem na pasta do site,
 * entao os carrosseis ficavam parados. A biblioteca que faz o carrossel (Swiper)
 * ja esta na pasta; este arquivo usa ela com as mesmas configuracoes que o
 * Elementor salvou em cada widget (data-settings). Nao altera a marcacao.
 * Se o Elementor conseguir montar o carrossel sozinho, este arquivo nao faz nada.
 */
(function () {
	'use strict';

	function num(v, fallback) {
		var n = parseInt(v, 10);
		return isNaN(n) ? fallback : n;
	}

	function settingsOf(widget) {
		try {
			return JSON.parse(widget.getAttribute('data-settings') || '{}');
		} catch (e) {
			return {};
		}
	}

	function montar(widget, swiperEl, cfg) {
		if (!swiperEl || swiperEl.swiper || swiperEl.getAttribute('data-gdecom-carrossel')) {
			return;
		}
		var slides = swiperEl.querySelectorAll('.swiper-wrapper > .swiper-slide').length;
		var desk = num(cfg.slides_to_show, 1);
		var tab = num(cfg.slides_to_show_tablet, Math.min(desk, 2));
		var mob = num(cfg.slides_to_show_mobile, 1);
		var gap = cfg.image_spacing_custom && cfg.image_spacing_custom.size !== '' ? num(cfg.image_spacing_custom.size, 10) : 10;
		var loop = cfg.infinite === 'yes' && slides > desk;

		var opts = {
			speed: num(cfg.speed, 500),
			loop: loop,
			rewind: !loop,
			slidesPerView: mob,
			slidesPerGroup: 1,
			spaceBetween: gap,
			watchOverflow: true,
			grabCursor: true,
			breakpoints: {
				768: { slidesPerView: tab },
				1025: { slidesPerView: desk }
			},
			a11y: { enabled: true, prevSlideMessage: 'Anterior', nextSlideMessage: 'Próximo' }
		};

		var prev = widget.querySelector('.elementor-swiper-button-prev');
		var next = widget.querySelector('.elementor-swiper-button-next');
		if (prev && next && (cfg.arrows === 'yes' || cfg.navigation === 'both' || cfg.navigation === 'arrows')) {
			opts.navigation = { prevEl: prev, nextEl: next };
		}
		var pag = widget.querySelector('.swiper-pagination');
		if (pag && (cfg.pagination || cfg.navigation === 'both' || cfg.navigation === 'dots')) {
			opts.pagination = { el: pag, clickable: true, type: 'bullets' };
		}

		var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (cfg.autoplay === 'yes' && !reduz && slides > 1) {
			opts.autoplay = {
				delay: num(cfg.autoplay_speed, 5000),
				disableOnInteraction: cfg.pause_on_interaction === 'yes'
			};
		}

		swiperEl.setAttribute('data-gdecom-carrossel', '1');
		var inst = new window.Swiper(swiperEl, opts);

		if (opts.autoplay && cfg.pause_on_hover === 'yes' && inst.autoplay) {
			swiperEl.addEventListener('mouseenter', function () { inst.autoplay.stop(); });
			swiperEl.addEventListener('mouseleave', function () { inst.autoplay.start(); });
		}
	}

	function iniciar() {
		if (typeof window.Swiper !== 'function') {
			return;
		}
		var ws = document.querySelectorAll('[data-widget_type="nested-carousel.default"], [data-widget_type="image-carousel.default"]');
		for (var i = 0; i < ws.length; i++) {
			var w = ws[i];
			var el = w.querySelector('.e-n-carousel.swiper, .elementor-image-carousel-wrapper.swiper');
			montar(w, el, settingsOf(w));
		}
	}

	/* Da um tempo para o proprio Elementor tentar primeiro. */
	function agendar() {
		setTimeout(iniciar, 900);
	}

	if (document.readyState === 'complete') {
		agendar();
	} else {
		window.addEventListener('load', agendar);
	}
})();
