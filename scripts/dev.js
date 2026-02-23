#!/usr/bin/env node
const { createServer } = require('node:http');
const { existsSync, readFileSync, readdirSync, statSync, watch } = require('node:fs');
const { extname, join, normalize, resolve } = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = resolve(__dirname, '..');
const DIST_DIR = join(ROOT, 'dist');
const WATCH_DIRS = ['posts', 'templates', 'static', 'scripts'].map((d) => join(ROOT, d));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';

const clients = new Set();
const watchers = [];
let buildRunning = false;
let pendingBuild = false;
let debounceTimer = null;
let buildVersion = 0;
let pollSignature = '';
let pollTimer = null;

function contentTypeFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.ico') return 'image/x-icon';
  return 'application/octet-stream';
}

function sendReloadEvent() {
  for (const client of clients) {
    client.write('event: reload\\n');
    client.write('data: ok\\n\\n');
  }
}

function keepSseAlive() {
  for (const client of clients) {
    client.write(': keepalive\\n\\n');
  }
}

function runBuild(trigger) {
  if (buildRunning) {
    pendingBuild = true;
    return;
  }

  buildRunning = true;
  const child = spawn('node', [join(ROOT, 'scripts', 'build.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    buildRunning = false;
    if (code === 0) {
      buildVersion += 1;
      console.log(`[dev] build ok (${trigger})`);
      sendReloadEvent();
    } else {
      console.error(`[dev] build failed (${trigger})`);
    }

    if (pendingBuild) {
      pendingBuild = false;
      runBuild('queued');
    }
  });
}

function scheduleBuild(trigger) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runBuild(trigger), 120);
}

function walkDirs(rootDir, out) {
  out.push(rootDir);
  for (const entry of readdirSync(rootDir)) {
    const full = join(rootDir, entry);
    if (statSync(full).isDirectory()) {
      walkDirs(full, out);
    }
  }
}

function setupWatchers() {
  const watchedDirs = [];
  for (const dir of WATCH_DIRS) {
    if (!existsSync(dir)) continue;
    walkDirs(dir, watchedDirs);
  }

  for (const dir of watchedDirs) {
    try {
      const watcher = watch(dir, () => {
        scheduleBuild('file change');
      });
      watchers.push(watcher);
    } catch (err) {
      console.error(`[dev] failed to watch ${dir}:`, err.message);
    }
  }

  console.log(`[dev] watching ${watchedDirs.length} directories`);
}

function getDirectorySignature(rootDir) {
  const parts = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!existsSync(current)) continue;

    const entries = readdirSync(current).sort();
    for (const entry of entries) {
      const full = join(current, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        stack.push(full);
      } else {
        parts.push(`${full}:${stats.mtimeMs}:${stats.size}`);
      }
    }
  }

  return parts.join('|');
}

function getInputsSignature() {
  const signatures = [];
  for (const dir of WATCH_DIRS) {
    if (existsSync(dir)) {
      signatures.push(getDirectorySignature(dir));
    }
  }
  return signatures.join('||');
}

function setupPollingFallback() {
  pollSignature = getInputsSignature();
  pollTimer = setInterval(() => {
    const next = getInputsSignature();
    if (next !== pollSignature) {
      pollSignature = next;
      scheduleBuild('poll change');
    }
  }, 500);
}

function liveReloadSnippet(version) {
  return `
<script>
(() => {
  const initialVersion = '${version}';
  const events = new EventSource('/__events');
  events.addEventListener('reload', () => location.reload());
  const checkVersion = async () => {
    try {
      const res = await fetch('/__version', { cache: 'no-store' });
      const latest = (await res.text()).trim();
      if (latest && latest !== initialVersion) {
        location.reload();
      }
    } catch (_) {}
  };
  setInterval(checkVersion, 1000);
})();
</script>
`;
}

function serveFile(reqPath, res) {
  let relative = reqPath === '/' ? '/index.html' : reqPath;
  relative = normalize(relative).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(DIST_DIR, relative);

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const body = readFileSync(filePath);
  const type = contentTypeFor(filePath);

  if (type.startsWith('text/html')) {
    const text = body.toString('utf8');
    const snippet = liveReloadSnippet(buildVersion);
    const withLiveReload = text.includes('</body>')
      ? text.replace('</body>', `${snippet}</body>`)
      : `${text}${snippet}`;
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(withLiveReload);
    return;
  }

  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function startServer() {
  const server = createServer((req, res) => {
    const url = req.url || '/';

    if (url === '/__events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      res.write('\\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (url === '/__version') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(String(buildVersion));
      return;
    }

    serveFile(url.split('?')[0], res);
  });

  server.on('error', (err) => {
    console.error(`[dev] server error: ${err.message}`);
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    console.log(`[dev] http://${HOST}:${PORT}`);
  });
}

runBuild('startup');
setupWatchers();
setupPollingFallback();
setInterval(keepSseAlive, 20000);
startServer();
