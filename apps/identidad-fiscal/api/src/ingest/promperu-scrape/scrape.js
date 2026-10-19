const { chromium } = require('playwright');
const fs = require('fs');

const URL = 'https://rebrand.ly/emp_exp_pub';
const OUT_CSV = 'promperu-directorio-exportadores.csv';
const OUT_PROGRESS = 'progress.json';
const TARGET_TOTAL = 15390; // shown by the report's own KPI card
const MAX_STALL_ITERATIONS = 80; // consecutive no-growth reads before giving up on a session
const ITERATIONS_PER_SESSION = 2000; // restart the browser periodically regardless, to dodge the renderer memory leak
const MAX_SESSIONS = 40;

function extractScript() {
  return `
    (function() {
      const rows = document.querySelectorAll('div.innerContainer div[role="row"]');
      const out = [];
      rows.forEach(r => {
        const cells = r.querySelectorAll('div[role="gridcell"]');
        if (cells.length >= 8) {
          const vals = Array.from(cells).map(c => c.innerText.trim());
          const ruc = vals[1];
          if (ruc && /^\\d{10,11}$/.test(ruc)) {
            out.push(vals.slice(1));
          }
        }
      });
      return out;
    })()
  `;
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function writeCsv(map) {
  const header = ['ruc', 'razon_social', 'web', 'sector_productivo', 'region', 'fob_2023_usd', 'fob_2024_usd', 'fob_2025_usd'];
  const lines = [header.join(',')];
  for (const vals of map.values()) {
    lines.push(vals.map(csvEscape).join(','));
  }
  fs.writeFileSync(OUT_CSV, lines.join('\n'), 'utf-8');
}

const map = new Map();

async function extractAndMerge(page) {
  const rows = await page.evaluate(extractScript());
  let added = 0;
  for (const vals of rows) {
    const ruc = vals[0];
    if (!map.has(ruc)) {
      map.set(ruc, vals);
      added++;
    }
  }
  return added;
}

async function clickGridCell(page) {
  // a real click is required -- programmatic .focus() does not register as a
  // "selected cell" with Power BI's internal grid state, so PageDown is a
  // no-op without it. Click the Region column (plain text, no hyperlink) to
  // avoid accidentally activating a WEB link. A click triggers Power BI's
  // quick-insights tooltip (bar chart), so we press Escape right after to
  // dismiss it before it can accumulate and leak renderer memory.
  const cell = page.locator('div.innerContainer div[role="row"] div[role="gridcell"]').nth(5);
  await cell.click({ timeout: 5000 }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
}

async function runSession(sessionIdx) {
  console.log(`\n=== sesión ${sessionIdx}, total acumulado antes: ${map.size} ===`);
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('div.innerContainer div[role="row"]', { timeout: 60000 });
    await page.waitForTimeout(3000);

    await extractAndMerge(page);
    console.log(`Inicial sesión: ${map.size} filas`);

    // click ONCE to establish selection/focus on the grid -- repeated clicks
    // trigger Power BI's quick-insights tooltip each time, which is what
    // leaked memory and crashed the renderer. If focus survives across
    // PageDown presses without re-clicking, we never trigger that tooltip.
    await clickGridCell(page);

    let stall = 0;
    for (let i = 0; i < ITERATIONS_PER_SESSION; i++) {
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(120);
      const added = await extractAndMerge(page);

      if (stall > 0 && stall % 10 === 0) {
        // focus may have drifted; re-click once to recover, accepting one tooltip
        await clickGridCell(page);
      }

      stall = added === 0 ? stall + 1 : 0;

      if (i % 25 === 0) {
        console.log(`iter=${i} total=${map.size} stall=${stall}`);
        fs.writeFileSync(OUT_PROGRESS, JSON.stringify({ session: sessionIdx, iter: i, total: map.size, stall, ts: new Date().toISOString() }, null, 2));
        writeCsv(map);
      }

      if (map.size >= TARGET_TOTAL) {
        console.log(`Alcanzado el total esperado (${TARGET_TOTAL}).`);
        return 'done';
      }
      if (stall >= MAX_STALL_ITERATIONS) {
        console.log(`Sin crecimiento tras ${MAX_STALL_ITERATIONS} intentos en esta sesión, reiniciando navegador.`);
        return 'continue';
      }
    }
    return 'continue';
  } catch (err) {
    console.error(`error en sesión ${sessionIdx}:`, err.message);
    return 'continue';
  } finally {
    await browser.close().catch(() => {});
  }
}

(async () => {
  for (let s = 0; s < MAX_SESSIONS; s++) {
    const result = await runSession(s);
    writeCsv(map);
    if (result === 'done') break;
  }
  fs.writeFileSync(OUT_PROGRESS, JSON.stringify({ done: true, total: map.size, ts: new Date().toISOString() }, null, 2));
  console.log(`\nTerminado. Total filas únicas: ${map.size}. Escrito en ${OUT_CSV}`);
})().catch((err) => {
  console.error('Fallo fatal:', err);
  writeCsv(map);
  process.exit(1);
});
