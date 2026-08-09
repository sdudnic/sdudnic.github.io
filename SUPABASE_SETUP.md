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
where github_login = 'sdudnic';
```

Pentru un colaborator:

```sql
update public.profiles
set role = 'editor'
where github_login = 'NUME_GITHUB';
```

Conturile noi rămân `viewer` până când administratorul le promovează.

## Cum funcționează prima versiune

- catalogul istoric existent rămâne vizibil și filtrabil fără cont;
- referințele noi sunt salvate în Supabase și apar în tabel după autentificare;
- editorul poate modifica doar referințele al căror proprietar este;
- editorul nu poate șterge și nu poate schimba statutul unei referințe;
- administratorul poate modifica, publica, arhiva sau șterge orice referință;
- modificările sunt păstrate în `reference_revisions` pentru verificare.

Importul și normalizarea celor aproximativ 180 de înregistrări existente în
baza Supabase poate fi făcut într-o etapă următoare, fără să pierdem pagina
statică actuală.
