#!/usr/bin/env node
const {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
const POSTS_DIR = join(ROOT, "posts");
const TEMPLATES_DIR = join(ROOT, "templates");
const STATIC_DIR = join(ROOT, "static");
const DIST_DIR = join(ROOT, "dist");

function slugify(value) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "post"
  );
}

function renderTemplate(template, vars) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function inlineMarkdown(value) {
  let out = escapeHtml(value);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];

  let paragraph = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let inList = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!inList) return;
    html.push("</ul>");
    inList = false;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      if (inCodeBlock) {
        html.push(
          `<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`,
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(raw);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    if (inList) {
      flushList();
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  if (inCodeBlock) {
    throw new Error("Unclosed code block detected in markdown post.");
  }

  return html.join("\n");
}

function parseFrontMatter(raw) {
  if (!raw.startsWith("---\n")) {
    return { meta: {}, body: raw };
  }

  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) {
    return { meta: {}, body: raw };
  }

  const metaBlock = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const meta = {};

  for (const line of metaBlock.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }

  return { meta, body };
}

function readPosts() {
  const files = readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  const posts = [];

  for (const file of files) {
    const fullPath = join(POSTS_DIR, file);
    const raw = readFileSync(fullPath, "utf8");
    const { meta, body } = parseFrontMatter(raw);

    const title = meta.title;
    const date = meta.date;

    if (!title || !date) {
      throw new Error(
        `Missing required metadata in ${file}. Required: title, date`,
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(
        `Invalid date format in ${file}: ${date}. Use YYYY-MM-DD`,
      );
    }

    const dateValue = Date.parse(`${date}T00:00:00Z`);
    if (Number.isNaN(dateValue)) {
      throw new Error(`Invalid date value in ${file}: ${date}`);
    }

    const slug = slugify(file.replace(/\.md$/, ""));

    posts.push({
      title,
      date,
      dateValue,
      slug,
      bodyHtml: markdownToHtml(body),
    });
  }

  posts.sort((a, b) => b.dateValue - a.dateValue);
  return posts;
}

function ensureCleanDist() {
  if (existsSync(DIST_DIR)) {
    for (const entry of readdirSync(DIST_DIR)) {
      const path = join(DIST_DIR, entry);
      const stats = statSync(path);
      if (stats.isDirectory()) {
        rmSync(path, { recursive: true, force: true });
      } else {
        rmSync(path, { force: true });
      }
    }
  } else {
    mkdirSync(DIST_DIR, { recursive: true });
  }
}

function writeSite(posts) {
  const baseTemplate = readFileSync(join(TEMPLATES_DIR, "base.html"), "utf8");
  const headerTemplate = readFileSync(
    join(TEMPLATES_DIR, "header.html"),
    "utf8",
  );
  const footerTemplate = readFileSync(
    join(TEMPLATES_DIR, "footer.html"),
    "utf8",
  );

  const header = renderTemplate(headerTemplate, { base_path: "." });
  const footer = renderTemplate(footerTemplate, {
    year: String(new Date().getUTCFullYear()),
  });

  for (const post of posts) {
    const content = `<article><h1>${escapeHtml(post.title)}</h1><small>${escapeHtml(post.date)}</small>${post.bodyHtml}</article>`;
    const page = renderTemplate(baseTemplate, {
      title: `${post.title} | Damir's Notes`,
      description: post.title,
      base_path: ".",
      header,
      footer,
      content,
    });

    writeFileSync(join(DIST_DIR, `${post.slug}.html`), page, "utf8");
  }

  const listItems = posts
    .map(
      (p) =>
        `<li><a href="./${p.slug}.html"><strong>${escapeHtml(p.title)}</strong></a><small>${escapeHtml(p.date)}</small></li>`,
    )
    .join("");

  const indexContent = `<section><h1>Notes</h1><p>Short posts I can share as links.</p><ul class="post-list">${listItems}</ul></section>`;
  const indexPage = renderTemplate(baseTemplate, {
    title: "Damir's Notes",
    description: "Simple static blog.",
    base_path: ".",
    header,
    footer,
    content: indexContent,
  });

  writeFileSync(join(DIST_DIR, "index.html"), indexPage, "utf8");

  const cnamePath = join(ROOT, "CNAME");
  if (existsSync(cnamePath)) {
    copyFileSync(cnamePath, join(DIST_DIR, "CNAME"));
  }
}

function copyStatic() {
  cpSync(STATIC_DIR, join(DIST_DIR, "static"), { recursive: true });
}

function main() {
  ensureCleanDist();
  copyStatic();
  const posts = readPosts();
  writeSite(posts);
  console.log(`Built ${posts.length} posts into ${DIST_DIR}`);
}

main();
