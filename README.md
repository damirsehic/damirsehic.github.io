# damirsehic.github.io

Simple static blog using plain HTML/CSS templates and Markdown posts.

## Structure

- `posts/*.md`: your blog posts
- `templates/`: reusable layout pieces (`base.html`, `header.html`, `footer.html`)
- `static/style.css`: site styles
- `scripts/build.js`: executable build script (Node)
- `scripts/dev.js`: local dev server with watch + auto-refresh
- `.github/workflows/deploy.yml`: GitHub Pages deploy workflow
- `scripts/publish.sh`: build locally and push branch to trigger deploy

## Write a post

Each post in `posts/` must include metadata with `title` and `date`:

```md
---
title: My post title
date: 2026-02-23
---

# My post

Post content in Markdown.
```

Date format must be `YYYY-MM-DD`.

## Build locally

```bash
node scripts/build.js
```

Open `dist/index.html` in browser.

## Dev mode (watch + auto-refresh)

```bash
node scripts/dev.js
```

This does all of the following:
- watches `posts/`, `templates/`, `static/`, and `scripts/`
- runs `scripts/build.js` on change
- serves `dist/` at `http://localhost:4173`
- auto-refreshes browser after successful rebuild

Important: open the site via `http://localhost:4173` while developing. Live reload will not work if you open `dist/index.html` directly as a file.

## Publish to GitHub Pages

1. Push this repo to GitHub.
2. In GitHub repo settings:
   - Go to **Pages**
   - Source: **GitHub Actions**
3. Push to `main` (or run `./scripts/publish.sh`).

The action builds from Markdown and deploys `dist/`.

## Optional custom domain

Add a `CNAME` file in repo root. Build script copies it into `dist/` automatically.
