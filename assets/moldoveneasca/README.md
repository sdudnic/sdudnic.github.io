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
- `share.js`: linkul partajabil și deschiderea directă a unei referințe;
- `buttons.js`: pictogramele și configurarea butoanelor;
- `rows.js`: construirea rândurilor gridului;
- `grid.js`: sortarea și opțiunile gridului;
- `search.js`: căutarea, selecția și statisticile;
- `editor.js`: formularul de editare;
- `rendering.js`: sincronizarea datelor cu cele trei griduri;
- `repository.js`: Supabase, autentificarea și persistența; imaginile `data:` sunt
  transformate de Worker în URL-uri Cloudflare R2 înainte de scriere;
- `events.js`: conectarea evenimentelor și inițializarea aplicației.

Ordinea parțialelor din loader este intenționată deoarece toate contribuie la
aceeași închidere lexicală. Fiecare fișier trebuie să rămână sub 500 de linii și
să conțină o singură responsabilitate dominantă.

Prima afișare cere 20 de referințe cu ordonare stabilă după an și ID.
Paginarea și sortarea pe server reutilizează tabelele secundare. Căutarea
încarcă toate metadatele în loturi explicite de 100; loturile depășite de o
cerere nouă sunt oprite. Imaginile sunt încărcate la cerere, cu deduplicarea
cererilor simultane și un cache de maximum opt referințe. O referință poate
avea `image_items`, o listă de `{ url, description }`; o singură imagine
rămâne afișare simplă, iar două sau mai multe formează un carusel compact cu
descrierea lipită de slide-ul ei.

Linkurile `?referinta=<id>` pot deschide o referință din orice pagină, printr-o
cerere după ID. Referințele neverificate nu primesc link de distribuire.
Anul `necunoscut` păstrează ambele limite de an nule. Un eșec la încărcarea
imaginii existente blochează deschiderea editorului pentru a evita pierderea ei.

Verificări: `npm --prefix mcp run check` și `npm --prefix mcp test` (include
testele frontend și verificarea sintaxei bundle-ului în ordinea Jekyll).
