// Build-time prerender (SSG) for the SPA. The app is browser-coupled (reads
// window/localStorage at init, loads Stripe/Google scripts), so we can't use
// react-dom/server — instead we render each public route in a real headless
// browser and snapshot the resulting HTML into dist/.
//
// Result: crawlers (and first paint) get fully-rendered, keyword-rich HTML for
// each public route, instead of an empty <div id="root">.
//
//   Usage:  npm run build && npm run prerender
//
// Only PUBLIC, indexable routes are prerendered. Private/auth routes stay as the
// SPA shell (they're noindex anyway).
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const INDEX = path.join(DIST, 'index.html');
const PORT = 4173;
const ROUTES = ['/', '/privacy', '/terms'];

if (!existsSync(INDEX)) {
  console.error('No dist/index.html — run `npm run build` first.');
  process.exit(1);
}

// Serve the built SPA locally so the browser can load it exactly as in prod.
const app = express();
app.use(express.static(DIST, { index: false }));
app.get('*', (_req, res) => res.sendFile(INDEX));
const server = app.listen(PORT);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  for (const route of ROUTES) {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle2', timeout: 30000 });
    // Wait for React to actually mount content into #root.
    await page.waitForSelector('#root > *', { timeout: 15000 }).catch(() => {});
    const html = '<!doctype html>\n' + (await page.content()).replace(/^<!doctype html>/i, '').trimStart();

    const outDir = route === '/' ? DIST : path.join(DIST, route);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, 'index.html'), html);
    console.log(`prerendered ${route} -> ${path.relative(process.cwd(), path.join(outDir, 'index.html'))}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
