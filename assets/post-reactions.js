(() => {
  const root = document.querySelector('[data-post-reactions]');
  if (!root) return;
  const buttons = [...root.querySelectorAll('[data-reaction]')];
  const status = root.querySelector('[data-reaction-status]');
  const endpoint = root.dataset.endpoint;
  const article = root.dataset.article;
  let selected = null;
  let token = null;
  let busy = false;
  try {
    token = localStorage.getItem('dudnic-reaction-reader');
    if (!/^[a-f0-9]{64}$/.test(token || '')) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('dudnic-reaction-reader', token);
    }
  } catch { token = null; }

  const render = (data) => {
    selected = data.selected || null;
    for (const button of buttons) {
      const count = Number(data.counts?.[button.dataset.reaction]);
      button.querySelector('[data-count]').textContent = Number.isSafeInteger(count) && count >= 0 ? String(count) : '–';
      button.setAttribute('aria-pressed', String(selected === button.dataset.reaction));
      button.disabled = !token || busy;
    }
  };
  async function load() {
    try {
      const response = await fetch(`${endpoint}?article=${encodeURIComponent(article)}`, { headers: token ? { 'X-Reader-Token': token } : {}, credentials: 'omit', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('unavailable');
      render(await response.json());
      status.textContent = token ? '' : 'Permite salvarea locală în browser pentru a reacționa.';
    } catch { status.textContent = 'Reacțiile nu pot fi încărcate acum.'; }
  }
  for (const button of buttons) button.addEventListener('click', async () => {
    if (busy || !token) return;
    busy = true;
    buttons.forEach((item) => { item.disabled = true; });
    status.textContent = '';
    try {
      const reaction = selected === button.dataset.reaction ? null : button.dataset.reaction;
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ article, token, reaction }), signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(response.status === 429 ? 'rate' : 'unavailable');
      const data = await response.json();
      busy = false;
      render(data);
      status.textContent = reaction ? 'Reacție salvată.' : 'Reacție retrasă.';
    } catch (error) {
      status.textContent = error.message === 'rate' ? 'Prea multe încercări. Reîncearcă peste un minut.' : 'Reacția nu a putut fi salvată. Reîncearcă.';
    } finally {
      busy = false;
      buttons.forEach((item) => { item.disabled = false; });
    }
  });
  load();
})();
