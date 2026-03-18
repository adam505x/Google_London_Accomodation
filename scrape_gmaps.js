// ═══════════════════════════════════════════════════════════════
//  scrape_gmaps.js  —  Google Maps accommodation scraper
//  Uses system Chrome via puppeteer-core (no Chromium download).
//
//  Usage:  node scrape_gmaps.js
//  Output: scraped_raw.json
// ═══════════════════════════════════════════════════════════════

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT = path.join(__dirname, 'scraped_raw.json');

const HQ = { lat: 51.5332, lng: -0.1238 };

function distKm(lat, lng) {
  const R = 6371;
  const dLat = (lat - HQ.lat) * Math.PI / 180;
  const dLng = (lng - HQ.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(HQ.lat * Math.PI/180) * Math.cos(lat * Math.PI/180) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const QUERIES = [
  'student accommodation Kings Cross London',
  'student halls Kings Cross London',
  'student housing Islington London',
  'student accommodation Bloomsbury London',
  'student halls Euston London',
  'student accommodation Camden London',
  'student housing Angel London',
  'student accommodation Clerkenwell London',
  'student halls Barbican London',
  'student accommodation Shoreditch London',
  'private student halls North London',
  'student accommodation Fitzrovia London',
  'student halls Russell Square London',
  'student accommodation Hackney London',
  'Unite Students London',
  'iQ Student Accommodation London',
  'Chapter Living London student halls',
  'Nido student accommodation London',
  'student rooms London N1',
  'student accommodation Bethnal Green London',
  'student housing Dalston London',
  'student halls Borough London',
  'student accommodation Bermondsey London',
  'summer student accommodation London',
  'short stay student rooms London',
];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Accept Google consent if shown (runs once at start)
async function handleConsent(page) {
  try {
    // Wait up to 5s for consent button
    const consentBtn = await Promise.race([
      page.waitForSelector('button[aria-label="Accept all"]', { timeout: 5000 }),
      page.waitForSelector('button[jsname="b3VHJd"]', { timeout: 5000 }),
      page.waitForSelector('form[action*="consent"] button', { timeout: 5000 }),
    ]).catch(() => null);

    if (consentBtn) {
      await consentBtn.click();
      await sleep(2000);
      console.log('  ✓ Accepted consent dialog');
    }
  } catch (_) {}
}

async function scrapeQuery(page, query) {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${HQ.lat},${HQ.lng},13z`;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (_) {}

  // Wait for results feed to appear
  try {
    await page.waitForSelector('div[role="feed"]', { timeout: 15000 });
  } catch (_) {
    return [];
  }

  await sleep(2000);

  const seen = new Set();
  const results = [];
  let stuckCount = 0;

  for (let scroll = 0; scroll < 8 && stuckCount < 3; scroll++) {
    let places = [];
    try {
      places = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('div[role="feed"] > div').forEach(el => {
          const link = el.querySelector('a[href*="/maps/place/"]');
          if (!link) return;

          const href = link.href || '';
          if (!href.includes('/maps/place/')) return;

          // Name from aria-label on the link or heading
          let name = link.getAttribute('aria-label') || '';
          if (!name) {
            const h3 = el.querySelector('h3, [role="heading"]');
            name = h3 ? h3.textContent.trim() : link.textContent.trim();
          }

          // Coords from href
          const coordMatch = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
          const lat = coordMatch ? parseFloat(coordMatch[1]) : null;
          const lng = coordMatch ? parseFloat(coordMatch[2]) : null;

          // Rating
          const ratingEl = el.querySelector('[role="img"][aria-label]');
          const ratingText = ratingEl ? ratingEl.getAttribute('aria-label') : '';
          const rm = ratingText.match(/(\d+\.?\d*)/);
          const rating = rm ? parseFloat(rm[1]) : null;

          // Review count
          const rcMatch = el.textContent.match(/\((\d[\d,]*)\)/);
          const reviewCount = rcMatch ? parseInt(rcMatch[1].replace(',', '')) : 0;

          if (name && href) {
            items.push({ name: name.trim(), href, lat, lng, rating, reviewCount });
          }
        });
        return items;
      });
    } catch (e) {
      // Execution context destroyed — page navigated, skip remaining scrolls
      break;
    }

    let added = 0;
    for (const p of places) {
      if (!seen.has(p.href)) {
        seen.add(p.href);
        results.push(p);
        added++;
      }
    }

    if (added === 0) stuckCount++;
    else stuckCount = 0;

    // Check end of list
    let atEnd = false;
    try {
      atEnd = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        return feed ? feed.textContent.includes("You've reached the end") : false;
      });
    } catch (_) {}

    if (atEnd) break;

    // Scroll the feed
    try {
      await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) feed.scrollBy(0, 800);
      });
    } catch (_) {}

    await sleep(1200);
  }

  return results;
}

async function getPlaceDetails(page, href) {
  try {
    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (_) {}

  // Wait for the place title to load
  try {
    await page.waitForSelector('h1', { timeout: 10000 });
  } catch (_) {
    return null;
  }

  await sleep(1500);

  try {
    return await page.evaluate(() => {
      const d = {};

      // Coords from URL
      const urlCoord = window.location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (urlCoord) { d.lat = parseFloat(urlCoord[1]); d.lng = parseFloat(urlCoord[2]); }

      // Also check for coords in the URL path  !3d lat !4d lng format
      const coordPath = window.location.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (coordPath && !d.lat) { d.lat = parseFloat(coordPath[1]); d.lng = parseFloat(coordPath[2]); }

      d.title = (document.querySelector('h1') || {}).textContent?.trim() || '';

      // Category button
      const catBtn = document.querySelector('button[jsaction*="category"]');
      d.category = catBtn ? catBtn.textContent.trim() : '';

      // Address — look for the address data item
      const allButtons = Array.from(document.querySelectorAll('button[aria-label]'));
      for (const btn of allButtons) {
        const lbl = btn.getAttribute('aria-label') || '';
        if (lbl.startsWith('Address:') || lbl.includes('London')) {
          d.address = lbl.replace(/^Address:\s*/, '').trim();
          break;
        }
      }
      if (!d.address) {
        // Fallback: find text containing postcode
        const body = document.body.innerText;
        const postcodeMatch = body.match(/\d+ [A-Za-z].*?(?:London|EC\d|WC\d|N\d|E\d|W\d|SW\d|SE\d)[^,\n]{0,30}/);
        if (postcodeMatch) d.address = postcodeMatch[0].trim().slice(0, 100);
      }

      // Website
      const webLink = document.querySelector('a[data-item-id="authority"]');
      d.website = webLink ? webLink.href : '';
      if (!d.website) {
        // Try any external link that isn't google
        const links = Array.from(document.querySelectorAll('a[href^="http"]'));
        for (const l of links) {
          if (!l.href.includes('google') && !l.href.includes('goo.gl')) {
            d.website = l.href;
            break;
          }
        }
      }

      // Phone
      const phoneBtn = document.querySelector('[data-item-id*="phone"]');
      d.phone = phoneBtn ? phoneBtn.textContent.trim() : '';
      if (!d.phone) {
        const ph = Array.from(document.querySelectorAll('[aria-label]'))
          .find(el => (el.getAttribute('aria-label') || '').startsWith('Phone:'));
        if (ph) d.phone = ph.getAttribute('aria-label').replace('Phone:', '').trim();
      }

      // Rating
      const ratingEl = document.querySelector('[role="img"][aria-label*="star"]') ||
                       document.querySelector('[aria-label*="stars"]');
      const ratingText = ratingEl ? ratingEl.getAttribute('aria-label') : '';
      const rm = ratingText.match(/(\d+\.?\d*)/);
      d.review_rating = rm ? parseFloat(rm[1]) : null;

      // Review count
      const reviews = document.body.innerText.match(/(\d[\d,]*)\s+reviews?/i);
      d.review_count = reviews ? parseInt(reviews[1].replace(',','')) : 0;

      d.link = window.location.href;

      // Place ID
      const pidM = window.location.href.match(/place\/[^/]+\/([^?@/]+)/);
      d.place_id = pidM ? pidM[1] : '';

      // Description
      const descEl = document.querySelector('[data-attrid="description"] span') ||
                     document.querySelector('div[aria-label] span');
      d.descriptions = descEl ? descEl.textContent.trim().slice(0, 300) : '';

      return d;
    });
  } catch (e) {
    return null;
  }
}

(async () => {
  console.log('\n🗺  Google Maps Accommodation Scraper');
  console.log(`   Centered on Kings Cross (${HQ.lat}, ${HQ.lng})\n`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  // Prime the page and handle consent once
  console.log('  Opening Google Maps and handling consent...');
  try {
    await page.goto('https://www.google.com/maps', { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (_) {}
  await handleConsent(page);
  await sleep(2000);

  // ── Phase 1: collect place links ──────────────────────────────
  const allLinks = new Map();

  for (const query of QUERIES) {
    process.stdout.write(`  Searching: "${query}" ... `);
    const places = await scrapeQuery(page, query);
    let newCount = 0;
    for (const p of places) {
      if (!allLinks.has(p.href)) {
        allLinks.set(p.href, p);
        newCount++;
      }
    }
    console.log(`${places.length} found (${newCount} new, total ${allLinks.size})`);
    await sleep(800);
  }

  console.log(`\n✓ ${allLinks.size} unique places collected. Fetching details...\n`);

  // ── Phase 2: get full details for each place ──────────────────
  const detailed = [];
  let idx = 0;

  for (const [href, basic] of allLinks) {
    idx++;
    process.stdout.write(`  [${idx}/${allLinks.size}] ${basic.name.slice(0,45).padEnd(45)} `);

    const detail = await getPlaceDetails(page, href);

    if (!detail) { console.log('✗ fetch failed'); continue; }

    const lat = detail.lat || basic.lat;
    const lng = detail.lng || basic.lng;

    if (!lat || !lng) { console.log('✗ no coords'); continue; }

    const dist = distKm(lat, lng);
    if (dist > 14) { console.log(`✗ too far (${dist.toFixed(1)}km)`); continue; }

    detailed.push({
      title:         detail.title || basic.name,
      latitude:      lat,
      longitude:     lng,
      category:      detail.category || basic.category || '',
      address:       detail.address || basic.address || '',
      phone:         detail.phone || '',
      website:       detail.website || '',
      review_rating: detail.review_rating ?? basic.rating ?? null,
      review_count:  detail.review_count || basic.reviewCount || 0,
      link:          detail.link || href,
      place_id:      detail.place_id || '',
      descriptions:  detail.descriptions || '',
      distKm:        parseFloat(dist.toFixed(2)),
    });

    console.log(`✓  ${dist.toFixed(1)}km  ★${(detail.review_rating ?? '?')}`);
    await sleep(500 + Math.random() * 500);
  }

  await browser.close();

  // ── Phase 3: sort by distance ─────────────────────────────────
  detailed.sort((a, b) => a.distKm - b.distKm);
  fs.writeFileSync(OUTPUT, JSON.stringify(detailed, null, 2));

  console.log(`\n✅ Scraped ${detailed.length} places → scraped_raw.json`);
  if (detailed[0]) console.log(`   Closest: ${detailed[0].title} (${detailed[0].distKm}km)`);
  console.log('\n   Next step: node import_scraped.js scraped_raw.json --append\n');
})();
