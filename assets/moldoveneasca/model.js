  const normalize = (value) => (value || '')
    .toLocaleLowerCase('ro-MD')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const parseYears = (value) => [...String(value || '').matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/g)]
    .map((match) => Number(match[1]));

  const numericYear = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const romanToNumber = (value) => {
    const symbols = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    const text = String(value || '').trim().toUpperCase();
    if (!text || !/^[IVXLCDM]+$/.test(text)) return null;
    let total = 0;
    let previous = 0;
    for (let index = text.length - 1; index >= 0; index -= 1) {
      const current = symbols[text[index]];
      if (current < previous) total -= current;
      else total += current;
      previous = current;
    }
    return toRoman(total) === text ? total : null;
  };

  /*
   * O fișă fără an exact folosește în câmpul de catalog numai secolul
   * (de exemplu „XVII” sau „sec. XVII”). Datarea presupusă nu mai este
   * interpretată ca un an publicat; ea rămâne în comentarii.
   */
  const parseCenturyRange = (value) => {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    const match = text.match(/^(?:sec(?:ol)?\.?\s*)?([IVXLCDM]+)(?:\s*[–—-]\s*(?:sec(?:ol)?\.?\s*)?([IVXLCDM]+))?$/iu);
    if (!match) return null;
    const startNumber = romanToNumber(match[1]);
    const endNumber = romanToNumber(match[2] || match[1]);
    if (!startNumber || !endNumber || startNumber > endNumber || startNumber > 30 || endNumber > 30) return null;
    return {
      start: ((startNumber - 1) * 100) + 1,
      end: endNumber * 100,
      startNumber,
      endNumber,
      label: startNumber === endNumber
        ? toRoman(startNumber)
        : `${toRoman(startNumber)}–${toRoman(endNumber)}`
    };
  };

  const yearBoundsFromLabel = (value) => {
    const century = parseCenturyRange(value);
    if (century) return [century.start, century.end];
    const years = parseYears(value);
    return [years[0] || null, years[1] || years[0] || null];
  };

  const hasUncertainYearMarker = (value) => /[?~]|\b(?:aprox(?:imativ)?|circa|cca\.?|în jurul)\b/iu.test(String(value || ''));

  const presumedYearsFromDescription = (value) => {
    const text = String(value || '');
    const marker = text.match(/Datare presupus(?:ă|a)[^:]*:\s*([\s\S]*?)(?:\n\s*\n|$)/iu);
    return parseYears(marker ? marker[1] : '');
  };

  /*
   * „An” este anul textului care conține citatul: ediția, numărul de ziar,
   * manuscrisul sau nota de traducere. Anii documentelor/operelor menționate
   * în acel text rămân în comentarii și nu devin anul referinței.
   */
  const citationYear = (record) => {
    const label = String(record?.year_label || '');
    const editionYear = label.match(/edi[țt]ia\s+(1[0-9]{3}|20[0-9]{2})/iu);
    if (editionYear) return Number(editionYear[1]);

    // Când anul original și anul tălmăcirii sunt despărțite prin „/”,
    // ultimul an este cel al lucrării citate în catalog.
    const years = parseYears(label);
    if (years.length > 1 && /\//.test(label)) return years[years.length - 1];
    if (years.length) return years[0];
    const storedStart = numericYear(record?.year_start);
    if (storedStart !== null) return storedStart;
    const century = parseCenturyRange(label);
    if (century) return century.start;
    return null;
  };

  const citationYearIsExact = (record) => {
    const label = String(record?.year_label || '').trim();
    if (label.match(/edi[țt]ia\s+(1[0-9]{3}|20[0-9]{2})/iu)) return true;
    if (parseCenturyRange(label) || hasUncertainYearMarker(label)) return false;
    const years = parseYears(label);
    if (years.length > 1) return /\//.test(label);
    if (years.length === 1) return true;

    const start = numericYear(record?.year_start);
    const end = numericYear(record?.year_end);
    return start !== null && (end === null || start === end);
  };

  /*
   * Cheia cronologică nu pretinde că este anul publicării. Pentru intervale
   * incerte folosim limita superioară Y; pentru o singură presupunere folosim
   * acel an; iar pentru o fișă care are numai secolul folosim anul 50 al lui.
   */
  const sortYearFromValues = (yearLabel, description = '') => {
    const label = String(yearLabel || '').trim();
    const century = parseCenturyRange(label);
    const years = parseYears(label);
    const presumedYears = presumedYearsFromDescription(description);
    if (presumedYears.length > 1) return presumedYears[presumedYears.length - 1];
    if (presumedYears.length === 1) return presumedYears[0];
    if (century) return century.start + 49;
    if (years.length > 1) return years[years.length - 1];
    if (years.length === 1 && hasUncertainYearMarker(label)) return years[0];
    return years[0] || null;
  };

  const sortYear = (record) => {
    if (citationYearIsExact(record)) return citationYear(record);
    const inferred = sortYearFromValues(record?.year_label, record?.description);
    if (inferred !== null) return inferred;
    const storedStart = numericYear(record?.year_start);
    return storedStart !== null ? storedStart : citationYear(record);
  };

  const parseYearStart = (record) => sortYear(record);

  const publicationYearLabel = (record) => {
    const year = citationYear(record);
    return year && citationYearIsExact(record) ? String(year) : '—';
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
    const directCentury = parseCenturyRange(record?.year_label);
    if (directCentury) return directCentury.label;
    const year = citationYear(record);
    if (!year) return '—';
    if (citationYearIsExact(record)) return toRoman(Math.floor((year - 1) / 100) + 1);

    const bounds = yearBoundsFromLabel(record?.year_label);
    const start = bounds[0] || year;
    const end = bounds[1] || start;
    const startCentury = Math.floor((start - 1) / 100) + 1;
    const endCentury = Math.floor((end - 1) / 100) + 1;
    return startCentury === endCentury
      ? toRoman(startCentury)
      : `${toRoman(startCentury)}–${toRoman(endCentury)}`;
  };

  const extractCellText = (cell) => {
    if (!cell) return '';
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('a').forEach((link) => link.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  };

  const languageNamePattern = /(?:moldoveneas(?:că|ca)|moldovineas(?:că|ca)|moldoveneșt(?:e|i)|moldovenesc|moldav\p{L}*|mołdaw\p{L}*|moldau\p{L}*|moldauisch\p{L}*|moldov\p{L}*|moldeuška|μολδαβ\p{L}*|молдавск\p{L}*|молдовен(?:яск\p{L}*)?)/iu;
  const languageLabelPattern = /(?:\blimb\p{L}*\b|лимб\p{L}*|линд\p{L}*|\blingua\p{L}*\b|\blanguage\p{L}*\b|\bsprache\p{L}*\b|sprach\p{L}*|\blangue\p{L}*\b|\blengua\p{L}*\b|\bjęzyk\p{L}*\b|\bjezyk\p{L}*\b|\bjazyk\p{L}*\b|\byazyk\p{L}*\b|\bjezik\p{L}*\b|\bidioma\p{L}*\b|\bidiom\p{L}*\b|\bvaloda\p{L}*\b|\bkalba\p{L}*\b|\bkeel\p{L}*\b|\bnyelv\p{L}*\b|\bspråk\p{L}*\b|\bsprog\p{L}*\b|\bdil\p{L}*\b|\blisân\p{L}*\b|\blisan\p{L}*\b|γλώσσ\p{L}*|язык\p{L}*|мова\p{L}*|моў\p{L}*|młëtwa|gjuha|tung\p{L}*|\bdicționar\p{L}*\b|\bdicţionar\p{L}*\b|\bcuvîntelnic\p{L}*\b|\bcuvintelnic\p{L}*\b|\bdictionary\p{L}*\b|словар\p{L}*|\bgramatic\p{L}*\b|\bgrammatik\p{L}*\b|граматик\p{L}*|грамматик\p{L}*)/iu;
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

  /*
   * „Limba” din catalog înseamnă limba textului citat, nu limba din care a
   * fost tradusă lucrarea. De aceea formule precum „cu → md” sau „el → md”
   * se afișează aici ca „md”: mențiunea limbii sârbești/grecești/franceze
   * descrie originalul, iar citatul păstrat în fișă este moldovenesc.
   * Excepțiile bilingve sunt stabilite după textul citat, nu după titlu.
   */
  const citationLanguageOverrides = Object.freeze({
    '76fcaa85-b240-4184-a46e-90407633a25f': 'md',
    '1f1f4cee-ade1-4b3c-9b20-a712645535dc': 'md',
    'ba08af66-6d94-4131-a0f5-e20a709fdbc7': 'md',
    'a711f812-cadc-447a-9d60-ea03546f00b5': 'fr',
    '332ecb6c-c1e2-47e1-a335-2b17e1b5a415': 'ru',
    '5bb58598-d8d5-45a1-94f1-baee4ff2bdfe': 'md',
    '5ddc2246-b478-434c-88a8-1c484b57931b': 'md',
    '05611316-3c46-436f-a390-a80719fa3d5e': 'md',
    '84693642-b6be-43e1-9d5a-e4171435a30a': 'ru',
    'd510ccd5-3487-4508-826e-4ff92348d8bf': 'md',
    'b66d4c60-acfa-4c7e-9974-16b2b6f33b27': 'md',
    '108208f3-945a-4dbe-96e5-60b675f76ee5': 'md',
    '34a66e11-3a51-416f-b417-dd1d8b6fb8e8': 'md',
    '377eff5d-9db4-4d07-8fc6-e8c5fb0006ce': 'ru',
    '09e7b256-ab81-4d34-bbaf-600cc094826d': 'md / ru',
    '51f9df80-e604-4377-8636-b7b320e995bd': 'md / ru'
  });

  const citationLanguageCode = (record) => {
    const id = String(record?.id || '');
    if (citationLanguageOverrides[id]) return citationLanguageOverrides[id];

    const raw = String(record?.language || '').trim();
    const normalized = languageCode(raw, record);
    // Orice traseu de traducere care se încheie în moldovenească are un
    // citat moldovenesc; limba sursă rămâne descrisă în titlu/observații.
    if (/(?:→|->)\s*md$/i.test(normalized)) return 'md';
    return normalized;
  };

  const normalizeCitationRecord = (record) => {
    const year = citationYear(record);
    const exactYear = citationYearIsExact(record);
    const language = citationLanguageCode(record);
    return {
      ...record,
      ...(year && exactYear ? { year_label: String(year), year_start: year, year_end: year } : {}),
      ...(language && language !== 'xx' ? { language } : {})
    };
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

