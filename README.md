# damirsehic.github.io

Simple static blog using plain HTML/CSS templates and Markdown posts.

## Structure

- `posts/*.md`: your blog posts
- `templates/`: reusable layout pieces (`base.html`, `header.html`, `footer.html`)
- `static/style.css`: site styles
- `scripts/build.js`: executable build script (Node)
- `scripts/dev.js`: local dev server with watch + auto-refresh
- `scripts/publish.sh`: build locally and force-push `dist/` to a Pages branch

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
   - Source: **Deploy from a branch**
   - Branch: `gh-pages` (or whatever branch you publish to), folder: `/ (root)`
3. Run `./scripts/publish.sh` to:
   - build `dist/`
   - create a commit whose root is exactly `dist/` contents
   - force-push that commit to the target branch (default: `gh-pages`)

Optional branch/remote override:

```bash
./scripts/publish.sh <branch> <remote>
```

## Optional custom domain

Add a `CNAME` file in repo root. Build script copies it into `dist/` automatically.
