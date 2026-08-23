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

