# Integrarea MCP-ului cu Codex

Acest proiect include configurația `.codex/config.toml`, care conectează Codex la
serverul MCP local prin transport **STDIO**. Configurația este limitată la
proiectul trusted `dudnic.com`, ca să nu pornească serverul în alte proiecte.

## Ce devine disponibil în Codex

Serverul se numește `moldoveneasca_references` și expune:

| Instrument | Scop |
| --- | --- |
| `search_moldoveneasca_references` | caută referințe publicate după text și filtre |
| `get_moldoveneasca_reference` | citește o referință după ID |
| `moldoveneasca_reference_statistics` | statistici despre catalog |
| `cite_moldoveneasca_references` | generează citări Markdown sau text |
| `list_moldoveneasca_unverified` | vede intrările cu status `pending` ale contului |
| `add_moldoveneasca_reference` | adaugă o referință |
| `edit_moldoveneasca_reference` | editează sau trimite propunere la premoderare |
| `request_moldoveneasca_reference_deletion` | propune ștergerea unei referințe |
| `review_moldoveneasca_reference` | publică, respinge, arhivează sau restaurează |
| `review_moldoveneasca_moderation_request` | aprobă sau respinge o propunere |
| `list_moldoveneasca_moderation_requests` | listează cererile de moderare |

## Permisiuni

- citirea referințelor publicate folosește cheia publică Supabase;
- contribuțiile și moderarea folosesc sesiunea Supabase locală sau, ca fallback,
  `MOLDOVENEASCA_SUPABASE_ACCESS_TOKEN`;
- orice utilizator autentificat poate propune contribuții;
- administratorii pot adăuga și edita, dar nu pot schimba statutul sau șterge;
- numai `sdudnic@gmail.com` poate confirma, infirma, arhiva, restaura sau șterge;
- Codex folosește `default_tools_approval_mode = "writes"`, astfel încât mutările
  MCP cer aprobare înainte de execuție.

Metoda recomandată nu cere copierea tokenului în chat sau în configurația Codex.
Pentru contul conectat prin GitHub, din directorul `mcp` rulează autentificarea OAuth:

```powershell
npm run auth:login
```

Se deschide Chrome extern, unde confirmi contul GitHub. Sesiunea locală este în
`.moldoveneasca-session.json`, fișier ignorat de Git. Serverul MCP citește și
reînnoiește automat sesiunea la nevoie. Fără sesiune, instrumentele de citire
funcționează, iar instrumentele de contribuție/moderare răspund controlat cu
`auth_required`.

Pentru callback-ul local, adaugă în Supabase Authentication → URL Configuration →
Redirect URLs: `http://127.0.0.1:54321/callback`.

Alternativ, pentru un token obținut separat, se poate completa
`MOLDOVENEASCA_SUPABASE_ACCESS_TOKEN` în `mcp/.env`. Nu pune parola în `.env`, Git
sau mesaje.

## Activare în Codex

1. Închide și repornește Codex sau repornește extensia IDE.
2. Într-un task din acest proiect rulează `/mcp` sau verifică lista MCP.
3. Serverul trebuie să apară ca `moldoveneasca_references`.
4. Testează cu o căutare, de exemplu: „caută referințe despre termenul
   moldovenească între anii 1600 și 1900”.

Codex folosește configurația proiectului numai dacă proiectul este trusted.
Configurația globală este în `~/.codex/config.toml`; configurația proiectului
este preferată aici pentru a păstra integrarea izolată de alte proiecte.

## Conectare la Worker-ul public

Pentru un alt client Codex sau o altă instanță, se poate folosi transportul
Streamable HTTP:

```toml
[mcp_servers.moldoveneasca_references_remote]
url = "https://moldoveneasca-mcp.dudnic-moldoveneasca-mcp.workers.dev/mcp"
bearer_token_env_var = "MOLDOVENEASCA_SUPABASE_ACCESS_TOKEN"
startup_timeout_sec = 30
tool_timeout_sec = 90
default_tools_approval_mode = "writes"
```

Worker-ul public oferă și REST:

- `GET /health`
- `GET /openapi.json`
- `GET /api/references`
- `GET /api/references/:id`
- `GET /api/stats`
- rute autentificate pentru contribuții și moderare

## Verificare locală

```powershell
cd mcp
npm run check
npm test
```

Protocolul MCP răspunde la `initialize`, `tools/list`, `tools/call`,
`resources/list` și `resources/read`. Serverul trimite și câmpul MCP
`instructions`, cu regulile de premoderare aplicabile tuturor instrumentelor.

## Runbook pentru agenți

