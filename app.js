// ═══════════════════════════════════════════════════════════════
//  London Accommodation Tracker
// ═══════════════════════════════════════════════════════════════

const API = '/api/accommodations';
const HQ  = { lat: 51.5332, lng: -0.1238 };

// ── Login / current user ────────────────────────────────────────
let currentUser = localStorage.getItem('acc_username') || null;

// ── Zone polygons ───────────────────────────────────────────────
const ZONE_DATA = {
  'Zone 1': {
    color: '#1a73e8',
    rings: [[[51.513657,-0.202732],[51.48956,-0.19801],[51.4839925,-0.1481165],[51.472717,-0.1380859],[51.4788263,-0.1225786],[51.4882749,-0.1056539],[51.50639,-0.06866],[51.517556,-0.068579],[51.534964,-0.099821],[51.534484,-0.126858],[51.513657,-0.202732]]]
  },
  'Zone 2': {
    color: '#34a853',
    rings: [
      [[51.5187317,-0.0090073],[51.5247033,-0.0205118],[51.533272,-0.0179485],[51.5454067,-0.0232524],[51.56162,-0.05707],[51.56914,-0.07317],[51.57077,-0.09583],[51.56525,-0.13514],[51.5566,-0.17827],[51.54919,-0.22221],[51.523538,-0.259981],[51.49514,-0.25453],[51.46144,-0.21663],[51.45884,-0.21114],[51.45264,-0.14801],[51.45328,-0.10179],[51.45446,-0.08789],[51.46543,-0.01364],[51.46882,-0.01669],[51.47446,-0.02257],[51.47822,-0.0148],[51.482131,-0.01133],[51.4980226,0.002868],[51.5086754,-0.0041017],[51.5187317,-0.0090073]],
      [[51.513657,-0.202732],[51.48956,-0.19801],[51.4839925,-0.1481165],[51.472717,-0.1380859],[51.4788263,-0.1225786],[51.4882749,-0.1056539],[51.50639,-0.06866],[51.517556,-0.068579],[51.534964,-0.099821],[51.534484,-0.126858],[51.513657,-0.202732]]
    ]
  },
  'Zone 3': {
    color: '#fbbc04',
    rings: [
      [[51.4920397,0.0624864],[51.5393698,0.0510659],[51.5492795,0.0446463],[51.5525995,0.0464911],[51.568325,0.008221],[51.5842907,-0.0114561],[51.6054056,-0.0525261],[51.609704,-0.0696447],[51.607143,-0.1204531],[51.6071396,-0.1243025],[51.5941421,-0.176716],[51.583202,-0.226399],[51.5801178,-0.2386251],[51.5585413,-0.2645426],[51.5474463,-0.2864461],[51.5332202,-0.2913794],[51.533114,-0.3086692],[51.5126634,-0.3295458],[51.4979435,-0.3205531],[51.4899594,-0.2999372],[51.4770818,-0.2851522],[51.4703843,-0.2870296],[51.4661132,-0.2896845],[51.4640342,-0.2941413],[51.4147946,-0.2161565],[51.4091396,-0.2179797],[51.406322,-0.2101046],[51.4153355,-0.1921526],[51.4100422,-0.1527338],[51.4066159,-0.1116639],[51.4180795,-0.0725436],[51.4225952,-0.0567242],[51.4335633,-0.028513],[51.42876,-0.0180164],[51.4419356,0.00932],[51.4450419,0.0336043],[51.4581542,0.039306],[51.4920397,0.0624864]],
      [[51.5187317,-0.0090073],[51.5247033,-0.0205118],[51.533272,-0.0179485],[51.5454067,-0.0232524],[51.56162,-0.05707],[51.56914,-0.07317],[51.57077,-0.09583],[51.56525,-0.13514],[51.5566,-0.17827],[51.54919,-0.22221],[51.523538,-0.259981],[51.49514,-0.25453],[51.46144,-0.21663],[51.45884,-0.21114],[51.45264,-0.14801],[51.45328,-0.10179],[51.45446,-0.08789],[51.46543,-0.01364],[51.46882,-0.01669],[51.47446,-0.02257],[51.47822,-0.0148],[51.482131,-0.01133],[51.4980226,0.002868],[51.5086754,-0.0041017],[51.5187317,-0.0090073]]
    ]
  }
};

// ── State ────────────────────────────────────────────────────────
let allAccommodations = [];
let userState = { favourites: [], dismissed: [], details: {} };
let markers = {};
let activeCardId = null;
let map;
let tubeLayerGroup = null;
const zoneLayers = {};
let currentView = 'map'; // 'map' | 'list'
let listSort = { field: 'price', dir: 'asc' };
let showEuro = false;
let editingId = null;
const EUR_RATE = 1.18;

function distKmCalc(lat, lng) {
  const R = 6371;
  const dLat = (lat - HQ.lat) * Math.PI / 180;
  const dLng = (lng - HQ.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(HQ.lat * Math.PI/180) * Math.cos(lat * Math.PI/180) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const filters = {
  type: 'all', dist: 'all', priceMin: 0, priceMax: 800,
  dateFrom: '', dateTo: '', favouritesOnly: false, showDismissed: false,
  search: ''
};

// ── Bootstrap ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!currentUser) {
    showLoginOverlay();
    return;
  }
  initApp();
});

