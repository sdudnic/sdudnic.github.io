---
layout: default
title: "Folclor și societate"
permalink: /serii/folclor-si-societate/
lang: mo
---

# Folclor și societate

O serie de articole accesibile despre personajele poveștilor moldovenești și relațiile dintre ele: sex și vîrstă, stare socială și avere, ierarhie, inteligență și judecată morală, religie. Compararea în timp leagă aceste teme, atunci cînd datarea și proveniența variantelor permit concluzii.

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

- **Femeile și bărbații:** inițiativă, muncă, alegere, dependență; comparații între vîrste și variante datate.
- **Starea socială și averea:** țărani, argat și stăpîn, boier și negustor; sărăcia, munca și răsplata.
- **Puterea și ierarhia:** cine poruncește, cine se supune și cum se schimbă raportul dintre ei.
- **Inteligența și judecata asupra personajelor:** deștept sau prost, frumos sau urît, bine sau rău, iubit sau detestat — dimensiuni evaluate separat.
- **Religia:** personaje sacre, cler, credințe și ajutoare supranaturale.
- **Sinteza în timp:** ce se schimbă între variante și ce poate fi atribuit perioadei, regiunii sau intervenției editorului.

Aceste direcții sînt propuneri de cercetare. Lista de mai sus include numai articolele deja publicate.
