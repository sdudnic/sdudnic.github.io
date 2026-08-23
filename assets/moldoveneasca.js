(() => {
  const root = document.querySelector('[data-moldoveneasca-catalog]');
  if (!root) return;

  const config = window.MOLDOVENEASCA_CONFIG || {};
  const table = document.querySelector('.post-content table') || document.querySelector('table');
  const tbody = table?.querySelector('tbody');
  const searchInput = root.querySelector('[data-catalog-search]');
  const centurySelect = root.querySelector('[data-catalog-century]');
  const resetButton = root.querySelector('[data-catalog-reset]');
  const result = document.querySelector('[data-catalog-result]');
  const authMessage = document.querySelector('[data-auth-message]');
  const authUser = document.querySelector('[data-auth-user]');
  const roleBadge = document.querySelector('[data-role-badge]');
  const googleLoginButton = document.querySelector('[data-login-google]');
  const githubLoginButton = document.querySelector('[data-login-github]');
  const loginButtons = [googleLoginButton, githubLoginButton].filter(Boolean);
  const logoutButton = document.querySelector('[data-logout]');
  const openFormButton = root.querySelector('[data-open-form]');
  const editorPanel = root.querySelector('[data-reference-editor]');
  const editorForm = root.querySelector('[data-reference-form]');
  const imageInput = editorForm?.elements.namedItem('image_url');
  const imagePickButton = root.querySelector('[data-image-pick]');
  const imageFileInput = root.querySelector('[data-image-file]');
  const imagePreview = root.querySelector('[data-image-preview]');
  const imageHint = root.querySelector('#image-help');
  const imageMarkup = root.querySelector('[data-image-markup]');
  const imageMarkupStatus = root.querySelector('[data-image-markup-status]');
  const imageCanvas = root.querySelector('[data-image-canvas]');
  const imageUndoButton = root.querySelector('[data-image-undo]');
  const imageClearButton = root.querySelector('[data-image-clear]');
  const yearInput = editorForm?.elements.namedItem('year_label');
  const formTitle = root.querySelector('[data-form-title]');
  const formStatus = root.querySelector('[data-form-status]');
  const cancelEditButton = root.querySelector('[data-cancel-edit]');
  const adminOnlyField = root.querySelector('[data-admin-only]');
  const recordCount = document.querySelector('[data-record-count]');
  const filteredCount = document.querySelector('[data-filtered-count]');
  const statusBar = document.querySelector('[data-catalog-status]');
  const pagination = document.querySelector('[data-catalog-pagination]');
  const firstPageButton = document.querySelector('[data-page-first]');
  const previousPageButton = document.querySelector('[data-page-previous]');
  const nextPageButton = document.querySelector('[data-page-next]');
  const lastPageButton = document.querySelector('[data-page-last]');
  const pageStatus = document.querySelector('[data-page-status]');
  const currentPageValue = document.querySelector('[data-page-current]');
  const totalPagesValue = document.querySelector('[data-page-total]');
  const selectionToolbar = document.querySelector('[data-selection-toolbar]');
  const selectionCount = document.querySelector('[data-selection-count]');
  const selectionAll = document.querySelector('[data-selection-all]');
  const selectionDeleteButton = document.querySelector('[data-selection-delete]');
  const selectionClearButton = document.querySelector('[data-selection-clear]');
  const unverifiedSection = document.querySelector('[data-unverified-section]');
  const unverifiedTable = document.querySelector('[data-unverified-table]');
  const unverifiedTbody = unverifiedTable?.querySelector('tbody');
  const ethnicityTable = document.querySelector('[data-ethnicity-table]');
  const ethnicityTbody = ethnicityTable?.querySelector('tbody');
  const detailPanel = root.querySelector('[data-reference-detail]');
  const detailBackdrop = root.querySelector('[data-reference-detail-backdrop]');
  const detailTitle = root.querySelector('[data-detail-title]');
  const detailBody = root.querySelector('[data-detail-body]');
  const detailImage = root.querySelector('[data-detail-image]');
  const detailContent = root.querySelector('[data-detail-content]');
  const closeDetailButton = root.querySelector('[data-close-detail]');
  const detailNavigation = root.querySelector('[data-detail-navigation]');
  const detailPreviousButton = root.querySelector('[data-detail-previous]');
  const detailNextButton = root.querySelector('[data-detail-next]');
  const detailPosition = root.querySelector('[data-detail-position]');
  const quoteHint = root.querySelector('[data-catalog-quote-hint]');
  const catalogTypeField = editorForm?.elements.namedItem('catalog_type');
  const quoteField = editorForm?.elements.namedItem('quote');

  if (!table || !tbody) return;
  table.classList.add('moldoveneasca-table');

  const wrapPublicGrid = () => {
    if (!statusBar || !table.parentElement || statusBar.parentElement !== table.parentElement) return;
    const frame = document.createElement('div');
    frame.className = 'moldoveneasca-grid-frame';
    table.parentElement.insertBefore(frame, table);
    if (selectionToolbar) frame.appendChild(selectionToolbar);
    frame.appendChild(table);
    frame.appendChild(statusBar);
  };

  wrapPublicGrid();

  let supabaseClient = null;
  let currentUser = null;
  let currentRole = 'viewer';
  let editingId = null;
  let remoteRecords = [];
  let ethnicityRecords = [];
  let unverifiedRecords = [];
  let sortAscending = true;
  let sortButton = null;
  let rowSequence = 0;
  const pageSize = 50;
  let currentPage = 1;
  let catalogTotalPages = 1;
  let lastDetailTrigger = null;
  let detailNavigationRows = [];
  let detailNavigationIndex = -1;
  let searchDebounceTimer = null;
  const searchDebounceMs = 220;
  const selectedReferenceIds = new Set();
  const catalogTypeValues = new Set(['language', 'ethnicity', 'both']);

  const normalize = (value) => (value || '')
    .toLocaleLowerCase('ro-MD')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const parseYears = (value) => [...String(value || '').matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/g)]
    .map((match) => Number(match[1]));

  const parseYearStart = (record) => {
    if (Number.isFinite(Number(record?.year_start))) return Number(record.year_start);
    return parseYears(record?.year_label)[0] || null;
  };

  const parseYearEnd = (record) => {
    if (Number.isFinite(Number(record?.year_end))) return Number(record.year_end);
    const years = parseYears(record?.year_label);
    return years[1] || years[0] || null;
  };

  const yearRangeLabel = (record) => {
    const start = parseYearStart(record);
    const end = parseYearEnd(record);
    if (!start) return '—';
    return end && end !== start ? `${start}–${end}` : String(start);
  };

  const toRoman = (number) => {
    const values = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let resultText = '';
    let rest = number;
    values.forEach(([value, symbol]) => {
      while (rest >= value) {
        resultText += symbol;
        rest -= value;
      }
    });
    return resultText;
  };

  const centuryLabel = (record) => {
    const year = parseYearStart(record);
    if (!year) return '—';
    return toRoman(Math.floor((year - 1) / 100) + 1);
  };

  const extractCellText = (cell) => {
    if (!cell) return '';
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('a').forEach((link) => link.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  };

  const languageNamePattern = /(?:moldoveneas(?:că|ca)|moldovineas(?:că|ca)|moldoveneșt(?:e|i)|moldovenesc|moldav\p{L}*|moldau\p{L}*|moldauisch\p{L}*|moldov\p{L}*|moldeuška|молдавск\p{L}*|молдовен(?:яск\p{L}*)?)/iu;
  const languageLabelPattern = /(?:\blimb\p{L}*\b|лимб\p{L}*|линд\p{L}*|\blingua\p{L}*\b|\blanguage\p{L}*\b|\bsprache\p{L}*\b|sprach\p{L}*|\blangue\p{L}*\b|\blengua\p{L}*\b|\bjęzyk\p{L}*\b|\bjezyk\p{L}*\b|\bjazyk\p{L}*\b|\byazyk\p{L}*\b|\bjezik\p{L}*\b|\bidioma\p{L}*\b|\bidiom\p{L}*\b|\bvaloda\p{L}*\b|\bkalba\p{L}*\b|\bkeel\p{L}*\b|\bnyelv\p{L}*\b|\bspråk\p{L}*\b|язык\p{L}*|мова\p{L}*|моў\p{L}*|młëtwa|gjuha|tung\p{L}*|\bdicționar\p{L}*\b|\bdicţionar\p{L}*\b|\bcuvîntelnic\p{L}*\b|\bcuvintelnic\p{L}*\b|\bdictionary\p{L}*\b|словар\p{L}*|\bgramatic\p{L}*\b|\bgrammatik\p{L}*\b|граматик\p{L}*|грамматик\p{L}*)/iu;
  const ethnicityLabelPattern = /(?:\betni\p{L}*\b|\bnați\p{L}*\b|\bnati\p{L}*\b|\bpopor\p{L}*\b|\bneam\p{L}*\b|\bpopulați\p{L}*\b|\bpopulati\p{L}*\b|\blocuitor\p{L}*\b|\bnation\p{L}*\b|\bpeuple\p{L}*\b|\bpeople\b|\bpopolo\p{L}*\b|\bpueblo\p{L}*\b|\bpovo\b|\bnazione\p{L}*\b|\bgente\b|\bgens\b|\bnatio\p{L}*\b|\bpopulus\b|\bpopul\p{L}*\b|\bvolk\p{L}*\b|\bbevölkerung\p{L}*\b|\bnarod\p{L}*\b|\bnaród\p{L}*\b|\blud\p{L}*\b|\bmieszkańc\p{L}*\b|\bнарод\p{L}*|\bнаці\p{L}*|\bетнос\p{L}*|\bнаселен\p{L}*|\bмолдаван\p{L}*|\bмолдован\p{L}*)/iu;
  const ethnonymPattern = /(?:\bmoldoven(?:i|ii|ilor|ului|e)\b|\bmoldovean(?:i|ii|ului|ilor)?\b|\bmoldav(?:i|ii|ilor|es|ian(?:s|e)?|ians?)\b|\bmoldauer\p{L}*\b|\bmołdawian\p{L}*\b|\bmoldovan\p{L}*\b|\bмолдаван\p{L}*\b|\bмолдован\p{L}*\b|\bмолдавц\p{L}*\b|\bмолдавян\p{L}*\b)/iu;

  const cleanImportedText = (value) => String(value || '')
    .replace(/^\s*\*\?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanQuote = (value) => String(value || '')
    .replace(/^\s*["„«“']+|["»”']+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/,\s*(?:Contextul|Sursa(?: suplimentară)?\s*\d*):.*$/i, '')
    .trim();

  const extractQuote = (value) => {
    const text = cleanImportedText(value);
    const candidates = [];
    for (const match of text.matchAll(/«([^»]{5,})»/g)) candidates.push(match[1]);
    for (const match of text.matchAll(/“([^”]{5,})”/g)) candidates.push(match[1]);
    for (const match of text.matchAll(/"([^"\n]{5,})"/g)) candidates.push(match[1]);
    const narrated = text.match(/(?:scria|scrie|afirm[aă]|declara|menționeaz[aă])\s*:\s*[«“"]?([\s\S]{5,})[»”"][\s\S]*(?:subliniaz[aă]|menționeaz[aă]|precizeaz[aă]|arat[aă])/i);
    if (narrated) candidates.unshift(narrated[1]);
    const labelled = text.match(/Citatul:\s*(.{5,320}?)(?:,\s*Contextul:|$)/i);
    if (labelled) candidates.push(labelled[1]);
    if (text.length <= 320 && languageNamePattern.test(text) && languageLabelPattern.test(text)) candidates.push(text);
    const cleanedCandidates = candidates.map(cleanQuote).filter(Boolean);
    const explicitlyNamed = cleanedCandidates.filter((candidate) => {
      const termIndex = candidate.search(languageNamePattern);
      const labelIndex = candidate.search(languageLabelPattern);
      return termIndex >= 0 && labelIndex >= 0 && Math.abs(termIndex - labelIndex) <= 80;
    });
    if (explicitlyNamed.length) return explicitlyNamed.sort((a, b) => b.length - a.length)[0];
    return null;
  };

  const extractAuthor = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const explicit = text.match(/Autorul:\s*([^,;.]+)/i);
    if (explicit) return explicit[1].trim();
    const leading = text.match(/^([^,;]{2,80}),\s*(?:["«“]|Citatul:|Letopisețul|Mărturisirea)/i);
    return leading ? leading[1].trim() : null;
  };

  const extractTitle = (value) => {
    const text = cleanImportedText(value);
    const beforeComment = text.split(/\b(?:Citatul|Contextul|Sursa(?: suplimentară)?\s*\d*)\s*:/i)[0].trim();
    const quotedTitles = [...beforeComment.matchAll(/["«“]([^"»”]{3,180})["»”]/g)]
      .map((match) => match[1].trim())
      .filter((candidate) => !languageNamePattern.test(candidate))
      .filter((candidate) => !/\b(?:evanghel(?:ia|iei|ie)|epistole(?:le|lor)|scria|sursa)\b/i.test(candidate));
    const contextualTitle = beforeComment.match(/(?:lucrare(?:a)?\s+intitulată|lucrarea(?:\s+sa)?|opera|cartea|volumul|documentul|în\s+)[\s:]*["«“]([^"»”]{3,180})["»”]/i);
    if (contextualTitle && !languageNamePattern.test(contextualTitle[1])) return contextualTitle[1].trim();
    if (quotedTitles.length) return quotedTitles[0];

    const namedTitle = beforeComment.match(/(?:lucrarea|opera|cartea|volumul|documentul|scrisoarea|gramatica|reglementul)\s+(?:sa\s+)?([^,.;:]{3,160})/i);
    if (namedTitle && !/^limb(?:a|ii)\b/i.test(namedTitle[1])) return namedTitle[1].trim().replace(/["»”]+$/, '');

    const dashTitle = beforeComment.match(/(?:lexicon|catastif|mărturisire|primul lexicon)[^–—-]*[–—-]\s*([^,.;:(]{3,140})/i);
    if (dashTitle) return dashTitle[1].trim();

    const knownTitle = beforeComment.match(/\b(Descriptio Moldaviae|Letopisețul Țării Moldovei|De neamul moldovenilor|Historiarum sui libri|Comentarium wariarum artium|Dictionarium Valachico-Latinum|Alphabetum Moldavorum|Chronologia|Breve vocabulario italiano-muldavo|Lingua moldavorum)\b/i);
    return knownTitle ? knownTitle[1].trim() : null;
  };

  const languageCodeFor = (value) => {
    const text = String(value || '').trim();
    if (!text) return 'xx';
    if (/^[a-z]{2}$/i.test(text)) return text.toLowerCase();
    if (/moldov|moldav|moldauisch|moldovin|moldeu|rom[aâ]n|romanian|rum[aâ]n|valah|valaque|молдов|молдав/i.test(text)) return 'md';
    if (/rus|russ|росс|рус|язык\s*рус/i.test(text)) return 'ru';
    if (/latin|latină|latina/i.test(text)) return 'la';
    if (/german|deutsch|немец/i.test(text)) return 'de';
    if (/fran|francez|français/i.test(text)) return 'fr';
    if (/italian|italiano/i.test(text)) return 'it';
    if (/grec|greacă|greaca|grecesc|елин|греч/i.test(text)) return 'el';
    if (/slavon|sloven|славян/i.test(text)) return 'cu';
    if (/polon|polsk|польск/i.test(text)) return 'pl';
    if (/ucraine|ukrain|украин/i.test(text)) return 'uk';
    if (/englez|english|англ/i.test(text)) return 'en';
    if (/bulgar|българ|болгар/i.test(text)) return 'bg';
    if (/sârb|sar[bă]|srpsk|серб/i.test(text)) return 'sr';
    if (/turc|turkish|турец/i.test(text)) return 'tr';
    if (/arab|араб/i.test(text)) return 'ar';
    if (/ebra|hebrew|евре/i.test(text)) return 'he';
    if (/maghiar|hungar|ungar|венгр/i.test(text)) return 'hu';
    if (/spaniol|spanish|испан/i.test(text)) return 'es';
    if (/portug|portugu/i.test(text)) return 'pt';
    return 'xx';
  };

  const languageDominancePattern = /(?:limba|language|langue|lingua|sprache|язык|мова)\s+(?:predomin(?:ă|a)|principal(?:ă|a)|majoritar(?:ă|a)|dominant(?:ă|a))\s*[:\-]?\s*([^.;,\n]+)/iu;

  const dominantLanguageCode = (record) => {
    const evidence = [record?.description, record?.quote, record?.title]
      .filter(Boolean)
      .join(' ');
    const match = evidence.match(languageDominancePattern);
    return match ? languageCodeFor(match[1]) : null;
  };

  const languageCode = (value, record = null) => {
    const text = String(value || '').trim();
    if (!text) return 'xx';
    const parts = text.split(/(\s*(?:→|->|\/|,|;)\s*)/)
      .map((part) => /^\s*(?:→|->|\/|,|;)\s*$/.test(part)
        ? { separator: part.trim() }
        : { code: languageCodeFor(part) });
    const identified = parts.filter((part) => !part.separator && part.code !== 'xx');
    const hasMoldoveneasca = identified.some((part) => part.code === 'md');
    const explicitDirection = parts.some((part) => part.separator && /→|->/.test(part.separator));
    const dominant = dominantLanguageCode(record);
    const priority = dominant && identified.some((part) => part.code === dominant)
      ? dominant
      : 'md';

    // Dacă sunt identificate mai multe limbi, iar printre ele este md,
    // moldoveneasca este prima implicit. O dovadă explicită de predominanță
    // schimbă prioritatea; săgeata păstrează ordinea sursă → țintă.
    if (identified.length > 1 && hasMoldoveneasca && (!explicitDirection || dominant)) {
      const orderedCodes = [priority, ...identified.map((part) => part.code)
        .filter((code) => code !== priority)];
      let codeIndex = 0;
      parts.forEach((part) => {
        if (!part.separator && part.code !== 'xx') part.code = orderedCodes[codeIndex++];
      });
    }

    return parts.map((part) => part.separator || part.code)
      .join(' ')
      .replace(/\s+(→|->|\/|,)\s+/g, ' $1 ')
      .trim();
  };

  const languageNamesByCode = Object.freeze({
    md: 'moldovenească',
    ru: 'rusă',
    la: 'latină',
    de: 'germană',
    fr: 'franceză',
    it: 'italiană',
    el: 'greacă',
    cu: 'slavonă',
    pl: 'poloneză',
    uk: 'ucraineană',
    en: 'engleză',
    bg: 'bulgară',
    sr: 'sârbă',
    tr: 'turcă',
    ar: 'arabă',
    he: 'ebraică',
    hu: 'maghiară',
    es: 'spaniolă',
    pt: 'portugheză',
    xx: 'necunoscută'
  });

  const languageTooltip = (codeValue, fullValue) => {
    const code = String(codeValue || '').trim();
    if (!code || code === '—') return '';
    const mapped = code.replace(/\b(?:md|ru|la|de|fr|it|el|cu|pl|uk|en|bg|sr|tr|ar|he|hu|es|pt|xx)\b/gi,
      (token) => languageNamesByCode[token.toLowerCase()] || token);
    const full = String(fullValue || '').trim();
    if (mapped !== code && mapped !== 'necunoscută') return mapped;
    return full && full !== '—' && full !== code ? full : mapped;
  };

  const sourceUrls = (record) => {
    const urls = [];
    const addValue = (value) => {
      if (Array.isArray(value)) {
        value.forEach(addValue);
        return;
      }
      const matches = String(value || '').match(/https?:\/\/[^\s<>"']+/gi) || [];
      matches.forEach((url) => {
        const cleaned = url.replace(/[),.;!?]+$/g, '');
        if (cleaned && !urls.includes(cleaned)) urls.push(cleaned);
      });
    };
    addValue(record?.source_urls);
    addValue(record?.source_url);
    addValue(record?.description);
    return urls;
  };

  const imageUrl = (record) => {
    const value = String(record?.image_url || '').trim();
    if (!value) return '';
    if (/^data:image\/(avif|gif|jpe?g|png|webp);base64,[a-z0-9+/=]+$/i.test(value.replace(/\s+/g, ''))) {
      return value.replace(/\s+/g, '');
    }
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  };

  const imageMaxEdge = 1600;
  const imageJpegQuality = 0.82;
  let imageSourceDataUrl = '';
  let imageHasExternalRed = false;
  let imageStrokes = [];
  let activeImageStroke = null;

  const detectRedAnnotations = (context, width, height) => {
    const pixels = context.getImageData(0, 0, width, height).data;
    let redPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red >= 150 && red > green * 1.45 && red > blue * 1.45 && green <= 140) redPixels += 1;
    }
    return redPixels >= Math.max(24, width * height * 0.00015);
  };

  const readImageFile = (file) => new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('Alege o imagine.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Imaginea nu a putut fi citită.'));
    reader.readAsDataURL(file);
  });

  const resizeImageData = (dataUrl) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const longestEdge = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
      const scale = longestEdge > imageMaxEdge ? imageMaxEdge / longestEdge : 1;
      const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
      const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) {
        reject(new Error('Browserul nu poate pregăti imaginea.'));
        return;
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', imageJpegQuality),
        width,
        height,
        originalWidth: image.naturalWidth || image.width,
        originalHeight: image.naturalHeight || image.height,
        hasRedAnnotations: detectRedAnnotations(context, width, height)
      });
    };
    image.onerror = () => reject(new Error('Imaginea nu a putut fi pregătită.'));
    image.src = dataUrl;
  });

  const loadImageData = (dataUrl) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Imaginea nu a putut fi pregătită.'));
    image.src = dataUrl;
  });

  const drawRedStroke = (context, points, width) => {
    if (!points?.length) return;
    context.save();
    context.strokeStyle = '#c62828';
    context.fillStyle = '#c62828';
    context.lineWidth = Math.max(3, Math.round(width / 250));
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (points.length === 1) {
      context.beginPath();
      context.arc(points[0].x, points[0].y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
    }
    context.restore();
  };

  const drawRedStrokeSegment = (context, from, to, width) => {
    if (!from || !to) return;
    context.save();
    context.strokeStyle = '#c62828';
    context.lineWidth = Math.max(3, Math.round(width / 250));
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  };

  const paintImageMarkup = async () => {
    if (!imageCanvas || !imageSourceDataUrl) return;
    const image = await loadImageData(imageSourceDataUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    imageCanvas.width = width;
    imageCanvas.height = height;
    const context = imageCanvas.getContext('2d', { alpha: false });
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    if (!imageHasExternalRed) {
      const year = String(yearInput?.value || '').trim();
      const yearSize = Math.max(24, Math.round(width * 0.035));
      if (year) {
        context.font = `700 ${yearSize}px sans-serif`;
        const yearWidth = context.measureText(year).width;
        context.fillStyle = 'rgba(255, 255, 255, 0.76)';
        context.fillRect(12, 12, yearWidth + 20, yearSize + 18);
        context.fillStyle = '#c62828';
        context.fillText(year, 22, yearSize + 18);
      }
      const watermarkSize = Math.max(12, Math.round(width * 0.012));
      const watermark = 'dudnic.com/moldoveneasca';
      context.font = `400 ${watermarkSize}px sans-serif`;
      const watermarkWidth = context.measureText(watermark).width;
      context.fillStyle = 'rgba(255, 255, 255, 0.68)';
      context.fillRect(width - watermarkWidth - 18, height - watermarkSize - 14, watermarkWidth + 12, watermarkSize + 8);
      context.fillStyle = 'rgba(70, 70, 70, 0.72)';
      context.fillText(watermark, width - watermarkWidth - 12, height - 10);
      imageStrokes.forEach((stroke) => drawRedStroke(context, stroke, width));
    }

    if (imageMarkupStatus) {
      imageMarkupStatus.textContent = imageHasExternalRed
        ? 'Scanul are deja adnotări roșii; îl păstrăm exact așa și nu adăugăm marcaje dudnic.com.'
        : 'Trasează cu mouse-ul sau degetul o linie roșie sub glotonim; anul și marca discretă dudnic.com se adaugă automat.';
    }
    if (imageUndoButton) imageUndoButton.hidden = imageHasExternalRed;
    if (imageClearButton) imageClearButton.hidden = imageHasExternalRed;
    imageInput.value = imageCanvas.toDataURL('image/jpeg', 0.88);
    renderImagePreview();
  };

  const resetImageMarkup = () => {
    imageSourceDataUrl = '';
    imageHasExternalRed = false;
    imageStrokes = [];
    activeImageStroke = null;
    if (imageMarkup) imageMarkup.hidden = true;
    if (imageCanvas) {
      const context = imageCanvas.getContext('2d');
      context?.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    }
  };

  const renderImagePreview = () => {
    if (!imagePreview || !imageInput) return;
    const value = String(imageInput.value || '').trim();
    const url = imageUrl({ image_url: value });
    imagePreview.replaceChildren();
    if (!url) {
      imagePreview.hidden = true;
      return;
    }
    const preview = document.createElement('img');
    preview.src = url;
    preview.alt = 'Previzualizarea paginii cu citatul';
    preview.loading = 'lazy';
    imagePreview.appendChild(preview);
    imagePreview.hidden = false;
  };

  const setImageFromFile = async (file) => {
    if (!imageInput || !file) return;
    try {
      if (imageHint) imageHint.textContent = 'Se pregătește captura…';
      const source = await readImageFile(file);
      const prepared = await resizeImageData(source);
      imageSourceDataUrl = prepared.dataUrl;
      imageHasExternalRed = prepared.hasRedAnnotations;
      imageStrokes = [];
      if (imageMarkup) imageMarkup.hidden = false;
      await paintImageMarkup();
      if (imageHint) {
        const resized = prepared.width !== prepared.originalWidth || prepared.height !== prepared.originalHeight;
        const compacted = resized ? ' Imaginea mare a fost compactată automat.' : '';
        imageHint.textContent = imageHasExternalRed
          ? `Captură pregătită (${prepared.width}×${prepared.height}px). Au fost păstrate marcajele roșii existente; nu se adaugă altele.`
          : `Captură pregătită (${prepared.width}×${prepared.height}px).${compacted}`;
      }
    } catch (error) {
      if (imageHint) imageHint.textContent = error.message || 'Imaginea nu a putut fi pregătită.';
    } finally {
      if (imageFileInput) imageFileInput.value = '';
    }
  };

  const recordFromStaticRow = (row) => {
    const structured = row.cells.length >= 7;
    const yearLabel = row.cells[0]?.textContent.trim() || '';
    const sourceCell = structured ? row.cells[6] : row.cells[1];
    const sourceText = extractCellText(structured ? row : row.cells[1]);
    const urls = [...(sourceCell?.querySelectorAll('a[href]') || [])].map((link) => link.href);
    const title = structured
      ? extractCellText(row.cells[2])
      : (extractTitle(sourceText) || sourceText);
    const quote = structured
      ? cleanQuote(extractCellText(row.cells[3]))
      : extractQuote(sourceText);
    return {
      year_label: yearLabel,
      year_start: parseYears(yearLabel)[0] || null,
      year_end: parseYears(yearLabel)[1] || parseYears(yearLabel)[0] || null,
      title,
      quote: quote || null,
      language: structured ? (extractCellText(row.cells[4]) || null) : null,
      author: structured ? (extractCellText(row.cells[5]) || 'necunoscut') : extractAuthor(sourceText),
      source_url: urls[0] || null,
      source_urls: urls,
      source_type: structured ? 'Tabel static structurat' : 'Import din tabelul existent',
      location: null,
      description: structured ? null : sourceText,
      image_url: null,
      status: 'published',
      owner_id: null
    };
  };

  const recordFromEthnicityStaticRow = (row) => {
    const structured = row.cells.length >= 7;
    const sourceCell = row.cells[structured ? 6 : 5];
    const sourceUrlsFromRow = [...(sourceCell?.querySelectorAll('a[href]') || [])].map((link) => link.href);
    return {
      year_label: row.cells[0]?.textContent.trim() || '',
      year_start: parseYears(row.cells[0]?.textContent)[0] || null,
      year_end: parseYears(row.cells[0]?.textContent)[1] || parseYears(row.cells[0]?.textContent)[0] || null,
      title: extractCellText(row.cells[2]),
      quote: cleanQuote(extractCellText(row.cells[3])),
      language: structured ? (extractCellText(row.cells[4]) || null) : null,
      author: extractCellText(row.cells[structured ? 5 : 4]),
      source_url: sourceUrlsFromRow[0] || null,
      source_urls: sourceUrlsFromRow,
      source_type: structured ? 'Tabel static structurat' : 'Import din tabelul existent',
      location: null,
      description: structured ? null : [
        extractCellText(row.cells[2]),
        extractCellText(row.cells[3])
      ].filter(Boolean).join(' — '),
      image_url: null,
      catalog_type: 'ethnicity',
      status: 'published',
      owner_id: null
    };
  };

  const displayFields = (record) => {
    const raw = record?.title || '';
    const imported = record?.source_type === 'Import din tabelul existent';
    const title = imported ? (extractTitle(raw) || '—') : (raw || '—');
    const directQuote = cleanQuote(record?.quote);
    const quote = imported
      ? (extractQuote(record?.quote) || extractQuote(raw) || directQuote || null)
      : (directQuote || null);
    const language = languageCode(record?.language, record);
    return {
      year: yearRangeLabel(record),
      century: centuryLabel(record),
      title,
      quote,
      language,
      languageFull: languageTooltip(language, record?.language) || 'necunoscută',
      author: record?.author || (imported ? extractAuthor(raw) : null) || '—'
    };
  };

  const recordCatalogType = (record) => catalogTypeValues.has(record?.catalog_type)
    ? record.catalog_type
    : 'language';

  const catalogIncludes = (record, catalog) => {
    const type = recordCatalogType(record);
    return type === catalog || type === 'both';
  };

  const removeImportedQuote = (value, quote) => {
    let text = cleanImportedText(value);
    if (!text || !quote) return text;
    const variants = [
      `«${quote}»`,
      `“${quote}”`,
      `„${quote}”`,
      `"${quote}"`,
      `'${quote}'`,
      quote
    ];
    const variant = variants.find((candidate) => text.includes(candidate));
    if (variant) text = text.replace(variant, ' ');
    return text
      .replace(/\s*\(\s*sursa(?:\s+suplimentară)?\s*\d*\s*\)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^\s*[,;:–—-]\s*/, '')
      .replace(/\s*[,;:–—-]\s*$/, '')
      .trim();
  };

  const recordComments = (record) => {
    const comments = [];
    const description = cleanImportedText(record?.description);
    const raw = cleanImportedText(record?.title);
    const imported = record?.source_type === 'Import din tabelul existent';
    if (description && (!imported || description !== raw)) comments.push(description);
    if (imported && raw) {
      const residual = removeImportedQuote(raw, extractQuote(record?.quote) || extractQuote(raw));
      if (residual && !comments.includes(residual)) comments.push(residual);
    }
    return comments.join('\n\n') || null;
  };

  const ensureTableHeader = () => {
    const thead = table.tHead || table.querySelector('thead');
    const headRow = thead?.rows[0] || table.querySelector('thead tr');
    if (!thead || !headRow) return;
    headRow.replaceChildren();
    const headings = [
      ['selection', ''],
      ['year', 'An'],
      ['century', 'Secol'],
      ['title', 'Denumirea'],
      ['quote', 'Citat'],
      ['language', 'Limba'],
      ['author', 'Autor'],
      ['source', 'Sursa'],
      ['actions', '']
    ];
    headings.forEach(([key, label]) => {
      const th = document.createElement('th');
      th.scope = 'col';
      if (key === 'selection') {
        th.className = 'moldoveneasca-table__selection-heading';
        th.dataset.selectionHeading = 'true';
        th.hidden = currentRole !== 'admin';
        th.setAttribute('aria-label', 'Selectare');
      } else if (key === 'year') {
        th.className = 'moldoveneasca-table__year-heading';
        th.appendChild(document.createTextNode(label));
        sortButton = document.createElement('button');
        sortButton.type = 'button';
        sortButton.className = 'moldoveneasca-table__sort moldoveneasca-icon-button';
        sortButton.dataset.sortYear = 'true';
        sortButton.dataset.tooltip = 'Sortează anii';
        sortButton.title = 'Sortează anii';
        sortButton.setAttribute('aria-label', 'Sortează anii');
        sortButton.appendChild(createIconSvg('sort-up'));
        sortButton.addEventListener('click', () => {
          sortAscending = !sortAscending;
          currentPage = 1;
          sortRowsChronologically();
          filterRows();
        });
        th.appendChild(sortButton);
      } else if (key === 'actions') {
        th.className = 'moldoveneasca-table__actions-heading';
        th.setAttribute('aria-label', 'Acțiuni');
      } else {
        th.className = `moldoveneasca-table__${key}-heading`;
        th.textContent = label;
      }
      headRow.appendChild(th);
    });

    thead.querySelector('.moldoveneasca-table__filters')?.remove();
  };

  const currentRows = () => Array.from(tbody.rows);
  const ethnicityRows = () => (ethnicityTbody ? Array.from(ethnicityTbody.rows) : []);
  const unverifiedRows = () => (unverifiedTbody ? Array.from(unverifiedTbody.rows) : []);
  const searchableRows = () => [
    ...currentRows(),
    ...ethnicityRows(),
    ...(unverifiedSection && !unverifiedSection.hidden ? unverifiedRows() : [])
  ];
  const rowMatchesFilter = (row, query, century) => (
    (!query || row.dataset.catalogSearch.includes(query))
    && (!century || row.catalogFields?.century === century)
  );

  const updateActionsColumnVisibility = () => {
    const actionTables = [table, unverifiedTable, ethnicityTable].filter(Boolean);
    const actionColumns = actionTables.flatMap((catalogTable) => [
      ...catalogTable.querySelectorAll('.moldoveneasca-table__actions-heading, .moldoveneasca-table__actions-cell')
    ]);
    actionColumns.forEach((cell) => {
      cell.hidden = false;
    });
    const hasVisibleAction = actionTables.some((catalogTable) => [
      ...catalogTable.querySelectorAll('.moldoveneasca-table__actions-cell')
    ].some((cell) => {
      const row = cell.closest('tr');
      return !row?.hidden && cell.querySelector('button:not([hidden])');
    }));
    actionColumns.forEach((cell) => {
      cell.hidden = !hasVisibleAction;
    });
  };

  const setRowMetadata = (row, record) => {
    const fields = displayFields(record);
    const rowYear = parseYearStart(record);
    row.catalogFields = {
      year: normalize([record?.year_label, fields.year].filter(Boolean).join(' ')),
      century: normalize(fields.century),
      centuryLabel: fields.century,
      centuryNumber: rowYear ? Math.floor((rowYear - 1) / 100) + 1 : Number.POSITIVE_INFINITY,
      title: normalize(fields.title),
      quote: normalize(fields.quote),
      language: normalize(fields.language),
      author: normalize(fields.author),
      source: normalize(sourceUrls(record).join(' ')),
      comments: normalize(recordComments(record))
    };
    row.dataset.catalogYear = String(rowYear || '');
    row.dataset.catalogLinked = sourceUrls(record).length ? 'true' : 'false';
    row.dataset.catalogSearch = normalize([
      record?.year_label,
      fields.year,
      fields.century,
      fields.title,
      fields.quote,
      fields.language,
      fields.languageFull,
      record?.language,
      fields.author,
      sourceUrls(record).join(' '),
      recordComments(record)
    ].filter(Boolean).join(' '));
    row.dataset.catalogIndex = row.dataset.catalogIndex || String(rowSequence++);
  };

  const textCell = (value, className = '', title = '') => {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    const text = value || '—';
    const content = document.createElement('span');
    content.className = 'moldoveneasca-table__truncate';
    content.textContent = text;
    if (text !== '—') content.title = title || text;
    cell.appendChild(content);
    return cell;
  };

  const quoteIndicatorPattern = /(moldoveneas\p{L}*|moldovineas\p{L}*|moldovenesc\p{L}*|moldav\p{L}*|moldau\p{L}*|moldovin\p{L}*|moldeuška|молдавск\p{L}*|молдовен\p{L}*)/giu;

  const hasLanguageAndGlotonym = (value) => {
    const text = String(value || '');
    const languageIndex = text.search(languageLabelPattern);
    const nameIndex = text.search(languageNamePattern);
    return languageIndex >= 0 && nameIndex >= 0 && Math.abs(languageIndex - nameIndex) <= 80;
  };

  const hasEthnicityAndGlotonym = (value) => {
    const text = String(value || '');
    const nameIndex = text.search(languageNamePattern);
    const labelIndex = text.search(ethnicityLabelPattern);
    return nameIndex >= 0 && labelIndex >= 0 && Math.abs(nameIndex - labelIndex) <= 100;
  };

  const hasEthnicityEvidence = (value) => {
    const text = String(value || '');
    return hasEthnicityAndGlotonym(text) || ethnonymPattern.test(text);
  };

  const quoteRequirement = (catalogType) => {
    if (catalogType === 'ethnicity') {
      return {
        placeholder: 'Doar pasajul cu moldoveni, națiune, popor sau alt termen etnic.',
        hint: 'Catalogul etnic: citatul trebuie să documenteze moldovenii, națiunea, poporul sau alt termen etnic.',
        error: 'Pentru catalogul etnic, citatul sau comentariile trebuie să documenteze moldovenii, națiunea, poporul ori un alt termen etnic.'
      };
    }
    if (catalogType === 'both') {
      return {
        placeholder: 'Citatul trebuie să documenteze limba și etnia, dacă apar amândouă.',
        hint: 'Ambele cataloage: citatul și comentariile trebuie să documenteze separat denumirea limbii și referința etnică.',
        error: 'Pentru ambele cataloage, citatul sau comentariile trebuie să documenteze atât denumirea limbii, cât și referința etnică.'
      };
    }
    return {
      placeholder: 'Doar pasajul cu termenul pentru limbă și glotonimul.',
      hint: 'Catalogul limbii: citatul trebuie să conțină un termen pentru limbă și glotonimul; pentru dicționare sau gramatici, dovada poate fi în denumire ori comentarii.',
      error: 'Pentru catalogul limbii, citatul trebuie să conțină un termen pentru limbă și glotonimul; la lucrări lingvistice explicite, dovada poate fi în denumire sau comentarii.'
    };
  };

  const updateQuoteRequirement = () => {
    const selectedType = String(catalogTypeField?.value || 'language');
    const catalogType = catalogTypeValues.has(selectedType) ? selectedType : 'language';
    const requirement = quoteRequirement(catalogType);
    if (quoteField) quoteField.placeholder = requirement.placeholder;
    if (quoteHint) quoteHint.textContent = requirement.hint;
  };

  const hasGlotonym = (value) => languageNamePattern.test(String(value || ''));

  const appendQuoteText = (parent, value) => {
    const text = String(value || '');
    quoteIndicatorPattern.lastIndex = 0;
    let cursor = 0;
    for (const match of text.matchAll(quoteIndicatorPattern)) {
      if (match.index > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      const indicator = document.createElement('em');
      indicator.textContent = match[0];
      parent.appendChild(indicator);
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
  };

  const closeDetail = () => {
    if (detailPanel) {
      detailPanel.classList.remove('is-open');
      detailPanel.hidden = true;
    }
    if (detailBackdrop) detailBackdrop.hidden = true;
    document.body.classList.remove('moldoveneasca-detail-open');
    if (lastDetailTrigger?.isConnected) lastDetailTrigger.focus();
    lastDetailTrigger = null;
    detailNavigationRows = [];
    detailNavigationIndex = -1;
  };

  const detailRowsForTrigger = (trigger) => {
    const sourceTable = trigger?.closest('table');
    const sourceTbody = sourceTable?.tBodies?.[0];
    if (!sourceTbody) return [];
    const query = normalize(searchInput?.value);
    const century = normalize(centurySelect?.value);
    return [...sourceTbody.rows].filter((row) => (
      row.catalogRecord && rowMatchesFilter(row, query, century)
    ));
  };

  const updateDetailNavigation = () => {
    const total = detailNavigationRows.length;
    const hasNavigation = total > 1 && detailNavigationIndex >= 0;
    if (detailNavigation) detailNavigation.hidden = !hasNavigation;
    if (detailPreviousButton) {
      detailPreviousButton.disabled = !hasNavigation || detailNavigationIndex <= 0;
      detailPreviousButton.setAttribute('aria-label', detailPreviousButton.disabled
        ? 'Nu există o referință precedentă'
        : 'Deschide referința precedentă');
    }
    if (detailNextButton) {
      detailNextButton.disabled = !hasNavigation || detailNavigationIndex >= total - 1;
      detailNextButton.setAttribute('aria-label', detailNextButton.disabled
        ? 'Nu există o referință următoare'
        : 'Deschide referința următoare');
    }
    if (detailPosition) detailPosition.textContent = hasNavigation
      ? `${detailNavigationIndex + 1} din ${total}`
      : '';
  };

  const openDetail = (record, trigger, options = {}) => {
    if (!detailPanel || !detailContent) return;
    const wasClosed = detailPanel.hidden;
    const fields = displayFields(record);
    const urls = sourceUrls(record);
    detailContent.replaceChildren();
    if (detailTitle) detailTitle.textContent = fields.title === '—' ? 'Detalii referință' : fields.title;
    if (detailImage) {
      detailImage.replaceChildren();
      const url = imageUrl(record);
      if (url) {
        const image = document.createElement('img');
        image.src = url;
        image.alt = fields.title === '—' ? 'Imaginea referinței' : fields.title;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', () => {
          detailImage.replaceChildren();
          detailImage.hidden = true;
        }, { once: true });
        detailImage.appendChild(image);
        detailImage.hidden = false;
      } else {
        detailImage.hidden = true;
      }
    }

    const addDetailField = (label, value, render = null) => {
      if (!value || value === '—') return;
      const item = document.createElement('div');
      item.className = 'moldoveneasca-detail__item';
      const heading = document.createElement('dt');
      heading.textContent = label;
      const content = document.createElement('dd');
      if (render) render(content, value);
      else content.textContent = value;
      item.appendChild(heading);
      item.appendChild(content);
      detailContent.appendChild(item);
    };

    addDetailField('An', fields.year);
    addDetailField('Secol', fields.century);
    addDetailField('Limba (în clar)', fields.languageFull);
    addDetailField('Cod limbă', fields.language);
    addDetailField('Autor', fields.author);
    addDetailField('Proveniență', record?.source_type);
    addDetailField('Locul / instituția', record?.location);
    addDetailField('Citat', fields.quote, (content, value) => {
      content.appendChild(document.createTextNode('„'));
      appendQuoteText(content, value);
      content.appendChild(document.createTextNode('”'));
    });
    addDetailField('Comentarii', recordComments(record));
    if (urls.length) {
      addDetailField('Surse', urls.join('\n'), (content) => {
        content.className = 'moldoveneasca-detail__sources';
        urls.forEach((url, index) => {
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = `[${index + 1}]`;
          link.title = url;
          content.appendChild(link);
          if (index < urls.length - 1) content.appendChild(document.createTextNode(', '));
        });
      });
    }

    if (trigger) {
      if (wasClosed) lastDetailTrigger = trigger;
      detailNavigationRows = detailRowsForTrigger(trigger);
      detailNavigationIndex = detailNavigationRows.findIndex((row) => row === trigger.closest('tr'));
    } else if (Number.isInteger(options.navigationIndex)) {
      detailNavigationIndex = options.navigationIndex;
    }
    updateDetailNavigation();
    detailPanel.hidden = false;
    if (detailBackdrop) detailBackdrop.hidden = false;
    detailPanel.classList.add('is-open');
    document.body.classList.add('moldoveneasca-detail-open');
    if (detailBody) detailBody.scrollTop = 0;
    if (wasClosed && options.focusClose !== false) closeDetailButton?.focus();
  };

  const navigateDetail = (direction) => {
    const targetIndex = detailNavigationIndex + direction;
    if (targetIndex < 0 || targetIndex >= detailNavigationRows.length) return;
    const targetRow = detailNavigationRows[targetIndex];
    const targetRecord = targetRow?.catalogRecord;
    if (!targetRecord) return;
    openDetail(targetRecord, null, { focusClose: false, navigationIndex: targetIndex });
    (direction < 0 ? detailPreviousButton : detailNextButton)?.focus();
  };

  const createIconSvg = (kind) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const paths = {
      edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM14.06 4.94l3.75 3.75',
      delete: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
      reset: 'M20 11a8 8 0 1 0 2 5M20 5v6h-6',
      add: 'M12 5v14M5 12h14',
      previous: 'M19 12H5M12 19l-7-7 7-7',
      next: 'M5 12h14M12 5l7 7-7 7',
      first: 'M11 5L4 12l7 7M20 5l-7 7 7 7',
      last: 'M4 5l7 7-7 7M13 5l7 7-7 7',
      cancel: 'M6 6l12 12M18 6L6 18',
      save: 'M5 12l4 4L19 6',
      undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 6 6v1',
      login: 'M10 17l5-5-5-5M15 12H3M21 3v18',
      logout: 'M14 17l5-5-5-5M19 12H7M3 3v18',
      image: 'M4 5h16v14H4zM7 15l3-3 2 2 2-2 3 3M8.5 9.5h.01',
      'sort-up': 'M7 14l5-5 5 5',
      'sort-down': 'M7 10l5 5 5-5'
    };
    path.setAttribute('d', paths[kind] || paths.cancel);
    svg.appendChild(path);
    return svg;
  };

  const createIconButton = (label, kind, onClick, modifier = '') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `moldoveneasca-icon-button${modifier ? ` ${modifier}` : ''}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.tooltip = label;
    button.appendChild(createIconSvg(kind));
    button.addEventListener('click', onClick);
    return button;
  };

  const configureIconButton = (button, label, kind) => {
    if (!button) return;
    button.classList.remove('moldoveneasca-button', 'moldoveneasca-button--quiet');
    button.classList.add('moldoveneasca-icon-button');
    button.replaceChildren(createIconSvg(kind));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.tooltip = label;
  };

  const configureCatalogButtons = () => {
    configureIconButton(resetButton, 'Resetează căutarea', 'reset');
    configureIconButton(openFormButton, 'Adaugă referință', 'add');
    configureIconButton(cancelEditButton, 'Anulează editarea', 'cancel');
    configureIconButton(editorForm?.querySelector('button[type="submit"]'), 'Salvează referința', 'save');
    configureIconButton(firstPageButton, 'Prima pagină', 'first');
    configureIconButton(previousPageButton, 'Pagina anterioară', 'previous');
    configureIconButton(nextPageButton, 'Pagina următoare', 'next');
    configureIconButton(lastPageButton, 'Ultima pagină', 'last');
    configureIconButton(closeDetailButton, 'Închide detaliile', 'cancel');
    configureIconButton(logoutButton, 'Ieșire din cont', 'logout');
    configureIconButton(imagePickButton, 'Încarcă imaginea paginii citate', 'image');
    configureIconButton(imageUndoButton, 'Anulează ultima subliniere', 'undo');
    configureIconButton(imageClearButton, 'Elimină sublinierile adăugate', 'cancel');
    configureIconButton(selectionDeleteButton, 'Șterge referințele selectate', 'delete');
    configureIconButton(selectionClearButton, 'Deselectează referințele selectate', 'cancel');
  };

  const createCatalogRow = (record, options = {}) => {
    const fields = displayFields(record);
    const row = document.createElement('tr');
    row.catalogRecord = record;
    if (record.id) {
      row.dataset.remoteReference = record.id;
      row.dataset.referenceId = record.id;
    }
    const selectionCell = document.createElement('td');
    selectionCell.className = 'moldoveneasca-table__selection-cell';
    selectionCell.dataset.selectionCell = 'true';
    selectionCell.hidden = currentRole !== 'admin';
    if (record.id) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'moldoveneasca-reference-select';
      checkbox.dataset.referenceSelect = record.id;
      checkbox.checked = selectedReferenceIds.has(record.id);
      checkbox.setAttribute('aria-label', `Selectează referința ${fields.title === '—' ? fields.year : fields.title}`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedReferenceIds.add(record.id);
        else selectedReferenceIds.delete(record.id);
        updateSelectionUi();
      });
      selectionCell.appendChild(checkbox);
    }
    row.appendChild(selectionCell);
    const yearCell = textCell(fields.year, 'moldoveneasca-table__year');
    yearCell.setAttribute('aria-label', `An: ${fields.year}`);
    row.appendChild(yearCell);
    const centuryCell = textCell(fields.century, 'moldoveneasca-table__century');
    centuryCell.setAttribute('aria-label', `Secol: ${fields.century}`);
    row.appendChild(centuryCell);

    const titleCell = document.createElement('td');
    titleCell.className = 'moldoveneasca-table__title';
    const titleText = fields.title || '—';
    const titleLink = document.createElement('a');
    titleLink.href = '#reference-detail';
    titleLink.className = 'moldoveneasca-table__detail-link';
    titleLink.textContent = titleText;
    titleLink.title = titleText === '—' ? `Deschide detaliile referinței din ${fields.year}` : titleText;
    titleLink.setAttribute('aria-label', titleText === '—'
      ? `Deschide detaliile referinței din ${fields.year}`
      : `Deschide detaliile pentru ${titleText}`);
    titleLink.addEventListener('click', (event) => {
      event.preventDefault();
      openDetail(record, titleLink);
    });
    titleCell.appendChild(titleLink);
    row.appendChild(titleCell);

    const quoteCell = document.createElement('td');
    quoteCell.className = 'moldoveneasca-table__quote';
    if (fields.quote && fields.quote !== '—') {
      const quoteText = document.createElement('span');
      quoteText.className = 'moldoveneasca-table__truncate';
      quoteText.title = fields.quote;
      quoteText.appendChild(document.createTextNode('„'));
      appendQuoteText(quoteText, fields.quote);
      quoteText.appendChild(document.createTextNode('”'));
      quoteCell.appendChild(quoteText);
    } else {
      quoteCell.textContent = '—';
    }
    row.appendChild(quoteCell);
    row.appendChild(textCell(
      fields.language,
      'moldoveneasca-table__language',
      languageTooltip(fields.language, fields.languageFull)
    ));
    row.appendChild(textCell(fields.author, 'moldoveneasca-table__author'));

    const sourceCell = document.createElement('td');
    sourceCell.className = 'moldoveneasca-table__source';
    const urls = sourceUrls(record);
    if (urls.length) {
      const sourceLinks = document.createElement('span');
      sourceLinks.className = 'moldoveneasca-table__source-links';
      urls.forEach((url, index) => {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `[${index + 1}]`;
        link.title = url;
        link.className = 'moldoveneasca-table__source-link';
        sourceLinks.appendChild(link);
        if (index < urls.length - 1) sourceLinks.appendChild(document.createTextNode(', '));
      });
      sourceCell.appendChild(sourceLinks);
    } else {
      sourceCell.textContent = '—';
    }

    const actionsCell = document.createElement('td');
    actionsCell.className = 'moldoveneasca-table__actions-cell';
    const canEdit = currentRole === 'admin' || (currentRole === 'editor' && currentUser?.id === record.owner_id);
    if (canEdit && record.id) {
      const actions = document.createElement('div');
      actions.className = 'moldoveneasca-table__actions';
      actions.appendChild(createIconButton(
        'Editează referința',
        'edit',
        () => openEditor(record),
        'moldoveneasca-table__edit-button'
      ));
      actionsCell.appendChild(actions);
    }

    if (options.showStatusBadge !== false && record.status && record.status !== 'published') {
      const badge = document.createElement('span');
      badge.className = 'moldoveneasca-status';
      badge.textContent = record.status === 'pending' ? 'În verificare' : 'Neverificată';
      sourceCell.appendChild(badge);
    }
    row.appendChild(sourceCell);
    row.appendChild(actionsCell);
    setRowMetadata(row, record);
    return row;
  };

  configureCatalogButtons();
  ensureTableHeader();
  const staticRows = currentRows().map((row) => {
    const converted = createCatalogRow(recordFromStaticRow(row));
    row.replaceWith(converted);
    return converted;
  });
  const ethnicityStaticEntries = ethnicityTbody
    ? Array.from(ethnicityTbody.rows).map((row) => {
      const record = recordFromEthnicityStaticRow(row);
      const converted = createCatalogRow(record);
      row.replaceWith(converted);
      return { row: converted, record };
    })
    : [];

  const recordIdentity = (record) => normalize([
    record?.year_label,
    record?.quote,
    record?.source_url || record?.title
  ].filter(Boolean).join('|'));

  const getSortedRows = () => currentRows().sort((a, b) => {
    const yearA = Number(a.dataset.catalogYear) || Number.POSITIVE_INFINITY;
    const yearB = Number(b.dataset.catalogYear) || Number.POSITIVE_INFINITY;
    if (yearA === yearB) return Number(a.dataset.catalogIndex) - Number(b.dataset.catalogIndex);
    return (yearA - yearB) * (sortAscending ? 1 : -1);
  });

  const sortRowsChronologicallyIn = (targetTbody) => {
    if (!targetTbody) return;
    [...targetTbody.rows]
      .sort((a, b) => {
        const yearA = Number(a.dataset.catalogYear) || Number.POSITIVE_INFINITY;
        const yearB = Number(b.dataset.catalogYear) || Number.POSITIVE_INFINITY;
        if (yearA === yearB) return Number(a.dataset.catalogIndex) - Number(b.dataset.catalogIndex);
        return yearA - yearB;
      })
      .forEach((row) => targetTbody.appendChild(row));
  };

  const sortRowsChronologically = () => {
    getSortedRows().forEach((row) => tbody.appendChild(row));
    if (sortButton) {
      const sortLabel = sortAscending ? 'Sortează anii descrescător' : 'Sortează anii crescător';
      sortButton.replaceChildren(createIconSvg(sortAscending ? 'sort-up' : 'sort-down'));
      sortButton.setAttribute('aria-label', sortLabel);
      sortButton.title = sortLabel;
      sortButton.dataset.tooltip = sortLabel;
      const yearHeader = sortButton.closest('th');
      if (yearHeader) yearHeader.setAttribute('aria-sort', sortAscending ? 'ascending' : 'descending');
    }
  };

  const updateCenturyOptions = () => {
    if (!centurySelect) return;
    const previous = centurySelect.value;
    const centuryOptions = new Map(searchableRows()
      .map((row) => [
        row.catalogFields?.century,
        {
          label: row.catalogFields?.centuryLabel,
          number: row.catalogFields?.centuryNumber ?? Number.POSITIVE_INFINITY
        }
      ])
      .filter(([value]) => value));
    const centuryValues = [...centuryOptions.keys()].sort((a, b) => {
      const order = centuryOptions.get(a).number - centuryOptions.get(b).number;
      return order || a.localeCompare(b, 'ro');
    });
    centurySelect.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'Toate secolele';
    centurySelect.appendChild(allOption);
    centuryValues.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = centuryOptions.get(value).label;
      centurySelect.appendChild(option);
    });
    centurySelect.value = centuryValues.includes(previous) ? previous : '';
  };

  const updatePagination = (matchedCount) => {
    const totalPages = Math.max(1, Math.ceil(matchedCount / pageSize));
    catalogTotalPages = totalPages;
    if (currentPage > totalPages) currentPage = totalPages;
    if (pagination) pagination.hidden = totalPages <= 1;
    if (firstPageButton) firstPageButton.disabled = currentPage <= 1;
    if (previousPageButton) previousPageButton.disabled = currentPage <= 1;
    if (nextPageButton) nextPageButton.disabled = currentPage >= totalPages;
    if (lastPageButton) lastPageButton.disabled = currentPage >= totalPages;
    if (currentPageValue) currentPageValue.textContent = String(currentPage);
    if (totalPagesValue) totalPagesValue.textContent = String(totalPages);
    if (pageStatus) pageStatus.setAttribute('aria-label', `Pagina ${currentPage} din ${totalPages}`);
    return totalPages;
  };

  const updateStats = () => {
    if (recordCount) recordCount.textContent = String(searchableRows().length);
  };

  const selectionRows = () => [
    ...table.querySelectorAll('tbody tr[data-remote-reference]'),
    ...(unverifiedTable ? [...unverifiedTable.querySelectorAll('tbody tr[data-remote-reference]')] : []),
    ...(ethnicityTable ? [...ethnicityTable.querySelectorAll('tbody tr[data-remote-reference]')] : [])
  ];

  const visibleSelectionRows = () => selectionRows().filter((row) => (
    !row.hidden && row.querySelector('[data-reference-select]')
  ));

  const updateSelectionUi = () => {
    const isAdmin = Boolean(currentUser && currentRole === 'admin');
    const catalogTables = [table, unverifiedTable, ethnicityTable].filter(Boolean);

    if (!isAdmin) selectedReferenceIds.clear();
    catalogTables.forEach((catalogTable) => {
      catalogTable.querySelectorAll('[data-selection-heading], [data-selection-cell]').forEach((cell) => {
        cell.hidden = !isAdmin;
      });
      catalogTable.querySelectorAll('[data-reference-select]').forEach((checkbox) => {
        checkbox.hidden = !isAdmin;
        checkbox.checked = isAdmin && selectedReferenceIds.has(checkbox.dataset.referenceSelect);
      });
    });

    const selectedCount = selectedReferenceIds.size;
    if (selectionToolbar) selectionToolbar.hidden = !isAdmin;
    if (selectionCount) selectionCount.textContent = `Selectate: ${selectedCount}`;
    if (selectionDeleteButton) selectionDeleteButton.disabled = !isAdmin || selectedCount === 0;

    const visibleIds = visibleSelectionRows().map((row) => row.dataset.referenceId);
    const selectedVisibleCount = visibleIds.filter((id) => selectedReferenceIds.has(id)).length;
    if (selectionAll) {
      selectionAll.disabled = !isAdmin || visibleIds.length === 0;
      selectionAll.checked = isAdmin && visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
      selectionAll.indeterminate = isAdmin && selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
    }
  };

  const setVisibleSelection = (checked) => {
    visibleSelectionRows().forEach((row) => {
      const id = row.dataset.referenceId;
      const checkbox = row.querySelector('[data-reference-select]');
      if (!id || !checkbox) return;
      checkbox.checked = checked;
      if (checked) selectedReferenceIds.add(id);
      else selectedReferenceIds.delete(id);
    });
    updateSelectionUi();
  };

  const filterRows = () => {
    const query = normalize(searchInput?.value);
    updateCenturyOptions();
    const century = normalize(centurySelect?.value);
    const languageCatalogRows = currentRows();
    const ethnicityCatalogRows = ethnicityRows();
    const unverifiedCatalogRows = unverifiedSection && !unverifiedSection.hidden ? unverifiedRows() : [];
    const matchedRows = languageCatalogRows.filter((row) => rowMatchesFilter(row, query, century));
    const matchedEthnicityRows = ethnicityCatalogRows.filter((row) => rowMatchesFilter(row, query, century));
    const matchedUnverifiedRows = unverifiedCatalogRows.filter((row) => rowMatchesFilter(row, query, century));
    const matchedAllRows = [...matchedRows, ...matchedEthnicityRows, ...matchedUnverifiedRows];
    if (recordCount) recordCount.textContent = String(languageCatalogRows.length + ethnicityCatalogRows.length + unverifiedCatalogRows.length);
    updatePagination(matchedRows.length);
    if (filteredCount) filteredCount.textContent = String(matchedAllRows.length);
    const firstVisible = (currentPage - 1) * pageSize;
    const lastVisible = firstVisible + pageSize;
    const matchedSet = new Set(matchedRows);
    languageCatalogRows.forEach((row) => {
      const matchIndex = matchedRows.indexOf(row);
      row.hidden = !matchedSet.has(row) || matchIndex < firstVisible || matchIndex >= lastVisible;
    });
    ethnicityCatalogRows.forEach((row) => {
      row.hidden = !matchedEthnicityRows.includes(row);
    });
    unverifiedCatalogRows.forEach((row) => {
      row.hidden = !matchedUnverifiedRows.includes(row);
    });
    const visibleStart = matchedRows.length ? firstVisible + 1 : 0;
    const visibleEnd = Math.min(lastVisible, matchedRows.length);
    if (resetButton) resetButton.hidden = !query && !century;
    if (result) {
      if (query || century) {
        const parts = [
          `Limbă: ${matchedRows.length ? `${visibleStart}–${visibleEnd}` : '0'}`,
          `Etnie: ${matchedEthnicityRows.length}`
        ];
        if (unverifiedSection && !unverifiedSection.hidden) parts.push(`Neverificate: ${matchedUnverifiedRows.length}`);
        result.textContent = parts.join(' · ');
      } else {
        result.textContent = matchedRows.length
          ? `Afișate ${visibleStart}–${visibleEnd}`
          : 'Niciun rezultat';
      }
    }
    updateActionsColumnVisibility();
    updateSelectionUi();
  };

  const applySearch = () => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
    currentPage = 1;
    filterRows();
  };

  const scheduleSearch = () => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(applySearch, searchDebounceMs);
  };

  const setStatus = (message, tone = '') => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.dataset.tone = tone;
  };

  const setRole = (role) => {
    currentRole = ['viewer', 'editor', 'admin'].includes(role) ? role : 'viewer';
    if (roleBadge) {
      roleBadge.textContent = currentRole;
      roleBadge.dataset.role = currentRole;
      roleBadge.hidden = !currentUser;
    }
    if (openFormButton) openFormButton.hidden = !['editor', 'admin'].includes(currentRole) || !currentUser;
    if (adminOnlyField) adminOnlyField.hidden = currentRole !== 'admin';
    if (unverifiedSection) unverifiedSection.hidden = currentRole !== 'admin' || !currentUser;
    renderUnverifiedRows();
    updateSelectionUi();
  };

  const closeEditor = () => {
    editingId = null;
    if (editorForm) editorForm.reset();
    updateQuoteRequirement();
    resetImageMarkup();
    renderImagePreview();
    if (imageHint) imageHint.textContent = 'Lipește cu Ctrl+V captura paginii unde apare citatul; pentru un PDF păstrează doar pagina citată și, ideal, subliniază cu roșu glotonimul.';
    if (formTitle) formTitle.textContent = 'Adaugă o referință';
    setStatus('');
    if (editorPanel) editorPanel.hidden = true;
  };

  const setField = (name, value) => {
    const field = editorForm?.elements.namedItem(name);
    if (field) field.value = value || '';
  };

  const openEditor = (record = null) => {
    if (!editorPanel || !editorForm) return;
    if (!currentUser || !['editor', 'admin'].includes(currentRole)) {
      setStatus('Contul nu are drepturi de editare.', 'error');
      return;
    }
    resetImageMarkup();
    editingId = record?.id || null;
    const imported = record?.source_type === 'Import din tabelul existent';
    const fields = displayFields(record);
    const urls = sourceUrls(record);
    if (formTitle) formTitle.textContent = editingId ? 'Editează referința' : 'Adaugă o referință';
    setField('year_label', record?.year_label);
    setField('title', imported ? (fields.title === '—' ? null : fields.title) : record?.title);
    setField('language', record?.language);
    setField('author', record?.author);
    setField('source_type', record?.source_type);
    setField('catalog_type', recordCatalogType(record));
    updateQuoteRequirement();
    setField('description', recordComments(record));
    setField('quote', fields.quote);
    setField('location', record?.location);
    setField('source_url', record?.source_url || urls[0]);
    setField('image_url', record?.image_url);
    renderImagePreview();
    setField('status', record?.status || 'pending');
    setStatus('');
    editorPanel.hidden = false;
    editorPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderRemoteRows = () => {
    table.querySelectorAll('tr[data-remote-reference]').forEach((row) => row.remove());
    const languageRecords = remoteRecords.filter((record) => catalogIncludes(record, 'language'));
    if (languageRecords.length) {
      staticRows.forEach((row) => row.remove());
    } else {
      staticRows.forEach((row) => {
        if (!tbody.contains(row)) tbody.appendChild(row);
      });
    }
    languageRecords.forEach((record) => tbody.appendChild(createCatalogRow(record)));
    currentPage = 1;
    sortRowsChronologically();
    updateStats();
    filterRows();
  };

  const renderEthnicityRows = () => {
    if (!ethnicityTbody) return;
    ethnicityTbody.querySelectorAll('tr[data-remote-reference]').forEach((row) => row.remove());
    const remoteIdentities = new Set(ethnicityRecords.map(recordIdentity));
    ethnicityStaticEntries.forEach(({ row, record }) => {
      if (remoteIdentities.has(recordIdentity(record))) {
        row.remove();
      } else if (!ethnicityTbody.contains(row)) {
        ethnicityTbody.appendChild(row);
      }
    });
    ethnicityRecords.forEach((record) => ethnicityTbody.appendChild(createCatalogRow(record)));
    sortRowsChronologicallyIn(ethnicityTbody);
    filterRows();
    updateActionsColumnVisibility();
    updateSelectionUi();
  };

  const renderUnverifiedRows = () => {
    if (!unverifiedTbody) {
      updateSelectionUi();
      return;
    }
    unverifiedTbody.replaceChildren();
    if (!currentUser || currentRole !== 'admin') {
      updateSelectionUi();
      return;
    }
    unverifiedRecords
      .slice()
      .sort((a, b) => (parseYearStart(a) || Number.POSITIVE_INFINITY) - (parseYearStart(b) || Number.POSITIVE_INFINITY))
      .forEach((record) => unverifiedTbody.appendChild(createCatalogRow(record, { showStatusBadge: false })));
    filterRows();
    updateSelectionUi();
  };

  const loadSupabaseScript = () => new Promise((resolve, reject) => {
    if (window.supabase?.createClient) {
      resolve(window.supabase);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = true;
    script.onload = () => window.supabase?.createClient ? resolve(window.supabase) : reject(new Error('Biblioteca Supabase nu a fost încărcată.'));
    script.onerror = () => reject(new Error('Biblioteca Supabase nu poate fi încărcată.'));
    document.head.appendChild(script);
  });

  const loadRemoteRecords = async () => {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
      .from('language_references')
      .select('id, year_label, year_start, year_end, title, author, language, description, quote, source_type, location, source_url, image_url, catalog_type, status, owner_id')
      .order('year_start', { ascending: true });
    if (error) throw error;
    const records = data || [];
    remoteRecords = records.filter((record) => record.status === 'published');
    ethnicityRecords = remoteRecords.filter((record) => catalogIncludes(record, 'ethnicity'));
    unverifiedRecords = records.filter((record) => record.status !== 'published');
    renderRemoteRows();
    renderEthnicityRows();
    renderUnverifiedRows();
  };

  const loadProfile = async (user) => {
    currentUser = user || null;
    if (!currentUser) {
      setRole('viewer');
      if (authUser) {
        authUser.textContent = '';
        authUser.hidden = true;
      }
      loginButtons.forEach((button) => {
        button.hidden = false;
        button.disabled = false;
      });
      if (logoutButton) logoutButton.hidden = true;
      if (authMessage) authMessage.textContent = 'Vizualizarea este deschisă tuturor. Autentifică-te cu Google sau GitHub pentru a contribui.';
      if (editorPanel) editorPanel.hidden = true;
      renderRemoteRows();
      return;
    }

    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('role, github_login, email, display_name')
      .eq('id', currentUser.id)
      .maybeSingle();
    if (error) throw error;

    setRole(profile?.role || 'viewer');
    loginButtons.forEach((button) => { button.hidden = true; });
    if (logoutButton) logoutButton.hidden = false;
    const displayName = profile?.display_name || profile?.github_login || profile?.email || currentUser.user_metadata?.user_name || currentUser.email || 'contul tău';
    if (authUser) {
      authUser.textContent = displayName;
      authUser.hidden = false;
    }
    if (authMessage) authMessage.textContent = `${displayName} este autentificat(ă) cu rolul ${currentRole}.`;
    renderRemoteRows();
  };

  const signIn = async (provider) => {
    if (!supabaseClient) return;
    loginButtons.forEach((button) => { button.disabled = true; });
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider,
      options: { redirectTo: config.redirectTo || window.location.href }
    });
    if (error) {
      loginButtons.forEach((button) => { button.disabled = false; });
      if (authMessage) authMessage.textContent = `Autentificarea nu a reușit: ${error.message}`;
    }
  };

  const signOut = async () => {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error && authMessage) authMessage.textContent = `Ieșirea nu a reușit: ${error.message}`;
  };

  const formPayload = () => {
    const data = new FormData(editorForm);
    const yearLabel = String(data.get('year_label') || '').trim();
    const years = parseYears(yearLabel);
    const languageValue = String(data.get('language') || '').trim();
    const descriptionValue = String(data.get('description') || '').trim();
    const payload = {
      year_label: yearLabel,
      year_start: years[0] || null,
      year_end: years[1] || years[0] || null,
      title: String(data.get('title') || '').trim(),
      language: languageValue ? languageCode(languageValue, { description: descriptionValue }) : null,
      author: String(data.get('author') || '').trim() || null,
      source_type: String(data.get('source_type') || '').trim() || null,
      catalog_type: catalogTypeValues.has(String(data.get('catalog_type') || '').trim())
        ? String(data.get('catalog_type')).trim()
        : 'language',
      description: descriptionValue || null,
      quote: String(data.get('quote') || '').trim() || null,
      location: String(data.get('location') || '').trim() || null,
      source_url: String(data.get('source_url') || '').trim() || null,
      image_url: String(data.get('image_url') || '').trim() || null
    };
    if (currentRole === 'admin') payload.status = String(data.get('status') || 'pending');
    return payload;
  };

  const saveRecord = async (event) => {
    event.preventDefault();
    if (!supabaseClient || !currentUser || !['editor', 'admin'].includes(currentRole)) {
      setStatus('Autentifică-te cu un cont cu rol de editor.', 'error');
      return;
    }
    const payload = formPayload();
    if (!payload.year_label || !payload.title) {
      setStatus('Completează anul și denumirea lucrării.', 'error');
      return;
    }
    const quoteHasGlotonym = hasGlotonym(payload.quote);
    const contextText = [
      payload.title,
      payload.source_type,
      payload.description
    ].filter(Boolean).join(' ');
    const languageEvidence = hasLanguageAndGlotonym(payload.quote) || hasLanguageAndGlotonym(contextText);
    const ethnicityEvidence = hasEthnicityEvidence(payload.quote) || hasEthnicityEvidence(contextText);
    const languageCatalog = payload.catalog_type === 'language';
    const ethnicityCatalog = payload.catalog_type === 'ethnicity';
    const validQuote = payload.catalog_type === 'both'
      ? languageEvidence && ethnicityEvidence
      : languageCatalog
        ? languageEvidence
        : ethnicityCatalog
          ? ethnicityEvidence
          : false;
    if (!payload.quote || !quoteHasGlotonym || !validQuote) {
      setStatus(quoteRequirement(payload.catalog_type).error, 'error');
      return;
    }

    const submitButton = editorForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    setStatus('Se salvează…');

    let response;
    if (editingId) {
      response = await supabaseClient.from('language_references').update(payload).eq('id', editingId).select().single();
    } else {
      response = await supabaseClient.from('language_references').insert({ ...payload, owner_id: currentUser.id }).select().single();
    }

    if (submitButton) submitButton.disabled = false;
    if (response.error) {
      setStatus(`Nu s-a putut salva referința: ${response.error.message}`, 'error');
      return;
    }
    closeEditor();
    await loadRemoteRecords();
  };

  const deleteSelectedRecords = async () => {
    if (currentRole !== 'admin' || !supabaseClient) return;
    const ids = [...selectedReferenceIds];
    if (!ids.length) return;
    const label = ids.length === 1 ? 'referința selectată' : 'referințele selectate';
    if (!window.confirm(`Ștergi ${label} (${ids.length})?`)) return;
    if (selectionDeleteButton) selectionDeleteButton.disabled = true;
    const { error } = await supabaseClient.from('language_references').delete().in('id', ids);
    if (error) {
      if (authMessage) authMessage.textContent = `Referințele nu au putut fi șterse: ${error.message}`;
      updateSelectionUi();
      return;
    }
    selectedReferenceIds.clear();
    await loadRemoteRecords();
  };

  selectionAll?.addEventListener('change', () => setVisibleSelection(selectionAll.checked));
  selectionClearButton?.addEventListener('click', () => {
    selectedReferenceIds.clear();
    updateSelectionUi();
  });
  selectionDeleteButton?.addEventListener('click', deleteSelectedRecords);
  searchInput?.addEventListener('input', scheduleSearch);
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applySearch();
    }
  });
  centurySelect?.addEventListener('change', () => {
    currentPage = 1;
    filterRows();
  });
  resetButton?.addEventListener('click', () => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
    if (searchInput) searchInput.value = '';
    if (centurySelect) centurySelect.value = '';
    currentPage = 1;
    filterRows();
    searchInput?.focus();
  });
  previousPageButton?.addEventListener('click', () => {
    currentPage = Math.max(1, currentPage - 1);
    filterRows();
  });
  nextPageButton?.addEventListener('click', () => {
    currentPage = Math.min(catalogTotalPages, currentPage + 1);
    filterRows();
  });
  firstPageButton?.addEventListener('click', () => {
    currentPage = 1;
    filterRows();
  });
  lastPageButton?.addEventListener('click', () => {
    currentPage = catalogTotalPages;
    filterRows();
  });
  googleLoginButton?.addEventListener('click', () => signIn('google'));
  githubLoginButton?.addEventListener('click', () => signIn('github'));
  logoutButton?.addEventListener('click', signOut);
  openFormButton?.addEventListener('click', () => openEditor());
  cancelEditButton?.addEventListener('click', closeEditor);
  catalogTypeField?.addEventListener('change', updateQuoteRequirement);
  closeDetailButton?.addEventListener('click', closeDetail);
  detailPreviousButton?.addEventListener('click', () => navigateDetail(-1));
  detailNextButton?.addEventListener('click', () => navigateDetail(1));
  imageInput?.addEventListener('input', renderImagePreview);
  imageInput?.addEventListener('paste', (event) => {
    const item = [...(event.clipboardData?.items || [])].find((entry) => entry.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    event.preventDefault();
    setImageFromFile(file);
  });
  imagePickButton?.addEventListener('click', () => imageFileInput?.click());
  imageFileInput?.addEventListener('change', () => setImageFromFile(imageFileInput.files?.[0]));
  const imageCanvasPoint = (event) => {
    if (!imageCanvas) return null;
    const bounds = imageCanvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    return {
      x: (event.clientX - bounds.left) * (imageCanvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (imageCanvas.height / bounds.height)
    };
  };
  imageCanvas?.addEventListener('pointerdown', (event) => {
    if (imageHasExternalRed || !imageSourceDataUrl) return;
    const point = imageCanvasPoint(event);
    if (!point) return;
    event.preventDefault();
    activeImageStroke = [point];
    imageStrokes.push(activeImageStroke);
    const context = imageCanvas.getContext('2d');
    if (context) drawRedStroke(context, activeImageStroke, imageCanvas.width);
    imageCanvas.setPointerCapture?.(event.pointerId);
  });
  imageCanvas?.addEventListener('pointermove', (event) => {
    if (!activeImageStroke) return;
    const point = imageCanvasPoint(event);
    const previous = activeImageStroke.at(-1);
    if (!point || !previous) return;
    activeImageStroke.push(point);
    const context = imageCanvas.getContext('2d');
    if (context) drawRedStrokeSegment(context, previous, point, imageCanvas.width);
  });
  const finishImageStroke = (event) => {
    if (!activeImageStroke) return;
    activeImageStroke = null;
    imageCanvas?.releasePointerCapture?.(event.pointerId);
    if (imageCanvas && imageInput) {
      imageInput.value = imageCanvas.toDataURL('image/jpeg', 0.88);
      renderImagePreview();
    }
  };
  imageCanvas?.addEventListener('pointerup', finishImageStroke);
  imageCanvas?.addEventListener('pointercancel', finishImageStroke);
  imageUndoButton?.addEventListener('click', async () => {
    if (imageHasExternalRed || !imageStrokes.length) return;
    imageStrokes.pop();
    await paintImageMarkup();
  });
  imageClearButton?.addEventListener('click', async () => {
    if (imageHasExternalRed || !imageStrokes.length) return;
    imageStrokes = [];
    await paintImageMarkup();
  });
  yearInput?.addEventListener('input', () => {
    if (!imageHasExternalRed && imageSourceDataUrl) paintImageMarkup();
  });
  detailBackdrop?.addEventListener('click', closeDetail);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && detailPanel && !detailPanel.hidden) closeDetail();
    if (!detailPanel || detailPanel.hidden) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      navigateDetail(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      navigateDetail(1);
    }
  });
  editorForm?.addEventListener('submit', saveRecord);

  updateQuoteRequirement();
  sortRowsChronologically();
  updateStats();
  filterRows();
  setRole('viewer');

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    loginButtons.forEach((button) => { button.disabled = true; });
    if (authMessage) authMessage.textContent = 'Catalogul public și căutarea funcționează fără cont; autentificarea Google/GitHub nu este încă configurată.';
    return;
  }

  (async () => {
    try {
      const supabase = await loadSupabaseScript();
      supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data: sessionData } = await supabaseClient.auth.getSession();
      await loadProfile(sessionData?.session?.user || null);
      await loadRemoteRecords();
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        loadProfile(session?.user || null).catch((error) => {
          if (authMessage) authMessage.textContent = `Profilul nu a putut fi încărcat: ${error.message}`;
        });
      });
    } catch (error) {
      loginButtons.forEach((button) => { button.disabled = true; });
      if (authMessage) authMessage.textContent = `Catalogul public funcționează, dar autentificarea nu este disponibilă: ${error.message}`;
    }
  })();
})();