// ── Login ────────────────────────────────────────────────────────
async function showLoginOverlay() {
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('loginForm').addEventListener('submit', handleLogin);

  // Load existing users for quick-pick
  try {
    const res = await fetch('/api/users');
    const users = await res.json();
    if (users.length > 0) {
      const listEl = document.getElementById('loginUserList');
      const btnsEl = document.getElementById('loginUserButtons');
      btnsEl.innerHTML = users.map(u =>
        `<button type="button" class="btn-quick-user" onclick="quickLogin('${esc(u)}')">${esc(u)}</button>`
      ).join('');
      listEl.classList.remove('hidden');
    }
  } catch { /* no users yet */ }
}

function quickLogin(name) {
  currentUser = name;
  localStorage.setItem('acc_username', name);
  document.getElementById('loginOverlay').classList.add('hidden');
  initApp();
}

function handleLogin(e) {
  e.preventDefault();
  const input = document.getElementById('loginUsername');
  const name = input.value.trim();
  if (!/^[a-zA-Z0-9_\- ]{1,30}$/.test(name)) {
    const err = document.getElementById('loginError');
    err.textContent = 'Name must be 1–30 characters (letters, numbers, spaces, _ -)';
    err.classList.remove('hidden');
    return;
  }
  currentUser = name;
  localStorage.setItem('acc_username', name);
  document.getElementById('loginOverlay').classList.add('hidden');
  initApp();
}

function logoutUser() {
  localStorage.removeItem('acc_username');
  location.reload();
}

async function initApp() {
  document.getElementById('currentUserLabel').textContent = currentUser;
  document.getElementById('userDisplay').classList.remove('hidden');
  initMap();
  bindEvents();
  await Promise.all([loadAccommodations(), loadUserState()]);
  renderAll();
  loadTubeData();
}

// ── View toggle ──────────────────────────────────────────────────
function setView(view) {
  currentView = view;
  document.getElementById('mainMapView').classList.toggle('hidden', view !== 'map');
  document.getElementById('mainListView').classList.toggle('hidden', view !== 'list');
  document.getElementById('btnMapView').classList.toggle('active', view === 'map');
  document.getElementById('btnListView').classList.toggle('active', view === 'list');
  document.getElementById('filterBar2').classList.toggle('hidden', view !== 'map');
  if (view === 'list') renderListView(getFilteredForList());
  if (view === 'map') setTimeout(() => map.invalidateSize(), 50);
}

// ── Map ──────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map').setView([HQ.lat, HQ.lng], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  for (const [name, def] of Object.entries(ZONE_DATA)) {
    zoneLayers[name] = L.polygon(def.rings, {
      color: def.color, weight: 2.5, opacity: 0.9,
      fillColor: def.color, fillOpacity: 0.07, dashArray: '5 4',
    }).bindTooltip(name, { sticky: true, className: 'zone-tooltip' });
  }
  zoneLayers['Zone 1'].addTo(map);
  zoneLayers['Zone 2'].addTo(map);

  L.marker([HQ.lat, HQ.lng], {
    icon: L.divIcon({ html: `<div class="hq-marker">🏢</div>`, className: '', iconSize: [36, 36], iconAnchor: [18, 18] }),
    zIndexOffset: 9999
  }).addTo(map).bindPopup(`
    <div class="popup-content">
      <div class="popup-name">🏢 Google London HQ</div>
      <div class="popup-address">6 Pancras Square, London N1C 4AG</div>
      <div style="margin-top:6px;color:#1a73e8;font-weight:600;font-size:13px;">Your workplace this summer 🎉</div>
    </div>`, { maxWidth: 260 });
}

// ── Tube data ─────────────────────────────────────────────────────
async function loadTubeData() {
  try {
    const res = await fetch('/api/tube-data');
    if (!res.ok) return;
    const data = await res.json();
    drawTubeLayers(data);
    if (document.getElementById('chkTube').checked) tubeLayerGroup.addTo(map);
  } catch (e) {
    console.warn('Tube data unavailable:', e.message);
  }
}

function drawTubeLayers(data) {
  tubeLayerGroup = L.layerGroup();

  for (const [lineId, sequences] of Object.entries(data.lineRoutes || {})) {
    const color = data.lineColors[lineId] || '#888';
    for (const seq of sequences) {
      if (seq.length < 2) continue;
      L.polyline(seq, { color, weight: 4, opacity: 0.95, lineJoin: 'round', lineCap: 'round' })
        .addTo(tubeLayerGroup)
        .bindTooltip(data.lineNames[lineId] || lineId, { sticky: true, className: 'zone-tooltip' });
    }
  }

  for (const station of data.stations || []) {
    const primaryLine = station.lines?.[0];
    const color = primaryLine ? (data.lineColors[primaryLine] || '#555') : '#555';
    const isInterchange = station.lines?.length > 1;

    const circle = L.circleMarker([station.lat, station.lng], {
      radius: isInterchange ? 6 : 4,
      color: '#fff', weight: isInterchange ? 2.5 : 1.5,
      fillColor: color, fillOpacity: 1, pane: 'markerPane',
    });

    const linesList = (station.lines || [])
      .map(id => `<span style="color:${data.lineColors[id]};font-weight:700;">${data.lineNames[id] || id}</span>`)
      .join(', ');
    circle.bindTooltip(
      `<div style="font-size:12px;"><strong>${station.name}</strong><br>${linesList}</div>`,
      { sticky: true, className: 'tube-station-tooltip' }
    );
    circle.addTo(tubeLayerGroup);
  }
}

