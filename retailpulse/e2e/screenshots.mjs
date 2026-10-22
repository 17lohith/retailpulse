// Logs in as the demo owner and captures every page (desktop + phone) plus a console-error report.
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = new URL('../evidence/screenshots/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const PAGES = [['today', '/'], ['orders', '/orders'], ['stock', '/stock'], ['stock-expiry', '/stock?tab=expiry'], ['products', '/products'], ['sales', '/sales'], ['forecasts', '/forecasts'], ['insights-feedback', '/insights'], ['import', '/import'], ['data-quality', '/quality'], ['settings', '/settings']];
const browser = await chromium.launch(); const report = { errors: [], pages: [] };
for (const [label, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: label === 'phone' ? 2 : 1 }); const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${label} ${page.url()} ${m.text()}`); }); page.on('pageerror', (e) => report.errors.push(`${label} pageerror ${e.message}`));
  await page.goto(BASE + '/login'); await page.getByRole('button', { name: /Single store/ }).click(); await page.waitForURL(BASE + '/'); await page.waitForTimeout(1500);
  for (const [name, path] of PAGES) {
    await page.goto(BASE + path); await page.waitForLoadState('networkidle'); await page.waitForTimeout(900);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    await page.screenshot({ path: `${OUT}${label}-${name}.png`, fullPage: true }); report.pages.push({ label, name, horizontalOverflow: overflow });
  }
  await ctx.close();
}
await browser.close(); fs.writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ shots: report.pages.length, consoleErrors: report.errors.length, overflowPages: report.pages.filter((p) => p.horizontalOverflow).map((p) => p.label + ':' + p.name), errors: report.errors.slice(0, 8) }, null, 1));
