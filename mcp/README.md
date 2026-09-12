# MCP pentru referințele limbii moldovenești

Serviciul oferă un catalog public de referințe și un flux autentificat de contribuții și premoderare. Codul nu publică automat intrări neverificate și nu păstrează secrete în repository; sesiunea locală este ignorată de Git.

## Ce expune

Integrarea proiectului cu Codex este documentată în
[CODEX.md](CODEX.md), iar configurația activă este în
`../.codex/config.toml`. După repornirea Codex, serverul apare ca
`moldoveneasca_references` în lista MCP.

Public, fără autentificare:

- `GET /health`
- `GET /api/references?q=...&from_year=...&to_year=...&limit=20`
- `GET /api/references/:id`
- `GET /api/stats`
- `GET /openapi.json`

Endpointul MCP public `POST /mcp` este protejat și cere
`Authorization: Bearer <access_token>` Supabase. După autentificare oferă
`initialize`, `tools/list`, `tools/call`, `resources/list` și `resources/read`.

Cu același `Authorization: Bearer <access_token>` Supabase:

- `POST /api/references` adaugă o contribuție;
- `PATCH /api/references/:id` editează sau creează o propunere de editare;
- `DELETE /api/references/:id` șterge numai pentru `sdudnic@gmail.com`, iar pentru ceilalți creează o sugestie;
- `/api/unverified` listează numai intrările cu status `pending`, iar `/api/moderation-requests` listează cererile vizibile contului;
- rutele `*/review` permit decizia numai contului principal.

Instrumentele MCP poartă aceleași reguli: `search_moldoveneasca_references`, `get_moldoveneasca_reference`, `moldoveneasca_reference_statistics`, `cite_moldoveneasca_references`, `add_moldoveneasca_reference`, `edit_moldoveneasca_reference`, `request_moldoveneasca_reference_deletion`, `review_moldoveneasca_reference` și instrumentele de listare/revizuire a moderării.

Pentru dovezile vizuale, formularul catalogului poate încărca o captură reală a
paginii și poate sublinia automat glotonimul găsit exact de OCR. Dacă OCR-ul nu
găsește o singură apariție neambiguă, marcajul rămâne manual. Agenții care scriu
prin MCP transmit `image_url` pentru compatibilitate sau `image_items` pentru o
galerie verificată. Fiecare element din `image_items` are `url` și `description`;
toate imaginile rămân într-o singură referință, iar MCP gestionează referința și
statutul ei, nu fabrică screenshot-uri și nu înlocuiește verificarea sursei originale.

Imaginile `data:` noi sunt reduse în browser la jumătate din lățime și înălțime,
apoi Worker-ul le încarcă în bucketul privat Cloudflare R2 și trimite către
Supabase numai URL-ul HTTPS al obiectului; descrierile rămân în `image_items`.
Pentru migrarea arhivistică, fiecare captură are un obiect `original`, un
`display` la jumătate (cu plafon de 3000 px) și un `thumbnail` de maximum 400 px.
În carusel este folosit numai `display`; `original_url` este păstrat pe același
element pentru zoom/verificare, iar `thumbnail_url` pentru liste sau preload.
MCP/API respinge imaginile care depășesc limita per imagine și limitează galeria
la 12 de imagini. URL-urile HTTPS externe nu sunt descărcate și rămân referințe
externe.
Eliminarea unui element din `image_items` îl scoate din carusel, iar ștergerea
fizică a unui obiect R2 este rezervată proprietarului catalogului.

## Reguli de autorizare

- citirea referințelor `published` este publică;
- orice cont autentificat poate propune o intrare, dar aceasta rămâne `pending` în lista de neverificate;
- un `admin` poate adăuga și edita datele, însă nu schimbă statutul și nu șterge;
- un non-admin poate edita direct numai propria intrare `pending`; editarea unei intrări publicate devine cerere de premoderare;
- numai adresa `sdudnic@gmail.com` poate publica, respinge, arhiva, restaura sau șterge;
- mesajul standard pentru contribuțiile nevalidate este: „Editarea voastră este trimisă premoderare”.

O referință publicată poate fi readusă de proprietarul catalogului în statutul
`pending` printr-o editare MCP cu `status: "pending"`. Se aplică această măsură
când glotonimul este găsit doar în comentariu, metadată sau într-o citare
ulterioară; anul trebuie să fie al sursei care conține citatul, iar pentru o
sursă nedatată se folosește `year_label: "necunoscut"` cu intervale nule.

