(() => {
  const navigation = document.querySelector('.site-nav');
  const toggle = navigation?.querySelector('.nav-toggle');
  const menuId = toggle?.getAttribute('aria-controls');
  const menu = menuId ? document.getElementById(menuId) : null;

  if (!navigation || !toggle || !menu) return;

  const label = toggle.querySelector('.sr-only');

  const setOpen = (open) => {
    navigation.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Închide meniul' : 'Deschide meniul');
    if (label) label.textContent = open ? 'Închide meniul' : 'Deschide meniul';
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest?.('a')) setOpen(false);
  });

  document.addEventListener('click', (event) => {
    if (!navigation.contains(event.target)) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });

  const mediaQuery = window.matchMedia('(min-width: 701px)');
  const closeOnWideScreen = () => {
    if (mediaQuery.matches) setOpen(false);
  };

  if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', closeOnWideScreen);
  else mediaQuery.addListener(closeOnWideScreen);
})();

(() => {
  const languageDetails = [...document.querySelectorAll('.language-switcher__details')];

  if (!languageDetails.length) return;

  const closeLanguageSwitchers = (except = null) => {
    languageDetails.forEach((details) => {
      if (details !== except) details.removeAttribute('open');
    });
  };

  languageDetails.forEach((details) => {
    details.addEventListener('toggle', () => {
      if (details.open) closeLanguageSwitchers(details);
    });
  });

  document.addEventListener('click', (event) => {
    languageDetails.forEach((details) => {
      const switcher = details.closest('.language-switcher');
      if (details.open && switcher && !switcher.contains(event.target)) {
        details.removeAttribute('open');
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeLanguageSwitchers();
  });
})();
