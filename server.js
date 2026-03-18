const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE  = path.join(__dirname, 'data', 'accommodations.json');
const TUBE_CACHE = path.join(__dirname, 'tube_cache.json');
const USERS_DIR  = path.join(__dirname, 'data', 'users');

if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });

// Seed accommodations.json from repo if volume is new/empty.
// seed_accommodations.json lives at the project root (outside /data) so it's
// always accessible even when a volume is mounted at /app/data.
if (!fs.existsSync(DATA_FILE)) {
  const seedPath = path.join(__dirname, 'seed_accommodations.json');
  if (fs.existsSync(seedPath)) {
    fs.writeFileSync(DATA_FILE, fs.readFileSync(seedPath));
  }
}

app.use(cors());
app.use(express.json());
// NOTE: express.static is registered AFTER all API routes (see bottom of file)

// ── helpers ────────────────────────────────────────────────────
const readAccommodations = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeAccommodations = d => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

// Username: 1–50 chars, no path separators or null bytes
const validUsername = u => typeof u === 'string' && u.length >= 1 && u.length <= 50
  && !/[/\\.\x00]/.test(u);
const safeFilename  = u => u.replace(/[^a-zA-Z0-9_\-]/g, '_');
const userFile      = u => path.join(USERS_DIR, `${safeFilename(u)}.json`);

const DEFAULT_STATE = () => ({
  favourites: [],   // [accId, ...]
  dismissed:  [],   // [accId, ...]
  details: {}       // { accId: { note, roomType, rating } }
});

function readUser(username) {
  const f = userFile(username);
  if (!fs.existsSync(f)) return DEFAULT_STATE();
  try {
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    // back-compat: migrate old `notes` field
    if (s.notes && !s.details) {
      s.details = {};
      for (const [id, text] of Object.entries(s.notes)) {
        s.details[id] = { note: text, roomType: '', rating: 0 };
      }
      delete s.notes;
    }
    if (!s.details) s.details = {};
    return s;
  } catch { return DEFAULT_STATE(); }
}

function writeUser(username, state) {
  fs.writeFileSync(userFile(username), JSON.stringify(state, null, 2));
}

// ── Accommodation routes ────────────────────────────────────────
app.get('/api/accommodations', (_req, res) => res.json(readAccommodations()));

app.post('/api/accommodations', (req, res) => {
  const data = readAccommodations();
  const b    = req.body;
  if (!b.name || !b.type || isNaN(parseFloat(b.lat)) || isNaN(parseFloat(b.lng)))
    return res.status(400).json({ error: 'name, type, lat, lng required' });

  const entry = {
    id: data.reduce((m, a) => Math.max(m, a.id), 0) + 1,
    name:          String(b.name).trim(),
    type:          String(b.type),
    address:       String(b.address   || '').trim(),
    lat:           parseFloat(b.lat),
    lng:           parseFloat(b.lng),
    pricePerWeek:  parseInt(b.pricePerWeek, 10) || 0,
    priceNote:     String(b.priceNote  || '').trim(),
    availableFrom: String(b.availableFrom || ''),
    availableTo:   String(b.availableTo   || ''),
    zone:          parseInt(b.zone, 10) || 1,
    url:            String(b.url            || '').trim(),
    phone:          String(b.phone          || '').trim(),
    notes:          String(b.notes          || '').trim(),
    googleMapsLink: String(b.googleMapsLink || '').trim(),
  };
  data.push(entry);
  writeAccommodations(data);
  res.status(201).json(entry);
});

// ── Update (patch) accommodation ────────────────────────────────
app.patch('/api/accommodations/:id', (req, res) => {
  const id   = parseInt(req.params.id, 10);
  const data = readAccommodations();
  const idx  = data.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const b = req.body, e = data[idx];
  const str = (v, fb = '') => v !== undefined ? String(v).trim() : fb;
  if (b.name         !== undefined) e.name          = str(b.name);
  if (b.type         !== undefined) e.type          = str(b.type);
  if (b.address      !== undefined) e.address       = str(b.address);
  if (b.lat          !== undefined) e.lat           = parseFloat(b.lat);
  if (b.lng          !== undefined) e.lng           = parseFloat(b.lng);
  if (b.pricePerWeek !== undefined) e.pricePerWeek  = parseInt(b.pricePerWeek, 10) || 0;
  if (b.priceNote    !== undefined) e.priceNote     = str(b.priceNote);
  if (b.availableFrom !== undefined) e.availableFrom = str(b.availableFrom);
  if (b.availableTo   !== undefined) e.availableTo   = str(b.availableTo);
  if (b.zone         !== undefined) e.zone          = parseInt(b.zone, 10) || 1;
  if (b.url          !== undefined) e.url           = str(b.url);
  if (b.notes        !== undefined) e.notes         = str(b.notes);
  if (b.phone        !== undefined) e.phone         = str(b.phone);
  if (b.googleMapsLink !== undefined) e.googleMapsLink = str(b.googleMapsLink);
  writeAccommodations(data);
  res.json(e);
});

