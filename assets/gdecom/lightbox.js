/*
GDECOM local lightbox — dependency-free, reusable across any gallery/carousel.
Attach it to a container by adding the `data-gdecom-lightbox` attribute; every
<img> inside becomes a lightbox trigger, deduplicated by src so Swiper loop
clones (`.swiper-slide-duplicate`, `aria-hidden="true"`) don't create repeats
and a click on a clone still opens the correct item.
*/
(function () {
	'use strict';

	var state = { dialog: null, img: null, cap: null, prevBtn: null, nextBtn: null, closeBtn: null,
		items: [], index: 0, lastTrigger: null, scrollX: 0, scrollY: 0 };

	function injectStyles() {
		if (document.getElementById('gdecom-lightbox-styles')) return;
		var style = document.createElement('style');
		style.id = 'gdecom-lightbox-styles';
		style.textContent =
			'#gdecom-lightbox{position:fixed;inset:0;background:rgba(3,32,73,.92);z-index:99999;display:none;align-items:center;justify-content:center;padding:60px 20px;}' +
			'#gdecom-lightbox.is-open{display:flex;}' +
			'#gdecom-lightbox figure{position:relative;margin:0;max-width:100%;max-height:100%;display:flex;flex-direction:column;align-items:center;}' +
			'#gdecom-lightbox img{display:block;max-width:100%;max-height:78vh;width:auto;height:auto;border-radius:10px;box-shadow:0 30px 70px rgba(0,0,0,.4);object-fit:contain;}' +
			'#gdecom-lightbox figcaption{margin-top:14px;text-align:center;color:#fff;font-family:"Nunito Sans",Arial,sans-serif;font-size:14px;font-weight:700;min-height:1em;padding:0 10px;}' +
			'#gdecom-lightbox button{position:absolute;border:none;background:rgba(255,255,255,.15);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;}' +
			'#gdecom-lightbox button:hover{background:rgba(255,255,255,.28);}' +
			'#gdecom-lightbox button:focus-visible{outline:2px solid #FFD21F;outline-offset:2px;}' +
			'#gdecom-lightbox .gl-close{top:-50px;right:0;width:40px;height:40px;font-size:24px;line-height:1;}' +
			'#gdecom-lightbox .gl-prev,#gdecom-lightbox .gl-next{top:50%;width:48px;height:48px;font-size:18px;transform:translateY(-50%);}' +
			'#gdecom-lightbox .gl-prev{left:-64px;}' +
			'#gdecom-lightbox .gl-next{right:-64px;}' +
			'@media (max-width:900px){#gdecom-lightbox .gl-close{top:-46px;right:0;}#gdecom-lightbox .gl-prev{left:2px;}#gdecom-lightbox .gl-next{right:2px;}#gdecom-lightbox .gl-prev,#gdecom-lightbox .gl-next{width:40px;height:40px;background:rgba(3,32,73,.55);}}';
		document.head.appendChild(style);
	}

	function buildDialog() {
		var dialog = document.createElement('div');
		dialog.id = 'gdecom-lightbox';
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.setAttribute('aria-label', 'Imagem ampliada');
		dialog.innerHTML =
			'<figure>' +
			'<button type="button" class="gl-close" aria-label="Fechar">×</button>' +
			'<button type="button" class="gl-prev" aria-label="Imagem anterior">‹</button>' +
			'<button type="button" class="gl-next" aria-label="Próxima imagem">›</button>' +
			'<img src="" alt="">' +
			'<figcaption></figcaption>' +
			'</figure>';
		document.body.appendChild(dialog);

		state.dialog = dialog;
		state.img = dialog.querySelector('img');
		state.cap = dialog.querySelector('figcaption');
		state.closeBtn = dialog.querySelector('.gl-close');
		state.prevBtn = dialog.querySelector('.gl-prev');
		state.nextBtn = dialog.querySelector('.gl-next');

		state.closeBtn.addEventListener('click', close);
		state.prevBtn.addEventListener('click', function () { show(state.index - 1); });
		state.nextBtn.addEventListener('click', function () { show(state.index + 1); });
		dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
		document.addEventListener('keydown', onKeydown);

		return dialog;
	}

	function onKeydown(e) {
		if (!state.dialog || !state.dialog.classList.contains('is-open')) return;
		/* A held Enter/Space that opened the dialog keeps auto-repeating onto the
		   focused close button and would shut it at once. */
		if (e.repeat && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) { e.preventDefault(); return; }
		if (e.key === 'Escape') { close(); }
		else if (e.key === 'ArrowLeft') { show(state.index - 1); }
		else if (e.key === 'ArrowRight') { show(state.index + 1); }
		else if (e.key === 'Tab') { trapFocus(e); }
	}

	function trapFocus(e) {
		/* Must match actual DOM/tab order (close, prev, next) - see buildDialog(). */
		var focusables = [state.closeBtn, state.prevBtn, state.nextBtn].filter(function (b) {
			return b.style.display !== 'none';
		});
		if (!focusables.length) return;
		var first = focusables[0], last = focusables[focusables.length - 1];
		if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
		else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
	}

	function show(index) {
		var n = state.items.length;
		state.index = ((index % n) + n) % n;
		var item = state.items[state.index];
		state.img.src = item.src;
		state.img.alt = item.alt || '';
		state.cap.textContent = item.caption || '';
		var multi = n > 1;
		state.prevBtn.style.display = multi ? '' : 'none';
		state.nextBtn.style.display = multi ? '' : 'none';
	}

	function open(items, index, trigger) {
		if (!state.dialog) { injectStyles(); buildDialog(); }
		state.items = items;
		state.lastTrigger = trigger || null;
		show(index);
		state.scrollX = window.scrollX;
		state.scrollY = window.scrollY;
		/* Keep the scrollbar's space while locked: losing it widens the layout, fluid
		   sections reflow behind the modal and the page lands a few px off on close. */
		state.prevOverflowY = document.documentElement.style.overflowY;
		if (window.innerWidth > document.documentElement.clientWidth) document.documentElement.style.overflowY = 'scroll';
		document.body.style.position = 'fixed';
		document.body.style.top = (-state.scrollY) + 'px';
		document.body.style.left = (-state.scrollX) + 'px';
		document.body.style.right = '0';
		document.body.style.width = '100%';
		state.dialog.classList.add('is-open');
		state.closeBtn.focus();

		/* Pause a host Swiper's autoplay while open: keeps the background from
		   moving behind the modal, and stops it from repositioning/replacing
		   the trigger node so focus can still return to it on close. */
		var swiperEl = trigger && trigger.closest ? trigger.closest('.swiper') : null;
		state.pausedSwiper = (swiperEl && swiperEl.swiper && swiperEl.swiper.autoplay && swiperEl.swiper.autoplay.running)
			? swiperEl.swiper : null;
		if (state.pausedSwiper) state.pausedSwiper.autoplay.stop();
	}

	function close() {
		if (!state.dialog || !state.dialog.classList.contains('is-open')) return;
		var x = state.scrollX, y = state.scrollY;
		/* Elementor sets html{scroll-behavior:smooth}; restoring through it paints the
		   page at 0 and animates back. Force an instant restore while the dialog still
		   covers the page, and only hide the dialog once the position is back. */
		var html = document.documentElement;
		var prevBehavior = html.style.scrollBehavior;
		html.style.scrollBehavior = 'auto';
		document.body.style.position = '';
		document.body.style.top = '';
		document.body.style.left = '';
		document.body.style.right = '';
		document.body.style.width = '';
		html.style.overflowY = state.prevOverflowY || '';
		window.scrollTo(x, y);
		if (state.pausedSwiper) { state.pausedSwiper.autoplay.start(); state.pausedSwiper = null; }
		if (state.lastTrigger && state.lastTrigger.isConnected) {
			state.lastTrigger.focus({ preventScroll: true });
			/* Browsers without preventScroll support scroll on focus; undo it. */
			if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
		}
		html.style.scrollBehavior = prevBehavior;
		state.dialog.classList.remove('is-open');
		state.img.src = '';
	}

	function isEligibleImg(img) {
		var slide = img.closest('.swiper-slide');
		if (!slide) return true;
		/* Swiper's a11y module sets aria-hidden="true" on any slide that is
		   currently scrolled out of view, real or clone - it is not a reliable
		   duplicate marker. Only swiper-slide-duplicate identifies a loop clone. */
		return slide.className.indexOf('swiper-slide-duplicate') === -1;
	}

	function collectItems(container) {
		var imgs = Array.prototype.filter.call(container.querySelectorAll('img'), isEligibleImg);
		var seen = {};
		var items = [];
		imgs.forEach(function (img) {
			/* src, not currentSrc: srcset serves a reduced WebP in the carousel; the
			   lightbox should open the full original. */
			var src = img.getAttribute('src') || img.currentSrc;
			if (seen[src]) return;
			seen[src] = true;
			var a = img.closest('a');
			var title = a ? a.getAttribute('data-elementor-lightbox-title') : null;
			items.push({ src: src, alt: img.getAttribute('alt') || '', caption: title || img.getAttribute('alt') || '' });
		});
		return items;
	}

	function normalizeTriggers(container) {
		Array.prototype.filter.call(container.querySelectorAll('a'), function (a) {
			return !!a.querySelector('img');
		}).forEach(function (a) {
			/* Slides Swiper marks aria-hidden (out of view, or loop clones) must stay
			   out of the Tab order; visible ones are reachable. Re-run on every
			   aria-hidden change, so this follows the carousel as it moves. */
			var hidden = !!a.closest('[aria-hidden="true"]');
			var tab = hidden ? '-1' : '0';
			if (a.getAttribute('tabindex') !== tab) a.setAttribute('tabindex', tab);
			if (!a.hasAttribute('role')) a.setAttribute('role', 'button');
		});
	}

	function attachGroup(container) {
		normalizeTriggers(container);

		/* attributeFilter keeps our own tabindex/role writes from re-triggering it. */
		var observer = new MutationObserver(function () { normalizeTriggers(container); });
		observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden'] });

		/* The triggers are <a> without href (role="button"): browsers fire no click on
		   Enter/Space for them, so do it here and route through the click handler. */
		container.addEventListener('keydown', function (e) {
			if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
			var a = e.target.closest ? e.target.closest('a[role="button"]') : null;
			if (!a || !container.contains(a) || !a.querySelector('img')) return;
			e.preventDefault(); /* Space would scroll the page */
			if (e.repeat) return;
			a.click();
		});

		container.addEventListener('click', function (e) {
			var clickable = e.target.closest('a, img');
			if (!clickable || !container.contains(clickable)) return;
			var img = clickable.tagName === 'IMG' ? clickable : clickable.querySelector('img');
			if (!img) return;
			/* Focus must return to a focusable element on close, not the bare <img>. */
			var focusTarget = img.closest('a') || img;
			e.preventDefault();
			var items = collectItems(container);
			var src = img.getAttribute('src') || img.currentSrc;
			var idx = -1;
			for (var i = 0; i < items.length; i++) { if (items[i].src === src) { idx = i; break; } }
			if (idx === -1) idx = 0;
			open(items, idx, focusTarget);
		});
	}

	function init() {
		var groups = document.querySelectorAll('[data-gdecom-lightbox]');
		Array.prototype.forEach.call(groups, attachGroup);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	window.GdecomLightbox = { init: init, attachGroup: attachGroup };
})();
