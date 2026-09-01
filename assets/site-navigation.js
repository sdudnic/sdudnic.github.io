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
  const accountDetails = [...document.querySelectorAll('.site-account__menu')];
  const detailsList = [...languageDetails, ...accountDetails];

  if (!detailsList.length) return;

  const closeDetails = (except = null) => {
    detailsList.forEach((details) => {
      if (details !== except) details.removeAttribute('open');
    });
  };

  detailsList.forEach((details) => {
    details.addEventListener('toggle', () => {
      if (details.open) closeDetails(details);
    });
  });

  document.addEventListener('click', (event) => {
    detailsList.forEach((details) => {
      const owner = details.closest('.language-switcher, .site-account');
      if (details.open && owner && !owner.contains(event.target)) {
        details.removeAttribute('open');
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const openDetails = detailsList.find((details) => details.open);
      closeDetails();
      openDetails?.querySelector('summary')?.focus();
    }
  });
})();