// ── API ───────────────────────────────────────────────────────────
async function loadAccommodations() {
  try {
    const res = await fetch(API);
    allAccommodations = await res.json();
  } catch {
    showError('Cannot connect to server. Run <code>npm start</code> first.');
  }
}

async function loadUserState() {
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    userState = {
      favourites: data.favourites || [],
      dismissed:  data.dismissed  || [],
      details:    data.details    || {},
    };
  } catch {
    userState = { favourites: [], dismissed: [], details: {} };
  }
}

async function toggleFavourite(id) {
  const res = await fetch(`/api/users/${encodeURIComponent(currentUser)}/favourite/${id}`, { method: 'POST' });
  const data = await res.json();
  userState = { favourites: data.favourites || [], dismissed: data.dismissed || [], details: data.details || {} };
  renderAll();
}

async function toggleDismiss(id) {
  const res = await fetch(`/api/users/${encodeURIComponent(currentUser)}/dismiss/${id}`, { method: 'POST' });
  const data = await res.json();
  userState = { favourites: data.favourites || [], dismissed: data.dismissed || [], details: data.details || {} };
  renderAll();
}

async function saveDetails(id, patch) {
  const existing = userState.details[String(id)] || { note: '', roomType: '', rating: 0 };
  const merged = { ...existing, ...patch };
  const res = await fetch(`/api/users/${encodeURIComponent(currentUser)}/details/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(merged),
  });
  const data = await res.json();
  userState = { favourites: data.favourites || [], dismissed: data.dismissed || [], details: data.details || {} };
}

async function setRating(id, rating) {
  const current   = userState.details[String(id)]?.rating || 0;
  const newRating = current === rating ? 0 : rating;
  try {
    await saveDetails(id, { rating: newRating });
    renderAll();
    if (markers[id] && markers[id].isPopupOpen()) {
      markers[id].setPopupContent(buildPopup(allAccommodations.find(a => a.id === id)));
    }
  } catch (e) {
    showToast('Could not save rating – is the server running?', 'error');
  }
}

async function deleteAccommodation(id) {
  const acc = allAccommodations.find(a => a.id === id);
  if (!acc || !confirm(`Permanently delete "${acc.name}" for everyone?`)) return;
  try {
    await fetch(`${API}/${id}`, { method: 'DELETE' });
    allAccommodations = allAccommodations.filter(a => a.id !== id);
    map.closePopup();
    renderAll();
  } catch (e) {
    showToast('Could not delete – is the server running?', 'error');
  }
}

// ── Google Maps URL import ────────────────────────────────────────
async function importFromMapsUrl() {
  const input = document.getElementById('mapsImportUrl');
  const url   = input.value.trim();
  if (!url) return;

  const btn = document.getElementById('btnImport');
  btn.textContent = 'Importing…';
  btn.disabled = true;

  try {
    const res  = await fetch(`/api/resolve-maps?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (data.name) document.getElementById('f-name').value    = data.name;
    if (data.lat)  document.getElementById('f-lat').value     = data.lat;
    if (data.lng)  document.getElementById('f-lng').value     = data.lng;
    if (data.website) document.getElementById('f-url').value  = data.website;
    if (data.address) document.getElementById('f-address').value = data.address;

    document.getElementById('importStatus').textContent =
      data.lat ? `✓ Found: ${data.name || 'Unknown'} (${data.lat.toFixed(4)}, ${data.lng.toFixed(4)})` : '⚠ Could not extract coordinates – fill in manually';
    document.getElementById('importStatus').className = 'import-status ' + (data.lat ? 'ok' : 'warn');
  } catch (e) {
    document.getElementById('importStatus').textContent = '✗ ' + e.message;
    document.getElementById('importStatus').className = 'import-status error';
  } finally {
    btn.textContent = 'Import';
    btn.disabled = false;
  }
}

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('toast-show'), 10);
  setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ── Rendering ─────────────────────────────────────────────────────
function renderAll() {
  const filtered     = getFiltered();
  const filteredList = getFilteredForList();
  renderMarkers(filtered);
  renderCards(filtered);
  if (currentView === 'list') renderListView(filteredList);
  const total = allAccommodations.filter(a =>
    filters.showDismissed || !userState.dismissed.includes(a.id)
  ).length;
  const countText = `${filtered.length} of ${total} results`;
  document.getElementById('resultCount').textContent = countText;
  document.getElementById('listResultCount').textContent =
    `${filteredList.length} accommodations (dismissed shown crossed out)`;
}

