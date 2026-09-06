  const referenceShareParameter = 'referinta';
  const referenceShareParameterAliases = [referenceShareParameter, 'reference', 'ref'];
  let detailShareStatusTimer = null;

  const sharedReferenceKeyFromUrl = () => {
    try {
      const url = new URL(window.location.href);
      return referenceShareParameterAliases
        .map((parameter) => url.searchParams.get(parameter)?.trim())
        .find(Boolean) || '';
    } catch {
      return '';
    }
  };

  const shareRecordIdentity = (record) => normalize([
    record?.year_label,
    record?.quote,
    record?.source_url || record?.title
  ].filter(Boolean).join('|'));

  const legacyReferenceShareKey = (record) => {
    const identity = shareRecordIdentity(record);
    if (!identity) return '';
    let hash = 2166136261;
    for (const character of identity) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `legacy-${(hash >>> 0).toString(36)}`;
  };

  const referenceShareKeys = (record) => [...new Set([
    String(record?.id || '').trim(),
    legacyReferenceShareKey(record)
  ].filter(Boolean))];

  const referenceShareKey = (record) => {
    if (!record) return '';
    return referenceShareKeys(record)[0] || '';
  };

  const referenceShareUrl = (record) => {
    const key = referenceShareKey(record);
    if (!key) return '';
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set(referenceShareParameter, key);
    if (url.hash === '#reference-detail') url.hash = '';
    return url.href;
  };

  const setReferenceUrl = (record, { replace = false } = {}) => {
    const nextUrl = referenceShareUrl(record);
    if (!nextUrl || nextUrl === window.location.href) return;
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({
      ...(window.history.state || {}),
      moldoveneascaReference: referenceShareKey(record)
    }, '', nextUrl);
  };

  const clearReferenceUrl = () => {
    const url = new URL(window.location.href);
    referenceShareParameterAliases.forEach((parameter) => url.searchParams.delete(parameter));
    if (url.hash === '#reference-detail') url.hash = '';
    if (url.href === window.location.href) return;
    window.history.replaceState(window.history.state || {}, '', url.href);
  };

  const setDetailShareStatus = (message) => {
    if (detailShareStatusTimer) window.clearTimeout(detailShareStatusTimer);
    detailShareStatusTimer = null;
    if (!detailShareStatus) return;
    detailShareStatus.textContent = message || '';
    if (message) {
      detailShareStatusTimer = window.setTimeout(() => {
        detailShareStatus.textContent = '';
        detailShareStatusTimer = null;
      }, 4000);
    }
  };

  const updateDetailShareState = (record) => {
    const canShare = Boolean(referenceShareUrl(record));
    if (shareDetailButton) {
      shareDetailButton.hidden = !canShare;
      shareDetailButton.disabled = !canShare;
    }
    setDetailShareStatus('');
  };

  const copyShareUrl = async (url) => {
    if (window.navigator.clipboard?.writeText) {
      try {
        await window.navigator.clipboard.writeText(url);
        return true;
      } catch {
        // Încearcă metoda compatibilă cu browserele care blochează Clipboard API.
      }
    }
    const previousFocus = document.activeElement;
    const helper = document.createElement('textarea');
    helper.value = url;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    helper.remove();
    previousFocus?.focus({ preventScroll: true });
    return copied;
  };

  const shareCurrentDetail = async () => {
    const sharedRecord = currentDetailRecord;
    const url = referenceShareUrl(currentDetailRecord);
    if (!url || !shareDetailButton) return;
    const fields = displayFields(currentDetailRecord);
    const title = fields.title === '—' ? 'Referință documentară' : fields.title;
    shareDetailButton.disabled = true;
    try {
      const copied = await copyShareUrl(url);
      if (copied) {
        setDetailShareStatus('Legătura a fost copiată.');
        return;
      }
      if (typeof window.navigator.share === 'function') {
        try {
          await window.navigator.share({
            title,
            text: `Referință documentară: ${title}`,
            url
          });
          setDetailShareStatus('Legătura este pregătită pentru distribuire.');
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }
      setDetailShareStatus('Nu am putut copia automat legătura; copiaz-o din bara de adrese.');
    } finally {
      if (currentDetailRecord !== sharedRecord) updateDetailShareState(currentDetailRecord);
      else shareDetailButton.disabled = false;
    }
  };

  const allShareableRecords = () => [
    ...remoteRecords,
    ...ethnicityRecords,
    ...unverifiedRecords,
    ...staticRows.map((row) => row.catalogRecord).filter(Boolean),
    ...ethnicityStaticEntries.map(({ record }) => record)
  ];

  const findRecordByShareKey = (key) => allShareableRecords()
    .find((record) => referenceShareKey(record) && referenceShareKeys(record).includes(key));

  let detailRestoreToken = 0;
  const restoreDetailFromUrl = async () => {
    const token = ++detailRestoreToken;
    const key = sharedReferenceKeyFromUrl();
    if (!key) return false;
    let record = findRecordByShareKey(key);
    if (!record && supabaseClient && !key.startsWith('legacy-')) {
      try {
        const { data, error } = await supabaseClient.from('language_references')
          .select(remoteSelectFields).eq('id', key).maybeSingle();
        if (error) throw error;
        if (data) record = normalizeCitationRecord(data);
      } catch {
        if (token === detailRestoreToken && sharedReferenceKeyFromUrl() === key && result) {
          result.textContent = 'Referința partajată nu a putut fi încărcată. Reîncearcă.';
        }
        return false;
      }
    }
    if (token !== detailRestoreToken || sharedReferenceKeyFromUrl() !== key) return false;
    if (!record) {
      if (!isCatalogLoading && result) result.textContent = 'Referința partajată nu a fost găsită.';
      return false;
    }
    openDetail(record, null, { updateUrl: false });
    return true;
  };
