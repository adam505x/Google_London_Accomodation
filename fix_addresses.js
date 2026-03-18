// fix_addresses.js — fills missing addresses via OSM Nominatim reverse geocoding
// Usage: node fix_addresses.js

const fs = require('fs');
const path = require('path');
const https = require('https');

const FILE = path.join(__dirname, 'data', 'accommodations.json');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'LondonAccomTracker/1.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const missing = data.filter(a => !a.address);
  console.log(`Filling ${missing.length} missing addresses via Nominatim...\n`);

  let fixed = 0;
  for (const entry of missing) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${entry.lat}&lon=${entry.lng}&format=json`;
    try {
      const result = await get(url);
      if (result && result.display_name) {
        // Format: "number road, neighbourhood, London, postcode"
        const r = result.address || {};
        const parts = [
          r.house_number ? `${r.house_number} ${r.road || ''}` : (r.road || r.pedestrian || ''),
          r.neighbourhood || r.suburb || r.city_district || '',
          'London',
          r.postcode || '',
        ].map(s => s.trim()).filter(Boolean);
        const addr = parts.join(', ');
        if (addr && addr.length > 5) {
          entry.address = addr;
          fixed++;
          console.log(`  ✓ ${entry.name.slice(0,45).padEnd(45)} → ${addr.slice(0,50)}`);
        }
      }
    } catch (e) {
      console.log(`  ✗ ${entry.name} (fetch error)`);
    }
    // Nominatim rate limit: max 1 request/second
    await sleep(1100);
  }

  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  console.log(`\n✅ Fixed ${fixed}/${missing.length} addresses`);
})();
