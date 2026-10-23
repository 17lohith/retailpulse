import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5173'; const OUT = new URL('../evidence/screenshots/', import.meta.url).pathname;
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message));
await page.goto(BASE + '/login'); await page.getByRole('button', { name: /Indian supermarket/ }).click(); await page.waitForURL(BASE + '/'); await page.waitForTimeout(2500); await page.screenshot({ path: OUT + 'demo-c-today.png', fullPage: true });
await page.goto(BASE + '/insights'); await page.getByRole('tab', { name: 'Retail research' }).click(); await page.waitForTimeout(8000); await page.screenshot({ path: OUT + "insights-research.png", fullPage: true });
await page.getByRole('tab', { name: 'Data sources' }).click(); await page.waitForTimeout(1200); await page.screenshot({ path: OUT + 'insights-sources.png', fullPage: true });
await page.goto(BASE + '/products'); await page.waitForTimeout(1500); await page.screenshot({ path: OUT + 'demo-c-products.png' });
await b.close(); console.log(JSON.stringify({ consoleErrors: errs }));