// Map/sidebar filter – hides dismissed by default
function getFiltered() {
  return allAccommodations.filter(a => {
    if (!filters.showDismissed && userState.dismissed.includes(a.id)) return false;
    if (filters.favouritesOnly && !userState.favourites.includes(a.id)) return false;
    if (filters.type === 'none') return false;
    if (filters.type !== 'all' && a.type !== filters.type) return false;
    if (filters.dist === 'none') return false;
    if (filters.dist !== 'all') {
      const d = a.distKm != null ? a.distKm : distKmCalc(a.lat, a.lng);
      if (d > parseFloat(filters.dist)) return false;
    }
    if (a.pricePerWeek < filters.priceMin || a.pricePerWeek > filters.priceMax) return false;
    if (filters.dateFrom && a.availableTo && a.availableTo < filters.dateFrom) return false;
    if (filters.dateTo && a.availableFrom && a.availableFrom > filters.dateTo) return false;
    return true;
  });
}

// List view filter – always includes dismissed (shown crossed out)
function getFilteredForList() {
  const arr = allAccommodations.filter(a => {
    if (filters.favouritesOnly && !userState.favourites.includes(a.id)) return false;
    if (filters.type === 'none') return false;
    if (filters.type !== 'all' && a.type !== filters.type) return false;
    if (filters.dist === 'none') return false;
    if (filters.dist !== 'all') {
      const d = a.distKm != null ? a.distKm : distKmCalc(a.lat, a.lng);
      if (d > parseFloat(filters.dist)) return false;
    }
    if (a.pricePerWeek < filters.priceMin || a.pricePerWeek > filters.priceMax) return false;
    if (filters.dateFrom && a.availableTo && a.availableTo < filters.dateFrom) return false;
    if (filters.dateTo && a.availableFrom && a.availableFrom > filters.dateTo) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!a.name.toLowerCase().includes(q) && !(a.address || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
  arr.sort((a, b) => {
    let va, vb;
    if (listSort.field === 'price') {
      va = a.pricePerWeek; vb = b.pricePerWeek;
    } else if (listSort.field === 'dist') {
      va = a.distKm != null ? a.distKm : distKmCalc(a.lat, a.lng);
      vb = b.distKm != null ? b.distKm : distKmCalc(b.lat, b.lng);
    } else {
      va = userState.details[String(a.id)]?.rating || 0;
      vb = userState.details[String(b.id)]?.rating || 0;
    }
    return listSort.dir === 'asc' ? va - vb : vb - va;
  });
  return arr;
}

function starsHtml(id, rating, size = 'sm') {
  return [1,2,3,4,5].map(n =>
    `<span class="star star-${size} ${n <= rating ? 'filled' : ''}" onclick="setRating(${id}, ${n})" title="${n} star${n>1?'s':''}">${n <= rating ? '★' : '☆'}</span>`
  ).join('');
}

function makeIcon(type, isFav, isDismissed) {
  const colours = { university: '#9c27b0', private: '#1a73e8', 'short-term': '#f57c00' };
  const c = isDismissed ? '#bdc1c6' : (colours[type] || '#607d8b');
  const border = isFav ? '#fbbc04' : '#fff';
  const bw = isFav ? 3 : 2;
  return L.divIcon({
    html: `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:${c};transform:rotate(-45deg);border:${bw}px solid ${border};box-shadow:0 2px 6px rgba(0,0,0,.4);opacity:${isDismissed?0.5:1}"></div>`,
    className: '', iconSize: [20, 20], iconAnchor: [10, 20], popupAnchor: [0, -24],
  });
}

function buildPopup(acc) {
  const isFav   = userState.favourites.includes(acc.id);
  const isDis   = userState.dismissed.includes(acc.id);
  const det     = userState.details[String(acc.id)] || { note: '', roomType: '', rating: 0 };
  const dateStr = acc.availableFrom
    ? `${fmtDate(acc.availableFrom)} – ${fmtDate(acc.availableTo)}` : 'Dates TBC';

  return `<div class="popup-content">
    <div class="popup-toprow">
      <div class="popup-name">${esc(acc.name)}</div>
      <button class="popup-fav ${isFav?'is-fav':''}" onclick="toggleFavourite(${acc.id})" title="${isFav?'Unfavourite':'Favourite'}">${isFav?'★':'☆'}</button>
    </div>
    <div class="popup-address">📍 ${esc(acc.address)}</div>
    <div class="popup-price">£${acc.pricePerWeek}<span class="popup-price-sub">/week</span></div>
    ${acc.priceNote ? `<div class="popup-price-note">${esc(acc.priceNote)}</div>` : ''}
    <div class="popup-meta">Zone ${acc.zone} · ${capitalize(acc.type)}</div>
    <div class="popup-dates">📅 ${dateStr}</div>
    ${acc.phone ? `<div class="popup-phone">📞 ${esc(acc.phone)}</div>` : ''}
    ${acc.url ? `<a class="popup-link" href="${esc(acc.url)}" target="_blank" rel="noopener">Book / View ↗</a>` : ''}
    ${acc.googleMapsLink ? `<a class="popup-link" href="${esc(acc.googleMapsLink)}" target="_blank" rel="noopener">📍 Google Maps ↗</a>` : ''}
    ${acc.notes ? `<div class="popup-shared-notes">${esc(acc.notes)}</div>` : ''}

    <div class="popup-details-section">
      <div class="popup-detail-row">
        <div class="popup-note-label">⭐ My Rating</div>
        <div class="popup-stars">${starsHtml(acc.id, det.rating, 'md')}</div>
      </div>
      <div class="popup-note-label" style="margin-top:8px">🏠 Room type / options</div>
      <input class="popup-roomtype-input" id="roomtype-${acc.id}" value="${esc(det.roomType)}" placeholder="e.g. En-suite, studio, shared kitchen…" />
      <div class="popup-note-label" style="margin-top:8px">📝 My notes</div>
      <textarea class="popup-note-input" id="note-${acc.id}" rows="5" placeholder="Pricing details, pros/cons, room sizes, transport times…">${esc(det.note)}</textarea>
      <button class="popup-note-save" onclick="saveDetailsFromPopup(${acc.id})">Save</button>
    </div>

    <div class="popup-actions">
      <button class="popup-dismiss ${isDis?'is-dismissed':''}" onclick="toggleDismiss(${acc.id})">${isDis?'↩ Restore':'✗ Not interested'}</button>
      <button class="card-btn-edit" onclick="openEditModal(${acc.id})">✏ Edit</button>
      <button class="popup-delete" onclick="deleteAccommodation(${acc.id})">🗑 Delete for all</button>
    </div>
  </div>`;
}

function renderMarkers(filtered) {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};
  if (filters.type === 'none') return; // hide all dots
  const visible = new Set(filtered.map(a => a.id));
  allAccommodations.forEach(acc => {
    if (!visible.has(acc.id)) return;
    const isFav = userState.favourites.includes(acc.id);
    const isDis = userState.dismissed.includes(acc.id);
    const marker = L.marker([acc.lat, acc.lng], { icon: makeIcon(acc.type, isFav, isDis) })
      .addTo(map)
      .bindPopup(() => buildPopup(acc), { maxWidth: 320, minWidth: 280, maxHeight: 480, autoPanPadding: [20, 20] });
    marker.on('click', () => highlightCard(acc.id));
    markers[acc.id] = marker;
  });
}

function renderCards(filtered) {
  const list = document.getElementById('cardList');
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">No matches.<br><br>
      <button onclick="clearFilters()" class="btn-inline-clear">Clear Filters</button>
    </div>`;
    return;
  }
  list.innerHTML = filtered.map(acc => buildCard(acc, false)).join('');
}

function buildCard(acc, wide = false) {
  const isFav = userState.favourites.includes(acc.id);
  const isDis = userState.dismissed.includes(acc.id);
  const det   = userState.details[String(acc.id)] || { note: '', roomType: '', rating: 0 };
  return `
  <div class="acc-card ${wide ? 'acc-card-wide' : ''} ${acc.id === activeCardId ? 'highlighted' : ''} ${isDis ? 'dismissed-card' : ''}"
       data-id="${acc.id}" onclick="${wide ? '' : `cardClick(${acc.id})`}">
    <div class="card-header">
      <div class="card-name ${isDis ? 'strikethrough' : ''}">${esc(acc.name)}</div>
      <div class="card-badges">
        <span class="type-badge badge-${acc.type}">${capitalize(acc.type)}</span>
        ${isFav ? '<span class="fav-badge">★</span>' : ''}
      </div>
    </div>
    <div class="card-address">📍 ${esc(acc.address)}</div>
    <div class="card-meta">
      <span class="meta-price">${wide ? priceLabel(acc) : `£${acc.pricePerWeek}/wk`}</span>
      <span class="meta-zone">Zone ${acc.zone}</span>
      ${acc.availableFrom ? `<span class="meta-dates">${fmtDate(acc.availableFrom).split(' ').slice(0,2).join(' ')} – ${fmtDate(acc.availableTo).split(' ').slice(0,2).join(' ')}</span>` : ''}
    </div>
    ${acc.priceNote ? `<div class="card-price-note">${esc(acc.priceNote)}</div>` : ''}
    ${det.rating > 0 ? `<div class="card-rating">${starsHtml(acc.id, det.rating, 'sm')}</div>` : ''}
    ${det.roomType ? `<div class="card-room-type">🏠 ${esc(det.roomType)}</div>` : ''}
    ${det.note ? `<div class="card-user-note">📝 ${esc(det.note)}</div>` : ''}
    <div class="card-actions${wide ? ' card-actions-wide' : ''}" onclick="event.stopPropagation()">
      <button class="card-btn-fav ${isFav?'active':''}${wide?' btn-lg':''}" onclick="toggleFavourite(${acc.id})">${isFav?'★ Saved':'☆ Save'}</button>
      <button class="card-btn-dismiss ${isDis?'active':''}${wide?' btn-lg':''}" onclick="toggleDismiss(${acc.id})">${isDis?'↩ Restore':'✗ Dismiss'}</button>
      ${acc.url ? `<a class="card-btn-link${wide?' btn-lg':''}" href="${esc(acc.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Book ↗</a>` : ''}
      ${wide ? `<button class="card-btn-map btn-lg" onclick="goToMap(${acc.id})">🗺 Map</button>` : ''}
      <button class="card-btn-edit${wide?' btn-lg':''}" onclick="openEditModal(${acc.id})">✏ Edit</button>
    </div>
    ${wide ? `
    <div class="card-wide-details" onclick="event.stopPropagation()">
      <div class="cwd-row">
        <span class="cwd-label">⭐ Rating</span>
        <span class="cwd-stars">${starsHtml(acc.id, det.rating, 'md')}</span>
      </div>
      <div class="cwd-row">
        <span class="cwd-label">🏠 Room type</span>
        <input class="cwd-input" id="cwd-roomtype-${acc.id}" value="${esc(det.roomType)}" placeholder="e.g. En-suite, studio…" />
      </div>
      <div class="cwd-row cwd-row-col">
        <span class="cwd-label">📝 Notes</span>
        <textarea class="cwd-textarea" id="cwd-note-${acc.id}" rows="4" placeholder="Pricing details, pros/cons, room sizes, transport times…">${esc(det.note)}</textarea>
      </div>
      <div class="cwd-actions-row">
        <button class="popup-note-save" onclick="saveDetailsFromListView(${acc.id})">Save notes</button>
        <button class="card-btn-delete" onclick="deleteAccommodation(${acc.id})">🗑 Delete for all</button>
      </div>
    </div>` : ''}
  </div>`;
}

function renderListView(filtered) {
  const grid = document.getElementById('listGrid');
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state">No matches. <button onclick="clearFilters()" class="btn-inline-clear">Clear Filters</button></div>`;
    return;
  }
  grid.innerHTML = filtered.map(acc => buildCard(acc, true)).join('');
}

function goToMap(id) {
  setView('map');
  setTimeout(() => cardClick(id), 100);
}

function cardClick(id) {
  activeCardId = id;
  renderCards(getFiltered());
  const acc = allAccommodations.find(a => a.id === id);
  if (!acc) return;
  map.flyTo([acc.lat, acc.lng], 15, { duration: 0.7 });
  if (markers[id]) markers[id].openPopup();
}

function highlightCard(id) {
  activeCardId = id;
  renderCards(getFiltered());
  document.querySelector(`.acc-card[data-id="${id}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function saveDetailsFromPopup(id) {
  const noteEl     = document.getElementById(`note-${id}`);
  const roomtypeEl = document.getElementById(`roomtype-${id}`);
  if (!noteEl) return;
  const noteVal     = noteEl.value.trim();
  const roomTypeVal = roomtypeEl ? roomtypeEl.value.trim() : '';
  saveDetails(id, { note: noteVal, roomType: roomTypeVal })
    .then(() => {
      showToast('Saved ✓', 'ok');
      renderAll();
      if (markers[id] && markers[id].isPopupOpen()) {
        markers[id].setPopupContent(buildPopup(allAccommodations.find(a => a.id === id)));
      }
    })
    .catch(() => showToast('Could not save – is the server running?', 'error'));
}

function saveDetailsFromListView(id) {
  const noteEl     = document.getElementById(`cwd-note-${id}`);
  const roomtypeEl = document.getElementById(`cwd-roomtype-${id}`);
  if (!noteEl) return;
  const noteVal     = noteEl.value.trim();
  const roomTypeVal = roomtypeEl ? roomtypeEl.value.trim() : '';
  saveDetails(id, { note: noteVal, roomType: roomTypeVal })
    .then(() => {
      showToast('Saved ✓', 'ok');
      renderAll();
    })
    .catch(() => showToast('Could not save – is the server running?', 'error'));
}

// ── Events ────────────────────────────────────────────────────────
function bindEvents() {
  // Type filter – clicking the active button deselects (hides all dots)
  document.getElementById('typeFilter').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    const val = btn.dataset.value;
    if (btn.classList.contains('active') && val === 'all') {
      // toggle off → hide all
      btn.classList.remove('active');
      filters.type = 'none';
    } else if (btn.classList.contains('active') && val !== 'all') {
      // deselect current type → show all
      document.querySelectorAll('#typeFilter .filter-btn')[0].classList.add('active');
      btn.classList.remove('active');
      filters.type = 'all';
    } else {
      document.querySelectorAll('#typeFilter .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filters.type = val;
    }
    renderAll();
  });

  // Distance filter — clicking active "All" hides all (same behaviour as type filter)
  document.getElementById('distFilter').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    const val = btn.dataset.value;
    if (btn.classList.contains('active') && val === 'all') {
      btn.classList.remove('active');
      filters.dist = 'none';
    } else if (btn.classList.contains('active') && val !== 'all') {
      document.querySelectorAll('#distFilter .filter-btn')[0].classList.add('active');
      btn.classList.remove('active');
      filters.dist = 'all';
    } else {
      document.querySelectorAll('#distFilter .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filters.dist = val;
    }
    renderAll();
  });

  // List search + autocomplete
  const listSearchEl = document.getElementById('listSearch');
  listSearchEl.addEventListener('input', e => {
    filters.search = e.target.value.trim();
    showAutocomplete(e.target.value.trim());
    if (currentView === 'list') renderListView(getFilteredForList());
  });
  listSearchEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeAutocomplete(); listSearchEl.blur(); }
    else if (e.key === 'ArrowDown') { moveSuggestion(1); e.preventDefault(); }
    else if (e.key === 'ArrowUp')   { moveSuggestion(-1); e.preventDefault(); }
    else if (e.key === 'Enter')     { selectActiveSuggestion(); e.preventDefault(); }
  });
  listSearchEl.addEventListener('blur', () => setTimeout(closeAutocomplete, 150));
  listSearchEl.addEventListener('focus', () => {
    if (listSearchEl.value.trim().length >= 2) showAutocomplete(listSearchEl.value.trim());
  });

  // Price inputs
  function updatePrice() {
    const loRaw = document.getElementById('priceMin').value;
    const hiRaw = document.getElementById('priceMax').value;
    filters.priceMin = loRaw === '' ? 0    : Math.max(0, +loRaw);
    filters.priceMax = hiRaw === '' ? 9999 : Math.max(0, +hiRaw);
    renderAll();
  }
  document.getElementById('priceMin').addEventListener('input', updatePrice);
  document.getElementById('priceMax').addEventListener('input', updatePrice);

  // Dates
  document.getElementById('filterFrom').addEventListener('change', e => { filters.dateFrom = e.target.value; renderAll(); });
  document.getElementById('filterTo').addEventListener('change', e => { filters.dateTo = e.target.value; renderAll(); });

  // Favourites / dismissed
  document.getElementById('chkFavs').addEventListener('change', e => { filters.favouritesOnly = e.target.checked; renderAll(); });
  document.getElementById('chkDismissed').addEventListener('change', e => { filters.showDismissed = e.target.checked; renderAll(); });

  // Sort (list view)
  document.getElementById('sortControls').addEventListener('click', e => {
    const btn = e.target.closest('.sort-btn');
    if (!btn) return;
    document.querySelectorAll('#sortControls .sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const [field, dir] = btn.dataset.sort.split('-');
    listSort = { field, dir };
    if (currentView === 'list') renderListView(getFilteredForList());
  });

  // Clear
  document.getElementById('btnClear').addEventListener('click', clearFilters);

  // Zone overlay toggles
  [['chkZone1','Zone 1'],['chkZone2','Zone 2'],['chkZone3','Zone 3']].forEach(([ckId, name]) => {
    document.getElementById(ckId).addEventListener('change', e => {
      if (e.target.checked) zoneLayers[name]?.addTo(map);
      else map.removeLayer(zoneLayers[name]);
    });
  });

  // Tube toggle
  document.getElementById('chkTube').addEventListener('change', e => {
    if (!tubeLayerGroup) return;
    if (e.target.checked) tubeLayerGroup.addTo(map);
    else map.removeLayer(tubeLayerGroup);
  });

  // Modal
  document.getElementById('btnAdd').addEventListener('click', openModal);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('addForm').addEventListener('submit', handleAddSubmit);
}

function clearFilters() {
  filters.type = 'all'; filters.dist = 'all'; filters.priceMin = 0; filters.priceMax = 800;
  filters.dateFrom = ''; filters.dateTo = ''; filters.favouritesOnly = false;
  filters.showDismissed = false; filters.search = '';
  document.querySelectorAll('#typeFilter .filter-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.querySelectorAll('#distFilter .filter-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.getElementById('priceMin').value = '';
  document.getElementById('priceMax').value = '';
  document.getElementById('filterFrom').value = '';
  document.getElementById('filterTo').value = '';
  document.getElementById('chkFavs').checked = false;
  document.getElementById('chkDismissed').checked = false;
  const se = document.getElementById('listSearch');
  if (se) se.value = '';
  closeAutocomplete();
  renderAll();
}

function openModal() {
  editingId = null;
  document.getElementById('addForm').reset();
  document.getElementById('formError').classList.add('hidden');
  document.getElementById('importStatus').textContent = '';
  document.getElementById('importStatus').className = 'import-status';
  document.getElementById('modalTitle').textContent = 'Add Accommodation';
  document.getElementById('btnSave').textContent = 'Save Accommodation';
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function openEditModal(id) {
  const acc = allAccommodations.find(a => a.id === id);
  if (!acc) return;
  editingId = id;
  document.getElementById('addForm').reset();
  document.getElementById('formError').classList.add('hidden');
  document.getElementById('importStatus').textContent = '';
  document.getElementById('importStatus').className = 'import-status';
  document.getElementById('mapsImportUrl').value = '';
  document.getElementById('f-name').value        = acc.name          || '';
  document.getElementById('f-type').value        = acc.type          || '';
  document.getElementById('f-zone').value        = acc.zone          || '';
  document.getElementById('f-address').value     = acc.address       || '';
  document.getElementById('f-lat').value         = acc.lat           || '';
  document.getElementById('f-lng').value         = acc.lng           || '';
  document.getElementById('f-price').value       = acc.pricePerWeek  || '';
  document.getElementById('f-priceNote').value   = acc.priceNote     || '';
  document.getElementById('f-from').value        = acc.availableFrom || '';
  document.getElementById('f-to').value          = acc.availableTo   || '';
  document.getElementById('f-url').value         = acc.url           || '';
  document.getElementById('f-notes').value       = acc.notes         || '';
  document.getElementById('modalTitle').textContent = 'Edit Accommodation';
  document.getElementById('btnSave').textContent = 'Save Changes';
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  editingId = null;
}

async function handleAddSubmit(e) {
  e.preventDefault();
  const g = id => document.getElementById(id).value.trim();
  const btn = document.getElementById('btnSave');
  const isEdit = editingId !== null;
  btn.disabled = true; btn.textContent = 'Saving…';
  const payload = {
    name: g('f-name'), type: g('f-type'), address: g('f-address'),
    lat: g('f-lat'), lng: g('f-lng'), pricePerWeek: g('f-price'),
    priceNote: g('f-priceNote'), availableFrom: g('f-from'), availableTo: g('f-to'),
    zone: g('f-zone'), url: g('f-url'), notes: g('f-notes'),
  };
  try {
    if (isEdit) {
      const updated = await (await fetch(`${API}/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })).json();
      if (updated.error) throw new Error(updated.error);
      const idx = allAccommodations.findIndex(a => a.id === editingId);
      if (idx !== -1) allAccommodations[idx] = updated;
      closeModal();
      renderAll();
      showToast('Saved ✓', 'ok');
    } else {
      const newAcc = await (await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })).json();
      if (newAcc.error) throw new Error(newAcc.error);
      allAccommodations.push(newAcc);
      closeModal();
      renderAll();
      if (currentView === 'map') {
        setTimeout(() => { map.flyTo([newAcc.lat, newAcc.lng], 15); markers[newAcc.id]?.openPopup(); }, 150);
      }
    }
  } catch (err) {
    const el = document.getElementById('formError');
    el.textContent = '⚠ ' + err.message;
    el.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = isEdit ? 'Save Changes' : 'Save Accommodation';
  }
}

