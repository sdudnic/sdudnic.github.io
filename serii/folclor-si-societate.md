---
layout: default
title: "Folclor și societate"
permalink: /serii/folclor-si-societate/
lang: mo
---

# Folclor și societate

O serie de articole accesibile despre personajele poveștilor moldovenești și relațiile dintre ele. Sexul și vîrsta sînt analizate separat, alături de starea socială, avere, ierarhie, inteligență, judecată morală, apartenență etnică și origine regională.

Întrebarea comună este **cum se păstrează sau se schimbă valorile între epoci**: ce este lăudat, ce este condamnat și cine este răsplătit? Compararea variantelor ar permite evaluarea continuității și a adaptării, atunci cînd datarea și proveniența lor susțin concluzii.

Articolele publicate au eticheta comună **folclor-si-societate** și sînt adunate automat mai jos.

<ol class="article-list">
{% for post in site.posts %}
  {% if post.tags contains 'folclor-si-societate' %}
  <li>
    <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%d/%m/%Y" }}</time>
    <a href="{{ post.url | relative_url }}">{{ post.title | escape }}</a>
  </li>
  {% endif %}
{% endfor %}
</ol>

## Direcții propuse pentru continuare

- **Sexul — femeile și bărbații:** inițiativă, muncă, alegere și dependență; cum se schimbă așteptările față de fiecare între epoci.
- **Vîrsta — tinerii și bătrînii:** experiență, autoritate, vulnerabilitate și raporturi între generații; cum se schimbă aprecierea lor între epoci.
- **Starea socială și averea:** țărani, argat și stăpîn, boier și negustor; sărăcia, munca și răsplata.
- **Puterea și ierarhia:** cine poruncește, cine se supune și cum se schimbă raportul dintre ei.
- **Inteligența și judecata asupra personajelor:** deștept sau prost, frumos sau urît, bine sau rău, iubit sau detestat — dimensiuni evaluate separat.
- **Apartenența etnică și originea regională:** cum sînt numite și reprezentate grupurile — de exemplu moldoveni, ruși, evrei ori oameni din Vrancea, atunci cînd textul îi identifică; etnia și proveniența regională se consemnează distinct.
- **Sinteza schimbării valorilor:** ce evaluări se păstrează între epoci, ce evaluări se modifică și ce indică acestea despre conservare și adaptare. Diferențele de regiune, gen și intervenție editorială trebuie luate în calcul.

Aceste direcții sînt propuneri de cercetare. Lista de mai sus include numai articolele deja publicate.
