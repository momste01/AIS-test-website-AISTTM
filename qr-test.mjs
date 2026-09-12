// Simulates scanning each sample-label QR code: visits the lot URL and
// verifies the correct coffee page renders (title, producer, not the
// "lot missing" fallback). Run before and after content changes to prove
// URLs are stable.
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000';
const SLUGS = [
  ['etalase-natural', 'Etalase Natural'],
  ['etalase-honey', 'Etalase Honey'],
  ['etalase-fully-washed', 'Etalase Fully Washed'],
  ['agtn-wet-hulled', 'AGTN Wet Hulled'],
  ['natural-bajawa', 'Bajawa Natural'],
  ['fully-washed-bajawa', 'Bajawa Fully Washed'],
  ['natural-garut', 'Garut Natural'],
  ['frinsa-estate-natural-lactic', 'Frinsa Estate Natural Lactic'],
  ['frinsa-collective-natural', 'Frinsa Collective Natural'],
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
let pass = 0, fail = 0;
for (const [slug, expected] of SLUGS) {
  const url = `${BASE}/lot.html?lot=${slug}`;
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const status = res.status();
    const { title, producer, missing } = await page.evaluate(() => ({
      title: document.getElementById('lot-title')?.textContent || '',
      producer: document.getElementById('lot-producer')?.textContent || '',
      missing: !document.getElementById('lot-missing')?.hidden,
    }));
    const ok = status === 200 && !missing && title === expected;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${slug}  →  HTTP ${status}, renders "${title}" (${producer})${missing ? ' [MISSING PAGE SHOWN]' : ''}`);
    ok ? pass++ : fail++;
  } catch (e) {
    console.log(`FAIL  ${slug}  →  ${e.message}`);
    fail++;
  }
}
await browser.close();
console.log(`\n${pass}/${SLUGS.length} lot URLs render correctly${fail ? `, ${fail} FAILED` : ''}`);
process.exit(fail ? 1 : 0);