function showError(msg) {
  document.getElementById('resultCount').textContent = '⚠ Error';
  document.getElementById('cardList').innerHTML = `<div class="empty-state error-state">${msg}</div>`;
}

function toggleCurrency() {
  showEuro = !showEuro;
  const btn = document.getElementById('btnCurrency');
  btn.textContent = showEuro ? '£/wk' : '€/mo';
  btn.classList.toggle('active', showEuro);
  if (currentView === 'list') renderListView(getFilteredForList());
}

// ── Autocomplete ──────────────────────────────────────────────
let _acActive = -1;

function showAutocomplete(query) {
  const dropdown = document.getElementById('searchDropdown');
  if (!dropdown) return;
  if (!query || query.length < 2) { closeAutocomplete(); return; }
  const q = query.toLowerCase();
  const matches = allAccommodations
    .filter(a => a.name.toLowerCase().includes(q) || (a.address || '').toLowerCase().includes(q))
    .sort((a, b) => (a.distKm || 99) - (b.distKm || 99))
    .slice(0, 8);
  if (!matches.length) { closeAutocomplete(); return; }
  _acActive = -1;
  dropdown.innerHTML = matches.map((a, i) =>
    `<div class="autocomplete-item" data-idx="${i}"
          onmousedown="selectSuggestion(${JSON.stringify(a.name)})">
      <span class="ac-name">${acHighlight(a.name, q)}</span>
      <span class="ac-dist">${a.distKm != null ? a.distKm.toFixed(1) + 'km' : ''}</span>
    </div>`
  ).join('');
  dropdown.classList.remove('hidden');
}

