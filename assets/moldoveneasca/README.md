# Catalogul „moldovenească”

Fișierele din acest director sunt parțiale JavaScript ordonate de
`assets/moldoveneasca.js`. Jekyll le concatenează într-un singur IIFE pentru a
păstra compatibilitatea paginii fără bundler.

Responsabilități:

- `bootstrap.js`: selectarea DOM-ului și starea aplicației;
- `pagination.js`: controlul reutilizabil de paginare;
- `model.js`: normalizarea datelor și regulile de domeniu;
- `images.js`: pregătirea, marcarea și încărcarea imaginilor;
- `records.js`: conversia și afișarea semantică a înregistrărilor;
- `row-metadata.js`: metadatele căutabile ale rândurilor;
- `validation.js`: validarea citatelor și a tipului de catalog;
- `details.js`: blade-ul de detalii;
- `buttons.js`: pictogramele și configurarea butoanelor;
- `rows.js`: construirea rândurilor gridului;
- `grid.js`: sortarea și opțiunile gridului;
- `search.js`: căutarea, selecția și statisticile;
- `editor.js`: formularul de editare;
- `rendering.js`: sincronizarea datelor cu cele trei griduri;
- `repository.js`: Supabase, autentificarea și persistența;
- `events.js`: conectarea evenimentelor și inițializarea aplicației.

Ordinea parțialelor din loader este intenționată deoarece toate contribuie la
aceeași închidere lexicală. Fiecare fișier trebuie să rămână sub 500 de linii și
să conțină o singură responsabilitate dominantă.
