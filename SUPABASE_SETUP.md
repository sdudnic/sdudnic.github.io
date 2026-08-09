# Catalogul moldovenească — configurare gratuită

Această variantă păstrează site-ul pe GitHub Pages și folosește planul gratuit
Supabase pentru autentificare GitHub și referințele adăugate din interfață.

## 1. Creează proiectul Supabase

1. Creează un proiect nou pe [supabase.com](https://supabase.com/).
2. Deschide **SQL Editor** și rulează integral [`supabase/schema.sql`](supabase/schema.sql).
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

## 2. Activează autentificarea GitHub

1. În GitHub creează o **OAuth App**.
2. Folosește ca **Authorization callback URL**:

   `https://PROJECT-REF.supabase.co/auth/v1/callback`

3. În Supabase deschide **Authentication → Sign In / Providers → GitHub** și
   introdu Client ID și Client Secret.
4. În **Authentication → URL Configuration** adaugă:

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

Pentru un colaborator:

```sql
update public.profiles
set role = 'editor'
where github_login = 'NUME_GITHUB';
```

Conturile noi rămân `viewer` până când administratorul le promovează.

## Cum funcționează versiunea actuală

- cele 197 de referințe istorice existente sunt importate în Supabase;
- tabelul public poate fi căutat într-un singur câmp după toate coloanele;
- referințele noi și editările folosesc câmpuri separate pentru perioadă, secol,
  lucrare, citat, limbă, autor și sursă;
- editorul poate modifica doar referințele al căror proprietar este;
- editorul nu poate șterge și nu poate schimba statutul unei referințe;
- administratorul poate modifica, publica, arhiva sau șterge orice referință;
- modificările sunt păstrate în `reference_revisions` pentru verificare.
