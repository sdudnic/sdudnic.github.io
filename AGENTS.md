# Instrucțiuni pentru agenții proiectului

## Domeniul de includere pentru moldovenească

Catalogul nu trebuie limitat la materiale care conțin exact expresia „limba
moldovenească”. Pentru orice operație de identificare, căutare sau import,
agentul ia în calcul și referințele care tratează explicit sau indirect
identitatea proprie moldovenească a limbii, inclusiv atunci când aceasta este
discutată prin contrast cu alte denumiri sau clasificări.

Intră în acest domeniu, după caz, lucrările despre gramatica moldovenească,
vocabularul și lexicografia moldovenească, abecedare și manuale, alfabet și
ortografie, fonetică, morfologie, sintaxă, terminologie, dialectologie,
lingvistică, filologie, istoria limbii, denumirea/glotonimul limbii, politica
lingvistică și educația în limba moldovenească. Se includ și dicționare,
gramatici, texte didactice, bibliografii, studii de identitate lingvistică și
alte surse care oferă dovezi relevante pentru această identificare.

O referință poate fi relevantă chiar dacă termenul „moldovenească” nu apare în
titlu, atunci când descrierea, clasificarea, citatul, contextul istoric sau
metadatele leagă în mod verificabil materialul de identitatea moldovenească a
limbii. Agentul notează această legătură în descriere sau în motivarea
relevanței și nu asimilează automat orice material despre Moldova, populația
moldovenească ori limba folosită în Moldova cu o referință despre identitatea
moldovenească a limbii.

Regula strictă pentru validare și publicare este însă mai îngustă decât etapa
de descoperire: pasajul verificat din sursa primară trebuie să numească limba
moldovenească printr-un glotonim sau o formulare echivalentă, de exemplu
`lingua Moldavica`, `lingua Moldavorum`, `langue moldave`, `Moldavische
Sprache` ori o formă istorică/transliterată verificabilă. Nu este suficient ca
sursa să spună doar că moldovenii folosesc aceeași limbă, să enumere Moldova
între țări sau să numească numai limba valahă/`Valacchica`. O sursă mixtă
Valachi–Moldavi este eligibilă numai dacă în același pasaj limba este numită și
moldovenească; altfel rămâne neverificată și nu se publică.

La căutarea în cataloage, biblioteci, OCR și texte scanate, agentul verifică,
între altele, combinații precum `langue molda`, `limba molda` și `yazyk molda`,
precum și căutarea separată după `molda`, `moldav` și `moldov` (inclusiv după
prefixul `Molda`), nu doar formele complete `Moldavie`, `Moldaves` sau
`moldovenească`. Se verifică și echivalentele, transliterările, inversarea
ordinii cuvintelor și scrierea chirilică, de exemplu `язык молда` și formele
care combină termenii `langue`, `limba`, `yazyk` sau alți termeni pentru
„limbă” cu un fragment al denumirii moldovenești. Căutarea trebuie să acopere
și despărțirile la sfârșit de rând, de tipul `Molda-` urmat de continuarea pe
rândul următor; agentul normalizează temporar cratima de despărțire și
trecerea la rând nou înainte de a decide că o referință lipsește. Rezultatele
obținute numai prin fragmentele `molda`, `moldav` sau `moldov` se verifică
manual în pagina originală, deoarece pot produce rezultate nerelevante.

## Gestiunea referințelor

Pentru orice operație asupra catalogului referințelor despre limba
moldovenească, agentul folosește MCP-ul `moldoveneasca_references` ca interfață
principală. Nu face scrieri directe în Supabase, prin REST sau prin formularul
web atunci când MCP-ul este disponibil.

Flux obligatoriu înainte de o scriere:

1. Citește `moldoveneasca_reference_statistics` pentru baza curentă.
2. Caută toate referințele publicate cu `search_moldoveneasca_references`,
   paginând rezultatele; `limit` este plafonat la 100.
3. Elimină dublurile după URL canonic și după cheia
   `titlu normalizat + an`, în această ordine. URL-ul canonic elimină fragmentul,
   slash-ul final și parametrii de tracking.