function closeAutocomplete() {
  const d = document.getElementById('searchDropdown');
  if (d) d.classList.add('hidden');
  _acActive = -1;
}

function selectSuggestion(name) {
  const el = document.getElementById('listSearch');
  if (el) el.value = name;
  filters.search = name;
  closeAutocomplete();
  if (currentView === 'list') renderListView(getFilteredForList());
}

function moveSuggestion(dir) {
  const items = document.querySelectorAll('#searchDropdown .autocomplete-item');
  if (!items.length) return;
  _acActive = Math.max(-1, Math.min(items.length - 1, _acActive + dir));
  items.forEach((el, i) => el.classList.toggle('ac-active', i === _acActive));
  if (_acActive >= 0) items[_acActive].scrollIntoView({ block: 'nearest' });
}

function selectActiveSuggestion() {
  const items = document.querySelectorAll('#searchDropdown .autocomplete-item');
  if (_acActive >= 0 && items[_acActive]) {
    items[_acActive].dispatchEvent(new MouseEvent('mousedown'));
  }
}

function acHighlight(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return esc(text);
  return esc(text.slice(0, idx))
    + '<mark class="ac-mark">' + esc(text.slice(idx, idx + query.length)) + '</mark>'
    + esc(text.slice(idx + query.length));
}

// ── Helpers ───────────────────────────────────────────────────────
const capitalize = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const priceLabel = acc => showEuro
  ? `€${Math.round(acc.pricePerWeek * 4.33 * EUR_RATE)}/mo`
  : `£${acc.pricePerWeek}/wk`;
