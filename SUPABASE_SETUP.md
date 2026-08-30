# Catalogul moldovenească — configurare gratuită

Această variantă păstrează site-ul pe GitHub Pages și folosește planul gratuit
Supabase pentru autentificare Google/GitHub și referințele adăugate din interfață.

## 1. Creează proiectul Supabase

1. Creează un proiect nou pe [supabase.com](https://supabase.com/).
2. Deschide **SQL Editor** și rulează integral [`supabase/schema.sql`](supabase/schema.sql).
   Dacă proiectul Supabase există deja, rulează în ordine toate migrațiile din
   [`supabase/migrations/`](supabase/migrations/): `20260821_add_catalog_type.sql`,
   `20260821_add_google_auth_profile.sql`, `20260821_add_reference_image_url.sql`,
   `20260824_moderation_workflow.sql`, `20260829_limit_reference_image_size.sql` și
   `20260829_require_ethnicity_source.sql`.
3. Deschide **Project Settings → API** și copiază **Project URL** și cheia publică **anon**.
4. Completează valorile în [`assets/moldoveneasca-config.js`](assets/moldoveneasca-config.js):

   ```js
   window.MOLDOVENEASCA_CONFIG = Object.freeze({
     supabaseUrl: "https://PROJECT-REF.supabase.co",
     supabaseAnonKey: "cheia-publica-anon",
     redirectTo: "https://dudnic.com/moldoveneasca/"
   });
   ```

Cheia `anon` este destinată aplicației din browser. Nu pune niciodată cheia
`service_role` în repository sau în codul paginii.

## 2. Activează autentificarea Google și GitHub

1. În GitHub creează o **OAuth App**.
2. Folosește ca **Authorization callback URL**:

   `https://PROJECT-REF.supabase.co/auth/v1/callback`

3. În Supabase deschide **Authentication → Sign In / Providers → GitHub** și
   introdu Client ID și Client Secret.

Pentru Google:

1. În [Google Cloud Console](https://console.cloud.google.com/) creează un client OAuth de tip **Web application**.
2. La **Authorized redirect URIs** adaugă:

   `https://PROJECT-REF.supabase.co/auth/v1/callback`

3. În Supabase deschide **Authentication → Sign In / Providers → Google**, activează providerul și introdu Client ID și Client Secret.

În **Authentication → URL Configuration** adaugă:

   `https://dudnic.com/moldoveneasca/`

## 3. Promovează administratorul

Autentifică-te o dată cu contul GitHub al administratorului, apoi rulează în
SQL Editor:

```sql
update public.profiles
set role = 'admin'
where github_login = 'NUME_GITHUB_ADMIN';
```

În proiectul configurat acum, contul proprietar are identificatorul GitHub
`sdudnic` (numele afișat poate fi diferit).

Pentru un administrator autentificat cu Google:

```sql
update public.profiles
set role = 'admin'
where email = 'administrator@gmail.com';
```

Pentru un colaborator:

```sql
update public.profiles
set role = 'editor'
where github_login = 'NUME_GITHUB';
```

Conturile Google noi primesc automat rolul `editor`, deci nu trebuie promovate
manual. Referințele adăugate de ele rămân `pending`: proprietarul catalogului le poate
confirma sau infirma. Administratorii pot adăuga și edita, însă nu pot schimba
statutul și nu pot șterge. Utilizatorii non-admin pot propune editări sau
ștergeri, iar interfața îi informează: „Editarea voastră este trimisă
premoderare”. Numai `sdudnic@gmail.com` poate valida, infirma, arhiva, restaura
sau șterge.

## Cum funcționează versiunea actuală

- catalogul public își expune numărul actual prin endpointul `/api/stats`;
- tabelul public poate fi căutat într-un singur câmp după toate coloanele;
- referințele noi și editările folosesc câmpuri separate pentru perioadă, secol,
  lucrare, citat, limbă, autor și sursă;
- o imagine scanată poate fi atașată printr-un URL HTTPS direct sau ca imagine
  codificată; capturile `data:` sunt limitate la aproximativ 1,5 MB și nu sunt
  tratate ca sursă, apărând numai în detaliile referinței;
- editorul poate modifica doar referințele al căror proprietar este;
- editorul nu poate șterge și nu poate schimba statutul unei referințe;
- administratorul poate modifica orice referință, dar numai proprietarul
  catalogului poate publica, arhiva, restaura sau șterge;
- modificările sunt păstrate în `reference_revisions` pentru verificare.