Regulile sunt dublate în codul serviciului și în RLS/funcția `public.review_reference_request` din Supabase. Interfața nu este considerată o barieră de securitate.

## Instalare și rulare locală

Din rădăcina proiectului:

```powershell
Copy-Item mcp\.env.example mcp\.env
cd mcp
npm run check
npm test
npm start
```

Node nu are nevoie de pachete externe pentru acest MVP. Scripturile pornesc serverul cu
`--env-file=.env`, iar `.env` este local și ignorat de Git. Pentru contul tău GitHub,
rulează autentificarea OAuth:

```powershell
cd mcp
npm run auth:login
npm start
```

Login-ul deschide o singură dată Chrome extern pentru GitHub, folosește PKCE,
nu cere parola Supabase și păstrează sesiunea locală în `.moldoveneasca-session.json`.
Refresh tokenul este reînnoit automat când MCP-ul pornește după expirarea access tokenului.
Înainte de prima rulare, adaugă `http://127.0.0.1:54321/callback` în Supabase,
la Authentication → URL Configuration → Redirect URLs.
Pentru deconectare locală: `npm run auth:logout`.

Dacă preferi să gestionezi singur JWT-ul, poți completa `MOLDOVENEASCA_SUPABASE_ACCESS_TOKEN` în `.env`;
acesta are prioritate față de sesiunea locală.

Înainte de contribuții, rulează în Supabase SQL Editor:

1. `supabase/schema.sql` pentru instalarea completă; sau
2. `supabase/migrations/20260824_moderation_workflow.sql` peste schema existentă; și
3. `supabase/migrations/20260911_add_reference_image_items.sql` pentru galeria
   de imagini a unei singure referințe.

Verifică apoi că profilul `sdudnic@gmail.com` există și are rolul `admin`. Migrarea îl promovează automat după ce contul există.

## Test rapid REST

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
Invoke-RestMethod 'http://127.0.0.1:8787/api/references?q=limba%20moldoveneasca&limit=5'
```

Pentru MCP:

```powershell
$body = @{ jsonrpc = '2.0'; id = 1; method = 'tools/list' } | ConvertTo-Json -Depth 8
Invoke-RestMethod http://127.0.0.1:8787/mcp -Method Post -ContentType 'application/json' -Body $body
```

Un client local MCP poate porni `node --env-file=mcp/.env mcp/server.mjs --stdio`. Pentru un client HTTP,
endpointul este `/mcp`; pentru mutări trimite tokenul Supabase al utilizatorului în headerul `Authorization`.

## Publicare

Worker-ul este publicat la:

`https://moldoveneasca-mcp.dudnic-moldoveneasca-mcp.workers.dev`

Endpointul REST publică numai referințele `published`. Endpointul MCP cere un
token Supabase valid în `Authorization: Bearer ...`; operațiile de contribuție
și moderare aplică aceleași verificări. Pagina catalogului folosește acest API
pentru adăugări, editări și sugestii de ștergere.

Pentru o redeployare:

```powershell
cd mcp
npm run check
npm test
npm run deploy
```

Secretele Worker-ului sunt gestionate separat prin `wrangler secret put` și nu
se păstrează în repository. Înainte ca primul utilizator să contribuie, rulează
[supabase/migrations/20260824_moderation_workflow.sql](../supabase/migrations/20260824_moderation_workflow.sql)
și [supabase/migrations/20260911_add_reference_image_items.sql](../supabase/migrations/20260911_add_reference_image_items.sql)
în Supabase SQL Editor peste schema existentă. Fără prima migrare, citirea
publică funcționează, dar propunerile de editare/ștergere nu pot fi înregistrate;
fără a doua, galeriile cu mai multe imagini nu pot fi salvate.

## Cloudflare R2 pentru imaginile catalogului

R2 este storage de obiecte, nu bază de date. Bucketul este privat; Worker-ul
livrează imaginile prin `GET /api/images/{key}`, iar browserul nu are nevoie de
o cheie R2. După activarea R2 în dashboard-ul Cloudflare, din directorul `mcp`:

```powershell
npx wrangler@latest r2 bucket create moldoveneasca-images
npm run dry-run
npm run deploy
```

Planul afișează 10 GB/lună, 1 milion de operații Class A și 10 milioane Class B
incluse. Depășirea limitelor sau folosirea altui storage class poate genera
costuri; monitorizează consumul în dashboard. Binding-ul se află în
`mcp/wrangler.jsonc` și nu conține secrete.
