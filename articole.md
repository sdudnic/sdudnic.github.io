---
layout: default
title: Articole
nav_title: Articole
permalink: /articole/
---

<section class="article-index" aria-labelledby="articles-title">
  <p class="eyebrow">Arhivă</p>
  <h1 id="articles-title">Articole și note</h1>
  <p class="page-lead">O selecție de texte despre Moldova, identitate, istorie și societate.</p>

  <ol class="article-list">
    {% for post in site.posts %}
      <li>
        <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%d/%m/%Y" }}</time>
        <a href="{{ post.url | relative_url }}">{{ post.title | escape }}</a>
      </li>
    {% else %}
      <li>Arhiva este în curs de completare.</li>
    {% endfor %}
  </ol>
</section>
