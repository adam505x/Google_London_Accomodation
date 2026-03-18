// ═══════════════════════════════════════════════════════════════
//  import_scraped.js
//  Converts google-maps-scraper JSON output → data/accommodations.json
//
//  Usage:
//    node import_scraped.js scraped.json
//    node import_scraped.js scraped.json --append   (keep existing entries)
// ═══════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const inputFile  = process.argv[2];
const appendMode = process.argv.includes('--append');
const OUTPUT     = path.join(__dirname, 'data', 'accommodations.json');

if (!inputFile) {
  console.error('Usage: node import_scraped.js <scraped.json> [--append]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// ── Helpers ─────────────────────────────────────────────────────
const HQ = { lat: 51.5332, lng: -0.1238 };

function estimateZone(lat, lng) {
  // Rough km distance from HQ using flat-earth approx
  const dlat = (lat - HQ.lat) * 111;
  const dlng = (lng - HQ.lng) * 71;
  const dist  = Math.sqrt(dlat * dlat + dlng * dlng);
  if (dist < 2.8) return 1;
  if (dist < 6.5) return 2;
  if (dist < 12)  return 3;
  return 4;
}

function mapType(category) {
  if (!category) return 'private';
  const c = category.toLowerCase();
  if (c.includes('university') || c.includes('college') || c.includes('student housing'))
    return 'university';
  if (c.includes('hostel') || c.includes('hotel') || c.includes('serviced') ||
      c.includes('short') || c.includes('bed and breakfast'))
    return 'short-term';
  return 'private';
}

function priceFromRange(priceRange) {
  if (!priceRange) return 0;
  const tiers = { '$': 150, '$$': 250, '$$$': 400, '$$$$': 600 };
  return tiers[priceRange.trim()] || 0;
}

// ── Deduplicate by coords (3dp), then place_id, then title+address ──
const seen     = new Set();
const entries  = [];

for (const r of raw) {
  if (!r.title || !r.latitude || !r.longitude) continue;

  const lat3 = parseFloat(r.latitude).toFixed(3);
  const lng3 = parseFloat(r.longitude).toFixed(3);
  const coordKey = `${lat3}|${lng3}`;
  // Also key by name+coordKey so same building under different names isn't merged
  const nameCoordKey = `${(r.title||'').toLowerCase().replace(/\s+/g,'').slice(0,20)}|${coordKey}`;
  const key = nameCoordKey;
  if (seen.has(key)) continue;
  seen.add(key);

  // Skip irrelevant categories (e.g. pubs, restaurants that happen to match)
  const cat = (r.category || '').toLowerCase();
  const relevantTerms = ['student', 'accommodation', 'hall', 'residence', 'housing',
                         'hostel', 'flat', 'apartment', 'room', 'lodge', 'stay',
                         'dormitory', 'dorm', 'private', 'rental', 'real estate'];
  const isRelevant = relevantTerms.some(t => cat.includes(t)) ||
                     (r.title || '').toLowerCase().includes('student') ||
                     (r.title || '').toLowerCase().includes('accommodation') ||
                     (r.title || '').toLowerCase().includes('hall') ||
                     (r.title || '').toLowerCase().includes('residence');
  if (!isRelevant) continue;

  const lat = parseFloat(r.latitude);
  const lng = parseFloat(r.longitude);

  // Clean address — discard Google photo label artefacts
  let addr = (r.complete_address || r.address || '').trim();
  if (addr.toLowerCase().startsWith('photo of') || addr.length < 5) addr = '';

  entries.push({
    name:          r.title.trim(),
    type:          mapType(r.category),
    address:       addr,
    lat,
    lng,
    pricePerWeek:  priceFromRange(r.price_range),
    priceNote:     r.price_range ? `Google price indicator: ${r.price_range}` : '',
    availableFrom: '',
    availableTo:   '',
    zone:          estimateZone(lat, lng),
    url:           (r.website || r.link || '').trim(),
    phone:         (r.phone || '').trim(),
    notes:         [
      r.descriptions ? r.descriptions.slice(0, 200) : '',
      r.review_rating ? `⭐ ${r.review_rating}/5 (${r.review_count || 0} reviews)` : '',
    ].filter(Boolean).join(' | '),
    googleMapsLink: (r.link || '').trim(),
    placeId:        (r.place_id || '').trim(),
    distKm:         r.distKm || null,
    googleRating:   r.review_rating || null,
    googleReviews:  r.review_count || 0,
  });
}

// ── Merge with existing if --append ─────────────────────────────
let existing = [];
if (appendMode && fs.existsSync(OUTPUT)) {
  existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
}

// Give sequential IDs
const startId = existing.length
  ? existing.reduce((m, a) => Math.max(m, a.id), 0) + 1
  : 1;

// Sort new entries by proximity before assigning IDs
entries.sort((a, b) => (a.distKm || 99) - (b.distKm || 99));

const final = [
  ...existing,
  ...entries.map((e, i) => ({ id: startId + i, ...e })),
];

fs.writeFileSync(OUTPUT, JSON.stringify(final, null, 2));

console.log(`\n  ✓ Imported ${entries.length} accommodations (${final.length} total)`);
console.log(`  → Zones: Z1=${final.filter(a=>a.zone===1).length}  Z2=${final.filter(a=>a.zone===2).length}  Z3=${final.filter(a=>a.zone===3).length}  Z4+=${final.filter(a=>a.zone>=4).length}`);
console.log(`  → Types: university=${final.filter(a=>a.type==='university').length}  private=${final.filter(a=>a.type==='private').length}  short-term=${final.filter(a=>a.type==='short-term').length}\n`);