// ── Delete accommodation ─────────────────────────────────────────
app.delete('/api/accommodations/:id', (req, res) => {
  const id  = parseInt(req.params.id, 10);
  const data = readAccommodations();
  const idx  = data.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.splice(idx, 1);
  writeAccommodations(data);
  res.json({ ok: true });
});


// ── Resolve Google Maps URL → name + coords + website ───────────
app.get('/api/resolve-maps', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-GB,en;q=0.9',
      }
    });
    const finalUrl = response.url;
    const html = await response.text();

    // Coordinates from @lat,lng,zoom in URL
    const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const lat = coordMatch ? parseFloat(coordMatch[1]) : null;
    const lng = coordMatch ? parseFloat(coordMatch[2]) : null;

    // Place name from URL path  /maps/place/NAME/@...
    const nameMatch = finalUrl.match(/\/maps\/place\/([^/@?&]+)/);
    let name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : null;

    // Fallback: page <title>
    if (!name) {
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (t) name = t[1].split(/\s*[-–|]\s*/)[0].trim();
    }

    // Try to pull website from embedded JSON
    const webMatch = html.match(/"website":"(https?:[^"]+)"/);
    const website = webMatch ? webMatch[1].replace(/\\u003d/g,'=').replace(/\\u0026/g,'&') : null;

    // Address
    const addrMatch = html.match(/"formatted_address"\s*:\s*"([^"]+)"/);
    const address = addrMatch ? addrMatch[1] : null;

    res.json({ lat, lng, name, website, address, finalUrl });
  } catch (e) {
    res.status(500).json({ error: 'Could not resolve URL: ' + e.message });
  }
});

// ── Tube data ───────────────────────────────────────────────────
app.get('/api/tube-data', (req, res) => {
  if (!fs.existsSync(TUBE_CACHE))
    return res.status(503).json({ error: 'Run: node build_tube_cache.js' });
  res.sendFile(TUBE_CACHE);
});

// ── User: get / list users ─────────────────────────────────────
app.get('/api/users', (_req, res) => {
  const users = fs.readdirSync(USERS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
  res.json(users);
});

app.get('/api/users/:username', (req, res) => {
  if (!validUsername(req.params.username))
    return res.status(400).json({ error: 'Invalid username' });
  res.json(readUser(req.params.username));
});

// ── User: toggle favourite ─────────────────────────────────────
app.post('/api/users/:username/favourite/:accId', (req, res) => {
  if (!validUsername(req.params.username)) return res.status(400).json({ error: 'Invalid username' });
  const id    = parseInt(req.params.accId, 10);
  const state = readUser(req.params.username);
  const idx   = state.favourites.indexOf(id);
  if (idx === -1) state.favourites.push(id); else state.favourites.splice(idx, 1);
  writeUser(req.params.username, state);
  res.json(state);
});

// ── User: toggle dismissed (cross out for this user only) ──────
app.post('/api/users/:username/dismiss/:accId', (req, res) => {
  if (!validUsername(req.params.username)) return res.status(400).json({ error: 'Invalid username' });
  const id    = parseInt(req.params.accId, 10);
  const state = readUser(req.params.username);
  const idx   = state.dismissed.indexOf(id);
  if (idx === -1) state.dismissed.push(id); else state.dismissed.splice(idx, 1);
  writeUser(req.params.username, state);
  res.json(state);
});

// ── User: save personal details (note + roomType + rating) ─────
app.put('/api/users/:username/details/:accId', (req, res) => {
  if (!validUsername(req.params.username)) return res.status(400).json({ error: 'Invalid username' });
  const id    = req.params.accId;
  const state = readUser(req.params.username);
  const existing = state.details[id] || { note: '', roomType: '', rating: 0 };
  state.details[id] = {
    note:     req.body.note     !== undefined ? String(req.body.note).trim()     : existing.note,
    roomType: req.body.roomType !== undefined ? String(req.body.roomType).trim() : existing.roomType,
    rating:   req.body.rating   !== undefined ? Math.min(5, Math.max(0, parseInt(req.body.rating, 10) || 0)) : existing.rating,
  };
  // Clean up if all empty
  const d = state.details[id];
  if (!d.note && !d.roomType && d.rating === 0) delete state.details[id];
  writeUser(req.params.username, state);
  res.json(state);
});

// Serve static files AFTER all API routes so they never shadow /api/*
app.use(express.static(__dirname));

app.listen(PORT, () => console.log(`\n  Accommodation tracker → http://localhost:${PORT}\n`));
