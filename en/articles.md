---
layout: default
title: News
nav_title: News
lang: en
permalink: /en/articles/
---

<section class="article-index" aria-labelledby="articles-title-en">
  <p class="eyebrow">News</p>
  <h1 id="articles-title-en">News and articles</h1>
  <p class="page-lead">News, civic initiatives and texts about Moldova, identity, history and society.</p>

  <ol class="article-list">
    {% for post in site.posts %}
      <li>
        <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%d/%m/%Y" }}</time>
        <a href="{{ post.url | relative_url }}">{{ post.title_en | default: post.title | escape }}</a>
      </li>
    {% else %}
      <li>The archive is being completed.</li>
    {% endfor %}
  </ol>
</section>
