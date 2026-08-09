/*
 * One-off data audit for the Supabase catalogue.
 *
 * Run this source in the authenticated catalogue page. The runner should
 * replace `const APPLY = false` with `const APPLY = true` only after the
 * preview has been inspected. The access token stays in the page's
 * Supabase localStorage session and is never written to this file.
 */
(async () => {
  const APPLY = false;
  const config = window.MOLDOVENEASCA_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
  const anonKey = config.supabaseAnonKey;
  if (!supabaseUrl || !anonKey) throw new Error('Configurația Supabase lipsește.');

  const apiHeaders = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`
  };
  const query = new URL(`${supabaseUrl}/rest/v1/language_references`);
  query.searchParams.set('select', 'id,year_label,title,author,language,source_url');
  query.searchParams.set('order', 'year_start.asc');
  const response = await fetch(query, { headers: apiHeaders });
  if (!response.ok) throw new Error(`Citirea catalogului a eșuat: ${response.status}`);
  const records = await response.json();

  const uncertainRules = [
    /Lexiconul Moldo-Valah/i,
    /Lexiconul moldovenesc/i,
    /Gramatica limbei moldoven/i,
    /Istoria bisericească/i,
    /Alfabetul slavo-moldovenesc/i,
    /Letopisețul Cantacuzinesc/i,
    /Săptămâna/i,
    /Carte de învățătură la români/i,
    /Nicolae Milescu\s*-\s*"Descrierea Moldovei"/i,
    /Cartea românească de învățătură.*Cantemir/i,
    /Elementa linguae Moldo-Wallachicae/i,
    /Dictionar grecesc-slavon-moldovenesc/i,
    /Codicele Moldovei/i,
    /Gramatica românească/i,
    /Gramatica Moldo-Valahica/i,
    /Lexiconul slavo-român/i,
    /Constituția Imperială/i,
    /Grigore III Ghica/i,
    /Istoricul Moldovei/i,
    /Dicționarul limbii moldovenești/i,
    /Moldauische Sprasche/i,
    /Limba moldovenească și limba valahă/i,
    /Relații de călătorie.*Johann Georg Kohl/i,
    /Istoria Moldovei.*Alexandru D\. Xenopol/i,
    /Istoria Moldovei și a Țării Românești/i,
    /Analele Acedemei/i,
    /Recensămînt 2014/i
  ];

  const hasUncertainTitle = (record) => {
    const text = String(record.title || '');
    return uncertainRules.some((rule) => rule.test(text))
      || (/Citatul:/i.test(text) && !String(record.source_url || '').trim());
  };

  const authorRules = [
    [/Grigore III Ghica/i, 'Grigore III Ghica (atribuire imposibilă pentru anul 1816)'],
    [/Dimitrie Țichindeal/i, 'Dimitrie Țichindeal (atribuire neverificată)'],
    [/Vasile Lupu/i, 'Vasile Lupu (atribuire neverificată)'],
    [/Petru Maior/i, 'Petru Maior (atribuire neverificată)'],
    [/I\.\s*L\.\s*Pu[șş]chin/i, 'I. L. Pușchin (neverificat)'],
    [/Mihail Maksimovici/i, 'Mihail Maksimovici (neverificat)'],
    [/Dimitrie Cantemir/i, 'Dimitrie Cantemir'],
    [/D\.?\s*Cantemir/i, 'Dimitrie Cantemir'],
    [/Nicolae Milescu/i, 'Nicolae Milescu'],
    [/Grigore Ureche/i, 'Grigore Ureche'],
    [/Miron Costin/i, 'Miron Costin'],
    [/Radu Greceanu/i, 'Radu Greceanu'],
    [/Ion Neculce|Ioan Neculce/i, 'Ioan Neculce'],
    [/Nicolae Costin/i, 'Nicolae Costin'],
    [/Johann Thomas Freigius/i, 'Johann Thomas Freigius'],
    [/Primož Trubar/i, 'Primož Trubar'],
    [/Petru Cl[ăa]n[ăa]u/i, 'Petru Clănău'],
    [/Nicolas Pfluger/i, 'Nicolas Pfluger'],
    [/Angelo Rocca/i, 'Angelo Rocca'],
    [/J\.-A\.?\s*Thuanus|Jacques(?:-Auguste)? de Thou|Jacques Thuanus/i, 'Jacques-Auguste de Thou'],
    [/Georgius Murner/i, 'Georgius Murner'],
    [/I\.\s*Alschtedt/i, 'I. Alschtedt'],
    [/Jan Mężykowksi/i, 'Jan Mężykowksi'],
    [/Şerban Cantacuzino|Șerban Cantacuzino/i, 'Șerban Cantacuzino'],
    [/Varlaam/i, 'Varlaam'],
    [/Aron Vodă/i, 'Aron Vodă'],
    [/Martinus? Szent-Ivany/i, 'Martinus Szent-Ivany'],
    [/Schurzfleischius/i, 'Conrad Samuel Schurzfleischius'],
    [/Silvestro Amelio/i, 'Silvestro Amelio'],
    [/Antioh Cantemir/i, 'Antioh Cantemir'],
    [/Onufrie/i, 'Onufrie'],
    [/Jean-Louis Carra/i, 'Jean-Louis Carra'],
    [/Peyssonnel/i, 'Charles de Peyssonnel'],
    [/Mihai Strilbițki/i, 'Mihai Strilbițki'],
    [/Mihai Strilbițchi/i, 'Mihai Strilbițchi'],
    [/Macarie/i, 'Macarie'],
    [/Toma II logofăt/i, 'Toma II logofăt'],
    [/d[’']Anville/i, 'Jean-Baptiste Bourguignon d’Anville'],
    [/Chaudon|Delandine/i, 'Louis-Mayeul Chaudon și Antoine-François Delandine'],
    [/Pr[eé]vost/i, 'Abatele Prévost'],
    [/Beldeman|Beldiman/i, 'Aleco Beldiman'],
    [/Baculard d.?[Aa]rnaud/i, 'Baculard d’Arnaud'],
    [/Fotis Calafati/i, 'Fotis Calafati'],
    [/Florian/i, 'Florian'],
    [/Constantin Stamate/i, 'Constantin Stamate'],
    [/Pav[ăa]l Debr[iî]d|Paval Debrit/i, 'Pavăl Debrit'],
    [/Ion Stamate/i, 'Ion Stamate'],
    [/Costachi Bor[șs]/i, 'Costachi Borș'],
    [/Cristian-Albert R[üu]ckert/i, 'Cristian-Albert Rückert'],
    [/Gavriil Bănulescu-Bodoni/i, 'Gavriil Bănulescu-Bodoni'],
    [/Vasilie V[âî]rnav|Vasile V[îi]mav/i, 'Vasilie Vârnav'],
    [/J\.\s*G\.\s*Zucker/i, 'J. G. Zucker'],
    [/Iacob Hâncu/i, 'Iacob Hâncu'],
    [/Ion Budai-Deleanu/i, 'Ion Budai-Deleanu (atribuire/data neverificată)'],
    [/Johann Georg Kohl/i, 'Johann Georg Kohl'],
    [/Theoktist Blazewicz/i, 'Theoktist Blazewicz'],
    [/Ioan Sîrbu/i, 'Ioan Sîrbu'],
    [/I\.\s*Doncev/i, 'I. Doncev'],
    [/Toader Școleriu/i, 'Toader Școleriu'],
    [/Elena Didia Odorica Sevastos/i, 'Elena Didia Odorica Sevastos'],
    [/Alexandru D\.\s*Xenopol/i, 'Alexandru D. Xenopol'],
    [/William R\.\s*Shepherd/i, 'William R. Shepherd'],
    [/Gheorge Codreanu/i, 'Gheorge Codreanu'],
    [/Nicolae Iorga/i, 'Nicolae Iorga'],
    [/Ion Dumitriu-Snagov/i, 'Ion Dumitriu-Snagov'],
    [/Mihai Eminescu/i, 'Mihai Eminescu'],
    [/Nils Nystrom/i, 'Nils Nystrom'],
    [/Amfilohie Hotiniul/i, 'Amfilohie Hotiniul'],
    [/Gheorghe Dimitriu/i, 'Gheorghe Dimitriu'],
    [/Pavel Macarescu/i, 'Pavel Macarescu'],
    [/Ion G\.\s*Pelivan/i, 'Ion G. Pelivan'],
    [/Costachi Grigoriu/i, 'Costachi Grigoriu'],
    [/Ecaterina a II-a|Catherine II/i, 'Ecaterina a II-a'],
    [/Gurie|Гурие/i, 'Gurie Grosu'],
    [/F\.\s*Schneidawind/i, 'F. Schneidawind'],
    [/Despot Vodă/i, 'Despot Vodă'],
    [/Al\.\s*Moruzi/i, 'Alexandru Moruzi'],
    [/Petru Șchiopul|Пётр Хромой/i, 'Petru Șchiopul'],
    [/Parlamentul R\.Moldova|RSS Moldovenești/i, 'Parlamentul RSS Moldovenești'],
    [/Constituția Republicii Moldova/i, 'Parlamentul Republicii Moldova'],
    [/Spicuitorul.*soțietate de literați/i, 'o societate de literați']
  ];

  const getAuthor = (record) => {
    const text = String(record.title || '').replace(/\s+/g, ' ').trim();
    const explicit = text.match(/Autorul:\s*([^,;.]+)/i);
    if (explicit) return explicit[1].trim();
    if (/Lexiconul Moldo-Valah|Istoria bisericească/i.test(text) && /Grigore Ureche/i.test(text)) return 'Grigore Ureche (atribuire neverificată)';
    if (/Lexiconul moldovenesc/i.test(text) && /Miron Costin/i.test(text)) return 'Miron Costin (atribuire neverificată)';
    if (/Alfabetul slavo-moldovenesc|Săptămâna/i.test(text) && /Varlaam/i.test(text)) return 'Varlaam (atribuire neverificată)';
    if (/Letopisețul Cantacuzinesc/i.test(text) && /Neculce/i.test(text)) return 'Ioan Neculce (atribuire neverificată)';
    if (/Carte de învățătură la români|Cartea românească de învățătură|Elementa linguae Moldo-Wallachicae/i.test(text) && /Cantemir/i.test(text)) return 'Dimitrie Cantemir (atribuire neverificată)';
    if (/Nicolae Milescu.*Descrierea Moldovei|Dictionar grecesc-slavon-moldovenesc/i.test(text)) return 'Nicolae Milescu (atribuire neverificată)';
    const match = authorRules.find(([rule]) => rule.test(text));
    return match ? match[1] : 'necunoscut';
  };

  const getLanguage = (record) => {
    const text = String(record.title || '').replace(/\s+/g, ' ').trim();
    if (/^(Le |La |L['’]|Journal |Gazette |Mercure de France|Paris-presse|Le Monde|La Presse|La Croix|Le Temps|La Dépêche|L'Humanité|Le Siècle|La Petite Gironde|La Libre Parole|Le Drapeau blanc|Le Constitutionnel|La France chrétienne|La Quotidienne|Journal des débats|Gazette nationale|Gazette de France)/i.test(text)) return 'franceză';
    if (/Die Propaganda|Moldauische|Moldauischen|Theoretisch-praktische|Schneidawind|Johann Georg Kohl|J\.\s*G\.\s*Zucker|Goethe/i.test(text)) return 'germană';
    if (/Histoire universelle|L['’]idiome moldave|Livre historique/i.test(text)) return 'franceză';
    if (/aus den slavonischen in die moldavische|limba nemțească|limba nemt|limba germană/i.test(text)) return 'germană → moldovenească';
    if (/tălmăcit.*limba fran|traduc.*limba fran|franțuz|franțez|franțesc|fran[cț]uz/i.test(text)) return 'franceză → moldovenească';
    if (/tălmăcit.*limba gre|de pe grecească|grecească.*moldov|greacă.*moldov/i.test(text)) return 'greacă → moldovenească';
    if (/tălmăcit.*limba rus|de pe cea rus|rusească.*moldov|russască.*moldov/i.test(text)) return 'rusă → moldovenească';
    if (/din slavonă|limba slavon|slovenesc|ispisoc sârbesc|sârbesc/i.test(text)) return 'slavonă → moldovenească';
    if (/grecesc-slavon-moldovenesc-latin/i.test(text)) return 'greacă / slavonă / moldovenească / latină';
    if (/Breve vocabulario italiano|italian|Metastasio/i.test(text)) return 'italiană → moldovenească';
    if (/Acta Tomiciana|Lingua Moldavorum|lingua moldav|Descriptio|Elementa linguae|Alphabetum|Dictionarium Valachico|Vocabula cum|Thesaurus polono|Dissertatio|Opera historica|Chronologia|Bibliotheca Münteriana/i.test(text)) return 'latină';
    if (/Nicolas Pfluger|Wittemberg|germană/i.test(text)) return 'germană / moldovenească';
    if (/russ|rusă|rusască|ruseș|rusesc|Russian|молдавск|Историческое|slavo-român/i.test(text)) return /moldov|молдав/i.test(text) ? 'rusă / moldovenească' : 'rusă';
    if (/franceză|franț|fran[cț]ez/i.test(text)) return /moldov/i.test(text) ? 'franceză / moldovenească' : 'franceză';
    if (/grecească|grecesc|greacă|limba grece|grecește/i.test(text)) return /moldov/i.test(text) ? 'greacă / moldovenească' : 'greacă';
    if (/moldov|moldav|moldovin|moldoveneș|moldoven|молдов|moldauisch|limba noastră|Macarie|Slujba|Mineiul de obște|Învățătură Părintească|Spicuitorul moldo/i.test(text)) return 'moldovenească';
    if (/Paris,\s*\d{1,2}\s+[a-ză]+\s+\d{4}/i.test(text)) return 'franceză';
    return 'necunoscută';
  };

  const updates = records.map((record) => {
    const uncertain = hasUncertainTitle(record);
    const oldTitle = String(record.title || '').trim();
    const title = uncertain && !/^\s*\*\?\s*/.test(oldTitle) ? `*? ${oldTitle}` : oldTitle;
    return {
      id: record.id,
      year: record.year_label,
      title,
      language: String(record.language || '').trim() || getLanguage(record),
      author: String(record.author || '').trim() || getAuthor(record),
      uncertain
    };
  });

  if (APPLY) {
    const session = Object.values(localStorage).map((value) => {
      try { return JSON.parse(value); } catch { return null; }
    }).find((value) => value && value.access_token);
    if (!session?.access_token) throw new Error('Sesiunea GitHub/Supabase nu conține access token.');

    for (let offset = 0; offset < updates.length; offset += 8) {
      const batch = updates.slice(offset, offset + 8);
      await Promise.all(batch.map(async (update) => {
        const target = `${supabaseUrl}/rest/v1/language_references?id=eq.${encodeURIComponent(update.id)}`;
        const patch = await fetch(target, {
          method: 'PATCH',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({
            title: update.title,
            language: update.language,
            author: update.author
          })
        });
        if (!patch.ok) throw new Error(`Actualizarea ${update.id} a eșuat: ${patch.status}`);
      }));
    }
  }

  const languageCounts = Object.fromEntries(Object.entries(
    updates.reduce((counts, update) => {
      counts[update.language] = (counts[update.language] || 0) + 1;
      return counts;
    }, {})
  ).sort(([, a], [, b]) => b - a));

  return {
    apply: APPLY,
    total: updates.length,
    markedUncertain: updates.filter((update) => update.uncertain).length,
    missingAuthorAfterAudit: updates.filter((update) => update.author === 'necunoscut').length,
    missingLanguageAfterAudit: updates.filter((update) => update.language === 'necunoscută').length,
    unknownAuthors: updates.filter((update) => update.author === 'necunoscut').map(({ id, year, title }) => ({ id, year, title })),
    unknownLanguages: updates.filter((update) => update.language === 'necunoscută').map(({ id, year, title }) => ({ id, year, title })),
    languageCounts,
    marked: updates.filter((update) => update.uncertain).map(({ id, year, title, author, language }) => ({ id, year, title, author, language }))
  };
})();
