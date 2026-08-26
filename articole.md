---
layout: default
title: Noutăți
nav_title: Noutăți
permalink: /articole/
---

<section class="article-index" aria-labelledby="articles-title">
  <p class="eyebrow">Noutăți</p>
  <h1 id="articles-title">Noutăți și articole</h1>
  <p class="page-lead">Știri, demersuri și texte despre Moldova, identitate, istorie și societate.</p>

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