Pentru operații de catalog, agentul trebuie să folosească MCP-ul și să trateze
fiecare lot ca pe o operație idempotentă:

1. rulează statisticile și caută catalogul public paginat;
2. dedupează după URL canonic, apoi după titlu normalizat și an;
3. adaugă numai rândurile care nu există, cu `add_moldoveneasca_reference`;
4. folosește `edit_moldoveneasca_reference` pentru actualizări, nu inserări
   repetate;
5. confirmă intrările verificate cu `review_moldoveneasca_reference`;
6. rulează din nou statisticile și verificarea de duplicate după lot.

Pentru o referință publicată care se dovedește a avea citatul numai într-o
metadată, într-un comentariu sau într-o sursă ulterioară, proprietarul catalogului
o mută înapoi la `pending` prin `edit_moldoveneasca_reference`, cu
`changes: { status: "pending" }` și motivul reverificării. Anul trebuie corectat
la anul sursei care conține citatul; dacă acel an nu este identificat, se păstrează
`year_label: "necunoscut"` și intervale nule. Nu se publică citatul ulterior ca
și cum ar proveni din manuscrisul sau opera descrisă.

### Captura paginii și sublinierea glotonimului

Pentru referințele noi, agentul atașează `image_url` sau `image_items` numai dacă
are captura reală a paginii și poate verifica termenul în limba sursei.
`image_items` este o listă de obiecte `{ url, description }` (cu opționalele
`original_url` și `thumbnail_url` pentru variantele R2), astfel încât mai
multe pagini ale aceleiași opere rămân într-o singură referință și într-un singur
blade; descrierea se schimbă împreună cu imaginea în carusel. Formularul web oferă
OCR la cerere prin butonul „Subliniază automat din OCR”; OCR-ul trebuie să
găsească exact glotonimul din citat, iar agentul verifică previzualizarea înainte
de publicare. Pentru surse cu IIIF/ALTO, coordonatele din OCR pot fi folosite
pentru a desena o linie roșie pe imaginea originală.

Pentru salvarea efectivă a mai multor imagini, schema Supabase trebuie să includă
și migrarea `supabase/migrations/20260911_add_reference_image_items.sql`; până
atunci, citirea imaginilor legacy cu `image_url` rămâne compatibilă, dar galeria nu
se poate persista. În producție, Worker-ul transformă orice `data:` primit de
interfață sau de MCP într-un obiect din binding-ul privat R2
`MOLDOVENEASCA_IMAGES`; în Supabase se scriu numai URL-ul HTTPS și descrierea.
Endpointul autentificat `POST /api/images` acceptă o singură imagine binară, iar
`DELETE /api/images/{key}` este rezervat proprietarului catalogului pentru
curățare explicită. Scoaterea din carusel se face prin editarea `image_items`,
fără ștergere automată a obiectului, deoarece același obiect poate fi referit de
mai multe fișe.

Capturile `data:` noi sunt reduse la jumătate din lățime și înălțime înainte de
încărcarea în R2. Migrarea arhivistică păstrează originalul separat, un display
cu plafon de 3000 px și un thumbnail de maximum 400 px; în Supabase se păstrează
URL-urile HTTPS și descrierea, nu Base64. Nu încărca imagini mai mari în catalog; URL-urile HTTPS
externe pot fi păstrate ca referință fără a descărca imaginea în R2 sau în baza de date.

Dacă nu există coordonate sau imaginea nu poate fi verificată, `image_url` și
`image_items` rămân necompletate, iar intrarea poate fi publicată numai cu dovada bibliografică obișnuită;
nu se fabrică screenshot-uri și nu se subliniază un text recreat. La adăugare,
transmite imaginea verificată în `add_moldoveneasca_reference`, iar la o intrare
existentă folosește `edit_moldoveneasca_reference`. După lot, folosește
`get_moldoveneasca_reference` sau căutarea pentru a confirma prezența imaginii.

Prioritatea de cercetare este: până în 1917, 1918–1939, bibliografii naționale,
apoi perioadele ulterioare. Un an necunoscut rămâne `year_label: "necunoscut"`
cu `year_start` și `year_end` nule. Agentul nu transformă un an al unui citat
în anul ediției fără o dovadă bibliografică.

Instrumentele de scriere cer o sesiune Supabase validă. Un răspuns
`auth_required` este un blocaj de autentificare, nu un motiv pentru a folosi REST
direct sau cheia anon. După `npm run auth:login` și repornirea Codex, lotul se
reia în siguranță deoarece deduplicarea se face înainte de fiecare adăugare.
