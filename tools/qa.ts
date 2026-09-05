import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.QA_BASE || 'http://localhost:4000';
const SHOTS = 'qa-shots';
const CHROME =
  process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

const failures: string[] = [];
const logs: Array<{ kind: string; text: string }> = [];
let shotCount = 0;

fs.mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  shotCount++;
  const file = `${SHOTS}/${String(shotCount).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 ${file}`);
}

function assert(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

async function text(page: Page, sel: string): Promise<string> {
  try {
    const el = await page.$(sel);
    return el ? ((await page.evaluate((e) => (e as HTMLElement).innerText, el)) || '').trim() : '';
  } catch {
    return '';
  }
}

async function waitForText(page: Page, sel: string, timeout = 6000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (s) => {
        const el = document.querySelector(s);
        return !!el && (el as HTMLElement).innerText.trim().length > 0;
      },
      { timeout },
      sel
    );
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const browser: Browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: 'qa-shots/profile',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1500,950']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      logs.push({ kind: msg.type(), text: msg.text() });
      console.log(`  [console.${msg.type()}] ${msg.text().slice(0, 300)}`);
    }
  });
  page.on('pageerror', (err) => {
    logs.push({ kind: 'pageerror', text: err.message });
    console.log(`  [pageerror] ${err.message.slice(0, 300)}`);
  });
  page.on('requestfailed', (req) => {
    logs.push({ kind: 'requestfailed', text: `${req.url()} → ${req.failure()?.errorText}` });
  });

  await page.evaluateOnNewDocument(() => {
    window.print = () => undefined;
  });

  console.log('→ opening app');
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 15000 });
  await page.waitForSelector('.signin-screen, .app-shell', { timeout: 12000 });

  // deterministic: drop any persisted session/lang and start signed-out
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.signin-screen', { timeout: 12000 });
  const onSignIn = (await page.$('.signin-screen')) !== null;
  assert(onSignIn, 'sign-in screen shows for a fresh DB');
  await shot(page, '01-signin');

  // ---- login as admin ------------------------------------------------
  const cards = await page.$$('.user-card');
  assert(cards.length >= 1, `account picker lists ${cards.length} user(s)`);
  await page.type('.signin-form input[type="password"]', '123');
  await page.click('.signin-form button[type="submit"]');
  await page.waitForSelector('.app-shell', { timeout: 8000 });
  await shot(page, '02-inventory-empty');

  const emptyVisible = await waitForText(page, '.empty-state p');
  assert(emptyVisible, 'empty warehouse state visible after login');
  assert(!logs.some((l) => l.kind === 'pageerror'), 'no page errors so far');

  // ---- add an item ---------------------------------------------------
  await page.click('.empty-state .btn-primary');
  await page.waitForSelector('.modal-panel', { timeout: 5000 });
  const itemModalTitle = await text(page, '.modal-panel .modal-head h3');
  assert(itemModalTitle.includes('إضافة صنف'), `item modal opened ("${itemModalTitle}")`);
  await shot(page, '03-item-modal');

  // fill: name, barcode, buy, sell, qty, minQty, unit
  const inputIdx = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('.modal-panel .form-control')] as HTMLInputElement[];
    return inputs.map((i) => i.type);
  });
  assert(inputIdx.length >= 7, `item form has ${inputIdx.length} fields`);
  const setField = (idx: number, value: string): Promise<void> =>
    page.evaluate(
      (i, v) => {
        const el = document.querySelectorAll('.modal-panel .form-control')[i] as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      idx,
      value
    );
  await setField(0, 'Cola Can');
  await setField(2, '7');
  await setField(3, '10');
  await setField(4, '5');
  await page.click('.modal-panel button[type="submit"]');
  await page.waitForSelector('.item-card', { timeout: 6000 });
  const cardText = await text(page, '.item-card');
  assert(cardText.includes('Cola Can'), 'item card rendered with new product');
  await shot(page, '04-inventory-one');

  // ---- POS sale ------------------------------------------------------
  console.log('→ open POS');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.tb-btn')].find((b) => b.innerText.includes('نقطة بيع'));
    (btn as HTMLButtonElement)?.click();
  });
  await page.waitForSelector('.pos-panel', { timeout: 5000 });
  await page.waitForSelector('.pos-tile:not(.out)', { timeout: 5000 });
  await shot(page, '05-pos-open');

  await page.click('.pos-tile:not(.out)');
  await page.waitForSelector('.cart-row', { timeout: 3000 });
  const cartLine = await text(page, '.cart-row');
  assert(cartLine.includes('Cola Can'), 'product added to cart');

  // double it, then pay
  await page.click('.cart-row .qty-btn.plus');
  const totalTxt = await text(page, '.pos-totals .net strong');
  assert(totalTxt.includes('20.00'), `net due shows 20.00 (got "${totalTxt}")`);

  // set the PAID field (third input in the pos form grid)
  await page.evaluate(() => {
    const el = document.querySelectorAll('.pos-form-grid input')[2] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(el, '25');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('.change-box strong')?.textContent?.includes('5.00'), {
    timeout: 3000
  });
  assert(true, 'change shows 5.00');
  await shot(page, '06-pos-cart');

  await page.click('.pos-checkout');
  await page.waitForFunction(() => !document.querySelector('.pos-panel'), { timeout: 6000 });
  // status bar re-fetches totals right after the sale — wait for the live update
  await page.waitForFunction(() => document.querySelector('.sb-money strong')?.textContent?.includes('20.00'), {
    timeout: 6000
  });
  assert(true, 'status bar drawer updates to 20.00 after the sale');

  // receipt should be rendered into #print-root (print is stubbed)
  await new Promise((r) => setTimeout(r, 900));
  const printState = await page.evaluate(() => {
    const root = document.getElementById('print-root');
    const sheet = document.querySelector('.print-sheet');
    return {
      rootChildren: root ? root.children.length : -1,
      sheetText: sheet ? (sheet as HTMLElement).innerText.slice(0, 120) : '(no .print-sheet)',
      sheetPresent: !!sheet,
      bodyHasPrintSheet: document.body.classList.contains('printing')
    };
  });
  console.log('  print-state:', JSON.stringify(printState));
  const receiptHasInvoice = printState.sheetText.includes('INV-');
  assert(receiptHasInvoice, 'receipt HTML rendered for printing');
  await shot(page, '07-after-sale');

  // stock decremented on the card
  const stockAfter = await text(page, '.stock-meter-label');
  assert(stockAfter.includes('3'), `stock dropped to 3 (got "${stockAfter}")`);

  // ---- reports -------------------------------------------------------
  console.log('→ open reports');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.tb-btn')].find((b) => b.innerText.includes('تقرير'));
    (btn as HTMLButtonElement)?.click();
  });
  await page.waitForSelector('.report-panel', { timeout: 5000 });
  await page.waitForSelector('.kpi-row', { timeout: 5000 });
  const kpiText = await text(page, '.report-panel .kpi-row');
  assert(kpiText.includes('20.00') && kpiText.includes('6.00'), 'revenue 20.00 / profit 6.00 KPIs');
  await shot(page, '08-reports');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.tab-btn')].find((b) => b.innerText.includes('ورديات'));
    (btn as HTMLButtonElement)?.click();
  });
  await page.waitForFunction(() => !document.querySelector('.report-panel'), { timeout: 2000 }).catch(() => undefined);
  // close reports
  await page.evaluate(() => {
    const close = [...document.querySelectorAll('.report-panel .icon-btn')].find((b) => b.innerText.includes('✕') || b.querySelector('.fa-xmark'));
    (close as HTMLButtonElement)?.click();
  });
  await page.waitForFunction(() => !document.querySelector('.report-panel'), { timeout: 3000 });

  // ---- shift console & audit ----------------------------------------
  console.log('→ open shift console');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.tb-btn')].find((b) => b.innerText.includes('تقفيل'));
    (btn as HTMLButtonElement)?.click();
  });
  await page.waitForSelector('.shift-panel', { timeout: 5000 });
  await page.waitForSelector('.audit-count-row', { timeout: 5000 });
  const expectedTxt = await text(page, '.audit-expected strong');
  assert(expectedTxt.includes('20.00'), `drawer expected shows 20.00 (got "${expectedTxt}")`);
  await page.type('.audit-input input', '20');
  await page.waitForSelector('.audit-banner.banner-success', { timeout: 3000 });
  assert(true, '20.00 counted → drawer matches (success banner)');
  await shot(page, '09-shift-audit-match');

  // now overage
  await page.click('.audit-input input', { clickCount: 3 });
  await page.type('.audit-input input', '22');
  await page.waitForSelector('.audit-banner.banner-cyan', { timeout: 3000 });
  assert(true, '22.00 counted → overage (cyan banner)');
  await shot(page, '10-shift-audit-overage');

  // open the close-shift confirm, try a wrong password first (box must stay open)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.btn-warning')].find((b) => b.innerText.includes('تقفيل'));
    (btn as HTMLButtonElement)?.click();
  });
  await page.waitForSelector('.confirm-shift', { timeout: 3000 });
  await page.type('.confirm-shift input', 'wrong');
  await page.click('.confirm-shift .btn-danger');
  await page.waitForSelector('.app-toast.toast-error', { timeout: 4000 });
  const stillOpen = (await page.$('.confirm-shift')) !== null;
  assert(stillOpen, 'wrong password rejected, confirm box stays open');
  await shot(page, '11-shift-close-rejected');

  // retype the correct password in the same open dialog
  await page.click('.confirm-shift input', { clickCount: 3 });
  await page.type('.confirm-shift input', '123');
  await page.click('.confirm-shift .btn-danger');
  await page.waitForSelector('.done-card', { timeout: 6000 });
  const doneTxt = await text(page, '.done-card');
  assert(doneTxt.includes('2.00'), 'closure summary shows overage +2.00');
  await shot(page, '12-shift-closed-overlay');

  // start new shift
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.done-card button')].find((b) => b.innerText.includes('نعم'));
    (btn as HTMLButtonElement)?.click();
  });
  await page.waitForFunction(() => !document.querySelector('.done-card'), { timeout: 4000 });
  const drawer2 = await text(page, '.sb-money strong');
  assert(drawer2.includes('0.00'), `new shift drawer reset to 0.00 (got "${drawer2}")`);
  await shot(page, '13-fresh-shift');

  // ---- language toggle ----------------------------------------------
  console.log('→ switch to English');
  await page.evaluate(() => {
    const btn = document.querySelector('.titlebar-actions .fa-language')?.closest('button') as HTMLButtonElement;
    btn?.click();
  });
  await page.waitForFunction(() => document.documentElement.lang === 'en', { timeout: 4000 });
  const engHead = await text(page, '.page-head h2');
  assert(engHead.includes('Inventory'), `English header shows (got "${engHead}")`);
  await shot(page, '14-english');

  // ---- cleanup: delete item so DB is left tidy for manual runs -------
  // (not required — DB will be reset anyway)

  // ---- responsive overflow probes ----------------------------------
  console.log('→ responsive checks');
  for (const w of [1024, 390]) {
    await page.setViewport({ width: w, height: 800 });
    await new Promise((r) => setTimeout(r, 350));
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth
    }));
    assert(m.sw <= m.cw + 2, `no horizontal overflow at ${w}px (scroll ${m.sw} vs client ${m.cw})`);
  }
  await page.setViewport({ width: 1500, height: 950 });
  await shot(page, '15-back-desktop');

  console.log('\n========================================');
  if (failures.length === 0) console.log('QA PASSED — no failures');
  else {
    console.log(`QA FAILED (${failures.length}):`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  const realErrors = logs.filter((l) => l.kind !== 'requestfailed' || !l.text.includes('favicon'));
  if (realErrors.length) {
    console.log(`\nConsole noise (${realErrors.length}):`);
    realErrors.slice(0, 10).forEach((l) => console.log(`  [${l.kind}] ${l.text.slice(0, 220)}`));
  }

  await browser.close();
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error('QA crashed:', err);
  process.exit(2);
});
