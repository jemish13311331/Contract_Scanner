// Dev-only helper: screenshot the built home page so we can eyeball the UI.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const OUT = process.argv[2] || path.join(__dirname, '..', 'home.png');
const PORT = 4199;

const app = express();
app.use(express.static(DIST, { index: false }));
app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
const server = app.listen(PORT);

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });
await page.waitForSelector('.hero', { timeout: 15000 }).catch(() => {});
await page.screenshot({ path: OUT, fullPage: true });
console.log('saved', OUT);
await browser.close();
server.close();