4. Verifică sursa și păstrează URL-ul bibliotecii sau al ediției originale.
   Pentru cercetări noi, ordonează candidații: până în 1917, 1918–1939,
   bibliografii naționale, apoi perioadele ulterioare. Nu inventa ani pentru
   referințe nedatate: folosește `year_label: "necunoscut"` și intervale nule.

Operațiile MCP sunt:

- `add_moldoveneasca_reference` pentru o referință nouă;
- `edit_moldoveneasca_reference` pentru completarea sau corectarea unei
  referințe existente;
- `review_moldoveneasca_reference` cu `publish`/`approve` numai după verificare;
- `request_moldoveneasca_reference_deletion` pentru ștergere propusă;
- `list_moldoveneasca_unverified` și instrumentele de moderare pentru coada de
  prevalidare;
- `moldoveneasca_reference_statistics` și `search_moldoveneasca_references`
  pentru verificarea post-import.

`add_moldoveneasca_reference` fără statut explicit creează o intrare
`pending`; aceasta este comportamentul intenționat. Dacă MCP răspunde
`auth_required`, agentul nu ocolește fluxul și nu folosește o cheie publică drept
token de utilizator: oprește scrierea și cere autentificarea locală cu
`npm run auth:login` din directorul `mcp` sau configurarea unui
`MOLDOVENEASCA_SUPABASE_ACCESS_TOKEN` în `.env`, urmată de repornirea MCP.
Parola nu se transmite în chat. Pentru proprietarul catalogului, publicarea se
face ulterior cu `review_moldoveneasca_reference`.

Pentru orice referință clasificată `ethnicity` sau `both`, `source_url` este
obligatoriu și trebuie să ducă la o sursă verificabilă. În câmpul autorului se
folosește numele autorului, instituției, editorului sau emitentului atunci când
este indicat de sursă; dacă sursa nu indică un autor, se notează explicit
`autor neindicat în sursă` și se păstrează totuși legătura către sursă. Nu se
completează autorul prin deducție și nu se acceptă o referință etnică fără
sursă.

## Dovada vizuală a citatului

Pentru o referință nouă, atașează în `image_url` captura reală a paginii în care
apare citatul, cu glotonimul subliniat în limba sursei. Formularul web poate
încărca captura și are acțiunea „Subliniază automat din OCR”: aceasta caută exact
glotonimul din citat și trasează linia pe coordonatele OCR. Agentul verifică
previzualizarea înainte de publicare.

Capturile `data:` sunt compactate la cel mult 2400 px pe latura lungă și
aproximativ 1,5 MB binar, pentru ca încărcarea din baza de date și afișarea să
rămână rezonabile fără a compromite lizibilitatea textului. URL-urile HTTPS
externe nu se descarcă și nu se stochează ca imagine în baza de date.

OCR-ul nu este o dovadă în sine. Dacă nu există imaginea paginii, OCR/ALTO nu
găsește exact termenul sau rezultatul este ambiguu, nu desena o linie peste o
imagine inventată și nu folosi un screenshot de prezentare. Lasă `image_url`
necompletat și notează verificarea manuală necesară. Pentru o scanare cu
coordonate ALTO/IIIF, păstrează imaginea paginii originale și adaugă numai o
subliniere roșie verificabilă; anul, titlul și citatul rămân date bibliografice
separate.

La adăugare prin MCP, imaginea pregătită se transmite în același apel
`add_moldoveneasca_reference`; la completare se folosește
`edit_moldoveneasca_reference`. După publicare, recitește referința și confirmă
că `image_url` este prezent, că URL-ul-sursă rămâne cel al bibliotecii/ediției
originale și că marcajul este sub glotonimul corect.

După fiecare lot, agentul verifică statisticile, numărul de intrări publicate,
URL-urile și duplicatele. Raportează separat totalul catalogului și numărul de
intrări vizibile în tabelul limbii, deoarece o intrare clasificată exclusiv ca
`ethnicity` nu apare în acel tabel.

Detaliile MCP și configurarea proiectului sunt în [mcp/CODEX.md](mcp/CODEX.md)
și [mcp/README.md](mcp/README.md).
