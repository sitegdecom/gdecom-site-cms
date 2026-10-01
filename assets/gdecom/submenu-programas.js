/*
GDECOM - submenu "Programas" do menu desktop.
O submenu continua abrindo pelo CSS (:hover / :focus-within). Este arquivo so
acrescenta o que o CSS nao faz: manter aria-expanded em dia e fechar com Escape
(devolvendo o foco para "Programas"). Nao toca no menu mobile.
*/
(function () {
	'use strict';

	var li = document.querySelector('.hdr-navy .elementor-nav-menu--main .menu-item-programas');
	if (!li) return;
	var trigger = li.querySelector(':scope > a');
	var sub = li.querySelector('.programas-submenu');
	if (!trigger || !sub) return;

	var dismissed = false;

	// Escape precisa vencer o :focus-within (o foco volta para "Programas", que fica dentro do item).
	function setDismissed(on) {
		dismissed = on;
		sub.style.opacity = on ? '0' : '';
		sub.style.visibility = on ? 'hidden' : '';
		sub.style.transform = on ? 'translateY(8px)' : '';
	}

	function sync() {
		var open = !dismissed && (li.matches(':hover') || li.contains(document.activeElement));
		trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
	}

	li.addEventListener('mouseenter', function () {
		if (dismissed) setDismissed(false);
		sync();
	});
	li.addEventListener('mouseleave', function () { setTimeout(sync, 0); });
	li.addEventListener('focusin', sync);
	li.addEventListener('focusout', function () {
		setTimeout(function () {
			if (dismissed && !li.contains(document.activeElement) && !li.matches(':hover')) setDismissed(false);
			sync();
		}, 0);
	});

	li.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' || e.key === 'Esc') {
			if (dismissed) return;
			setDismissed(true);
			trigger.focus();
			sync();
		} else if (e.key === 'Tab' && !e.shiftKey && dismissed && document.activeElement === trigger) {
			// Tab a partir de "Programas" depois do Escape: reabre para o foco seguir para os itens.
			setDismissed(false);
			sync();
		}
	});

	sync();
})();
