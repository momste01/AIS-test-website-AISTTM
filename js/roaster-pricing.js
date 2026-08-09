// ─────────────────────────────────────────────────────────────────────────────
// Roaster price reveal
//
// Runs on catalog.html and lot.html. When an APPROVED roaster is signed in, it
// fetches wholesale prices from Supabase (roaster_prices, keyed by the same
// `data-lot` slug the cards already use) and reveals them inline. Everyone else
// sees a subtle "Log in to see roaster pricing" prompt instead of a number.
//
// Prices are NEVER shipped to the browser for signed-out users: Row Level
// Security on roaster_prices refuses the SELECT unless the caller is an
// approved roaster, so an anonymous visitor's fetch simply comes back empty.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, getAccessState } from './ais-supabase.js';

const money = (row) => {
  if (row.price_display) return row.price_display; // pre-formatted, if provided
  if (row.price_amount == null) return null;
  const amt = Number(row.price_amount).toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const cur = row.currency || 'USD';
  const unit = row.price_unit ? ` / ${row.price_unit}` : '';
  return `${cur} $${amt}${unit}`;
};

async function fetchPrices(slugs) {
  const { data, error } = await supabase
    .from('roaster_prices')
    .select('lot_slug, price_display, price_amount, currency, price_unit')
    .in('lot_slug', slugs);
  if (error) {
    // Table missing, or RLS blocked the read (not approved). Treat as "no prices".
    console.info('[roaster-pricing] no prices returned:', error.message);
    return {};
  }
  const byslug = {};
  for (const row of data || []) byslug[row.lot_slug] = money(row);
  return byslug;
}

function priceEl(text, { locked }) {
  const el = document.createElement('div');
  el.className = 'roaster-price' + (locked ? ' roaster-price-locked' : '');
  if (locked) {
    el.innerHTML = '<a href="/login.html">Log in to see roaster pricing</a>';
  } else {
    el.innerHTML =
      '<span class="roaster-price-label">Roaster price</span><span class="roaster-price-value">' +
      text +
      '</span>';
  }
  return el;
}

// ── catalog.html: one price slot per card ────────────────────────────────────
async function decorateCatalog(state, prices) {
  const cards = document.querySelectorAll('.product-card[data-lot]');
  cards.forEach((card) => {
    if (card.querySelector('.roaster-price')) return; // idempotent
    const slug = card.dataset.lot;
    const spacer = card.querySelector('.card-spacer');
    let el;
    if (state === 'approved' && prices[slug]) {
      el = priceEl(prices[slug], { locked: false });
    } else if (state === 'approved') {
      // Approved but no price on file for this lot yet — stay quiet, don't lock.
      return;
    } else {
      el = priceEl(null, { locked: true });
    }
    // Sits just above the spacer so it lands right below the meta, above the button.
    if (spacer) card.insertBefore(el, spacer);
    else card.appendChild(el);
  });
}

// ── lot.html: single price block in the CTA area ─────────────────────────────
async function decorateLot(state, prices) {
  const params = new URLSearchParams(location.search);
  const slug = params.get('lot');
  const ctas = document.querySelector('.lot-ctas');
  if (!ctas || ctas.previousElementSibling?.classList?.contains('roaster-price')) return;
  let el;
  if (state === 'approved' && slug && prices[slug]) {
    el = priceEl(prices[slug], { locked: false });
  } else if (state === 'approved') {
    return;
  } else {
    el = priceEl(null, { locked: true });
  }
  el.classList.add('roaster-price-lot');
  ctas.parentNode.insertBefore(el, ctas);
}

async function init() {
  const isLot = /(^|\/)lot\.html$/.test(location.pathname);
  const isCatalog = /(^|\/)catalog\.html$/.test(location.pathname);
  if (!isLot && !isCatalog) return;

  const { state } = await getAccessState();

  // Gather the slugs on this page.
  let slugs = [];
  if (isCatalog) {
    slugs = [...document.querySelectorAll('.product-card[data-lot]')].map((c) => c.dataset.lot);
  } else {
    const s = new URLSearchParams(location.search).get('lot');
    if (s) slugs = [s];
  }

  const prices = state === 'approved' && slugs.length ? await fetchPrices(slugs) : {};

  if (isCatalog) await decorateCatalog(state, prices);
  if (isLot) await decorateLot(state, prices);
}

// The catalog rebuilds nothing after load, but inventory sync may re-run; a
// small delay-free init is fine because we insert alongside, not replace.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
