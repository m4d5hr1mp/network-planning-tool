// js/pages/airline-mgmt/AirlineLinks.js
// Routes table: cache, filters, sort, verbose mode, pills.

import RouteDAO from "../../dao/RouteDAO.js";
import AirlineBaseDAO from "../../dao/AirlineBaseDAO.js";
import { setStatus } from "../../ui/Toast.js";
import { attachById, attachAirportSearch } from "../../AirportSearch.js";
import { db } from "../../core/Firebase.js";

const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

// ── Module state ──────────────────────────────────────────────────────────────
let _myId       = null;
let _routes     = [];      // all routes for this airline (cached)
let _myBases    = [];      // bases owned by me (for trunk filter)
let _allBases   = [];      // all airlines' bases (for trunk filter)
let _airports   = new Map(); // IATA → airport object

let _filters = {
    bases:    new Set(),   // empty = all origins
    dest:     "",
    distMin:  null,
    distMax:  null,
    type:     "",
    freqMin:  null,
    freqMax:  null,
    capY:     null,
    capJ:     null,
    capF:     null,
    capTotal: null,
    trunk:    false,
};

let _sort    = { col: "origin", dir: "asc" };
let _verbose = localStorage.getItem("routesVerbose") === "true";

// ── Haversine ─────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
              Math.sin(dLon/2)**2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function routeDistance(r) {
    if (r.distance) return r.distance;
    const from = _airports.get(r.originIata);
    const to   = _airports.get(r.destinationIata);
    if (!from || !to) return null;
    return haversine(from.lat, from.lon, to.lat, to.lon);
}

// ── Cache ─────────────────────────────────────────────────────────────────────
function cacheKey()  { return `routeCache_${_myId}`; }
function baseCacheKey() { return `allBasesCache`; }

function readCache(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (Date.now() - obj.ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
        return obj.data;
    } catch { return null; }
}

function writeCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

function invalidateRouteCache() {
    localStorage.removeItem(cacheKey());
}

export async function refreshCache() {
    invalidateRouteCache();
    localStorage.removeItem(baseCacheKey());
    await loadData();
    render();
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadAirports() {
    if (_airports.size > 0) return;
    try {
        const res  = await fetch("./airports_clean.json");
        const list = await res.json();
        list.forEach(a => _airports.set(a.code, a));
    } catch(e) {
        console.warn("AirlineLinks: failed to load airports:", e.message);
    }
}

async function loadData() {
    // Try cache first
    const cached = readCache(cacheKey());
    if (cached) {
        _routes = cached;
    } else {
        _routes = await RouteDAO.getAllForAirline(_myId);
        writeCache(cacheKey(), _routes);
    }

    // All bases (for trunk filter) - lighter, share cache across module
    const cachedBases = readCache(baseCacheKey());
    if (cachedBases) {
        _allBases = cachedBases;
    } else {
        try {
            const snap = await db.collection("airline_bases").get();
            _allBases  = snap.docs.map(d => d.data());
            writeCache(baseCacheKey(), _allBases);
        } catch(e) {
            console.warn("AirlineLinks: failed to load all bases:", e.message);
            _allBases = [];
        }
    }

    _myBases = _allBases.filter(b => b.airlineId === _myId);
}

// ── Filter helpers ────────────────────────────────────────────────────────────
const allDestBases = () => new Set(_allBases.map(b => b.iata));

function applyFilters(routes) {
    const trunkDests = _filters.trunk ? allDestBases() : null;

    return routes.filter(r => {
        const dist = routeDistance(r);

        if (_filters.bases.size > 0 && !_filters.bases.has(r.originIata))             return false;
        if (_filters.dest && r.destinationIata !== _filters.dest.toUpperCase())        return false;
        if (_filters.distMin !== null && dist !== null && dist < _filters.distMin)     return false;
        if (_filters.distMax !== null && dist !== null && dist > _filters.distMax)     return false;
        if (_filters.type   && r.flightType !== _filters.type)                         return false;
        if (_filters.freqMin !== null && r.frequency < _filters.freqMin)               return false;
        if (_filters.freqMax !== null && r.frequency > _filters.freqMax)               return false;
        if (_filters.capY    !== null && (r.capacity?.economy  || 0) < _filters.capY)  return false;
        if (_filters.capJ    !== null && (r.capacity?.business || 0) < _filters.capJ)  return false;
        if (_filters.capF    !== null && (r.capacity?.first    || 0) < _filters.capF)  return false;
        if (_filters.capTotal !== null && (r.capacity?.total   || 0) < _filters.capTotal) return false;
        if (trunkDests && !trunkDests.has(r.destinationIata))                          return false;

        return true;
    });
}

// ── Sort ──────────────────────────────────────────────────────────────────────
function applySort(routes) {
    const { col, dir } = _sort;
    const mul = dir === "asc" ? 1 : -1;

    return [...routes].sort((a, b) => {
        let va, vb;
        switch (col) {
            case "origin":   va = a.originIata;        vb = b.originIata;        break;
            case "dest":     va = a.destinationIata;   vb = b.destinationIata;   break;
            case "distance": va = routeDistance(a)??0; vb = routeDistance(b)??0; break;
            case "type":     va = a.flightType || "";  vb = b.flightType || "";  break;
            case "freq":     va = a.frequency;         vb = b.frequency;         break;
            case "capY":     va = a.capacity?.economy  || 0; vb = b.capacity?.economy  || 0; break;
            case "capJ":     va = a.capacity?.business || 0; vb = b.capacity?.business || 0; break;
            case "capF":     va = a.capacity?.first    || 0; vb = b.capacity?.first    || 0; break;
            case "added":    va = a.createdAt || "";   vb = b.createdAt || "";   break;
            default:         return 0;
        }
        if (typeof va === "string") return va.localeCompare(vb) * mul;
        return (va - vb) * mul;
    });
}

// ── Render ────────────────────────────────────────────────────────────────────
export function render() {
    const filtered = applySort(applyFilters(_routes));
    const tbody    = document.querySelector("#routesTable tbody");
    if (!tbody) return;

    // Update count
    const countEl = document.getElementById("routeCount");
    if (countEl) countEl.textContent =
        `${filtered.length} of ${_routes.length} routes${_filters.trunk ? " · trunk only" : ""}`;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="12" class="empty" style="padding:24px;text-align:center">No routes match filters.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(r => renderRow(r)).join("");

    // Update sort indicators
    document.querySelectorAll(".routes-table .sortable").forEach(th => {
        th.classList.remove("asc","desc");
        if (th.dataset.sort === _sort.col) th.classList.add(_sort.dir);
    });
}

function pill(val, cls, verboseExtra = "") {
    const extra = _verbose && verboseExtra
        ? `<span class="pill-verbose">${verboseExtra}</span>`
        : "";
    return `<span class="pill ${cls}">${val}${extra}</span>`;
}

function renderRow(r) {
    const dist = routeDistance(r);
    const distStr = dist ? `${dist.toLocaleString()} km` : "—";

    const capY = r.capacity?.economy  ?? "—";
    const capJ = r.capacity?.business ?? "—";
    const capF = r.capacity?.first    ?? "—";
    const capT = r.capacity?.total    ?? "—";

    const prY  = r.price?.economy  ?? "—";
    const prJ  = r.price?.business ?? "—";
    const prF  = r.price?.first    ?? "—";

    // TODO: verbose price % = (currentPrice / defaultPrice) * 100
    // Default price needs AC game formula (distance + class based). Deferred.
    const pctY = "—%";
    const pctJ = "—%";
    const pctF = "—%";

    const ft = r.flightType
        ? `<span class="ft-pill" style="font-size:10px">${esc(r.flightType)}</span>`
        : `<span class="muted">—</span>`;

    const capTotalCell = _verbose
        ? `<td class="pill-cell" colspan="1" style="border-left:1px solid var(--border)">
               <span class="pill" style="background:var(--surface-2);border:1px solid var(--border);color:var(--muted)">${capT}</span>
           </td>`
        : "";

    return `<tr data-id="${r.id}">
        <td><span class="rt-iata">${esc(r.originIata)}</span></td>
        <td><span class="rt-iata">${esc(r.destinationIata)}</span></td>
        <td class="rt-dist">${distStr}</td>
        <td>${ft}</td>
        <td class="rt-freq">${r.frequency}×</td>
        <td class="pill-cell">${pill(capY, "pill-eco",   _verbose ? `tot: ${capT}` : "")}</td>
        <td class="pill-cell">${pill(capJ, "pill-biz",   "")}</td>
        <td class="pill-cell">${pill(capF, "pill-first", "")}</td>
        <td class="pill-cell">${pill(prY  !== "—" ? `$${prY}` : "—",  "pill-eco",   _verbose ? pctY : "")}</td>
        <td class="pill-cell">${pill(prJ  !== "—" ? `$${prJ}` : "—",  "pill-biz",   _verbose ? pctJ : "")}</td>
        <td class="pill-cell">${pill(prF  !== "—" ? `$${prF}` : "—",  "pill-first", _verbose ? pctF : "")}</td>
        <td class="muted" style="font-size:11px">${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
        <td><button class="btn btn-sm btn-danger" style="padding:2px 7px;font-size:11px" data-action="deleteRoute" data-id="${r.id}">×</button></td>
    </tr>`;
}

// ── Filter UI population ──────────────────────────────────────────────────────
function buildFilterUI() {
    // Base multi-select dropdown
    const origins  = [...new Set(_routes.map(r => r.originIata))].sort();
    const dropdown = document.getElementById("baseFilterDropdown");
    if (dropdown) {
        dropdown.innerHTML = [
            `<label class="multi-select-option"><input type="checkbox" id="baseAll" checked onchange="window._links?.toggleAllBases(this.checked)"> All</label>`,
            ...origins.map(iata => `<label class="multi-select-option">
                <input type="checkbox" class="base-cb" value="${iata}" checked
                    onchange="window._links?.onBaseFilterChange()"> ${iata}
            </label>`)
        ].join("");
    }

    // Close dropdown on outside click
    document.addEventListener("click", e => {
        const wrap = document.getElementById("baseFilterWrap");
        if (wrap && !wrap.contains(e.target)) {
            document.getElementById("baseFilterDropdown").style.display = "none";
        }
    }, { capture: true });

    // Flight type dropdown
    const typeEl = document.getElementById("filterType");
    if (typeEl) {
        const types = [...new Set(_routes.map(r => r.flightType).filter(Boolean))].sort();
        typeEl.innerHTML = `<option value="">All types</option>` +
            types.map(t => `<option value="${t}">${t}</option>`).join("");
    }

    // Verbose toggle state
    const vt = document.getElementById("verboseToggle");
    if (vt) vt.checked = _verbose;

    // Attach autocomplete to destination filter
    const destInput = document.getElementById("filterDest");
    if (destInput) attachAirportSearch(destInput);
}

function updateBaseBtn() {
    const btn = document.getElementById("baseFilterBtn");
    if (!btn) return;
    const n = _filters.bases.size;
    btn.textContent = n === 0 ? "All bases ▾" : `${n} base${n > 1 ? "s" : ""} ▾`;
}

// ── Filter event handlers (exposed on window._links) ─────────────────────────
function setupFilterListeners() {
    const on = (id, evt, fn) => document.getElementById(id)?.addEventListener(evt, fn);

    on("filterDest",    "change", () => { _filters.dest    = document.getElementById("filterDest")?.value.trim().toUpperCase() || ""; render(); });
    on("filterDest",    "input",  () => { _filters.dest    = document.getElementById("filterDest")?.value.trim().toUpperCase() || ""; render(); });
    on("filterDistMin", "input",  () => { _filters.distMin = numVal("filterDistMin"); render(); });
    on("filterDistMax", "input",  () => { _filters.distMax = numVal("filterDistMax"); render(); });
    on("filterType",    "change", () => { _filters.type    = document.getElementById("filterType")?.value || ""; render(); });
    on("filterFreqMin", "input",  () => { _filters.freqMin = numVal("filterFreqMin"); render(); });
    on("filterFreqMax", "input",  () => { _filters.freqMax = numVal("filterFreqMax"); render(); });
    on("filterCapY",    "input",  () => { _filters.capY    = numVal("filterCapY");    render(); });
    on("filterCapJ",    "input",  () => { _filters.capJ    = numVal("filterCapJ");    render(); });
    on("filterCapF",    "input",  () => { _filters.capF    = numVal("filterCapF");    render(); });
    on("filterCapTotal","input",  () => { _filters.capTotal= numVal("filterCapTotal");render(); });
    on("filterTrunk",   "change", () => { _filters.trunk   = document.getElementById("filterTrunk")?.checked || false; render(); });

    // Sort on header click
    document.getElementById("routesTable")?.addEventListener("click", e => {
        const th = e.target.closest(".sortable[data-sort]");
        if (th) {
            const col = th.dataset.sort;
            _sort.dir = (_sort.col === col && _sort.dir === "asc") ? "desc" : "asc";
            _sort.col = col;
            render();
        }
        // Delete button
        const btn = e.target.closest("[data-action=deleteRoute]");
        if (btn) deleteRoute(btn.dataset.id);
    });
}

function numVal(id) {
    const v = parseFloat(document.getElementById(id)?.value);
    return isNaN(v) ? null : v;
}

// ── Public API ────────────────────────────────────────────────────────────────
window._links = {
    toggleBaseDropdown() {
        const dd = document.getElementById("baseFilterDropdown");
        if (dd) dd.style.display = dd.style.display === "none" ? "block" : "none";
    },
    toggleAllBases(checked) {
        document.querySelectorAll(".base-cb").forEach(cb => cb.checked = checked);
        _filters.bases = checked ? new Set() : new Set(
            [...document.querySelectorAll(".base-cb")].map(cb => cb.value)
        );
        updateBaseBtn(); render();
    },
    onBaseFilterChange() {
        const checked = [...document.querySelectorAll(".base-cb:checked")].map(cb => cb.value);
        const all     = [...document.querySelectorAll(".base-cb")];
        _filters.bases = checked.length === all.length ? new Set() : new Set(all.map(cb => cb.value).filter(v => !checked.includes(v)).length === 0 ? [] : all.map(cb => cb.value).filter(v => !checked.includes(v)));
        // Simpler: empty set = show all, non-empty = only those
        _filters.bases = checked.length === all.length ? new Set() : new Set(checked);
        document.getElementById("baseAll").checked = checked.length === all.length;
        updateBaseBtn(); render();
    },
    clearFilters() {
        _filters = { bases: new Set(), dest: "", distMin: null, distMax: null, type: "", freqMin: null, freqMax: null, capY: null, capJ: null, capF: null, capTotal: null, trunk: false };
        ["filterDest","filterDistMin","filterDistMax","filterFreqMin","filterFreqMax","filterCapY","filterCapJ","filterCapF","filterCapTotal"]
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
        const ft = document.getElementById("filterType"); if (ft) ft.value = "";
        const tr = document.getElementById("filterTrunk"); if (tr) tr.checked = false;
        document.querySelectorAll(".base-cb").forEach(cb => cb.checked = true);
        const ba = document.getElementById("baseAll"); if (ba) ba.checked = true;
        updateBaseBtn(); render();
    },
    setVerbose(v) { _verbose = v; localStorage.setItem("routesVerbose", v); render(); },
    refreshCache,
};

// ── Add / Delete ──────────────────────────────────────────────────────────────
async function addRoute() {
    const origin = document.getElementById("routeOrigin")?.value;
    const dest   = document.getElementById("routeDest")?.value.trim().toUpperCase();
    const freq   = parseInt(document.getElementById("routeFreq")?.value) || 7;

    if (!origin) { setStatus("routeStatus", "Select an origin base", "error"); return; }
    if (!dest || dest.length !== 3) { setStatus("routeStatus", "Destination must be 3-letter IATA", "error"); return; }
    if (origin === dest) { setStatus("routeStatus", "Origin and destination can't be the same", "error"); return; }

    try {
        // Compute distance for manually-added routes
        const fromApt = _airports.get(origin);
        const toApt   = _airports.get(dest);
        const distance = (fromApt && toApt)
            ? haversine(fromApt.lat, fromApt.lon, toApt.lat, toApt.lon)
            : null;

        await RouteDAO.add({ airlineId: _myId, originIata: origin, destinationIata: dest, frequency: freq, distance });
        document.getElementById("routeDest").value = "";
        document.getElementById("routeFreq").value = "7";
        setStatus("routeStatus", `✓ Route ${origin}→${dest} added`, "success");
        invalidateRouteCache();
        await loadData();
        buildFilterUI();
        render();
    } catch(e) {
        setStatus("routeStatus", e.message, "error");
    }
}

async function deleteRoute(id) {
    if (!confirm("Delete this route?")) return;
    await RouteDAO.delete(id);
    invalidateRouteCache();
    await loadData();
    render();
}

// ── Origin select (driven by AirlineBases) ────────────────────────────────────
export function refreshOriginSelect(bases) {
    const sel = document.getElementById("routeOrigin");
    if (!sel) return;
    sel.innerHTML = `<option value="">— base —</option>`;
    bases.forEach(b => sel.appendChild(new Option(b.iata, b.iata)));
}

// ── Init ──────────────────────────────────────────────────────────────────────
export async function init(myId) {
    _myId = myId;
    attachById("routeDest");
    document.getElementById("addRouteBtn")?.addEventListener("click", addRoute);
    setupFilterListeners();
}

export async function load() {
    await loadAirports();
    await loadData();
    buildFilterUI();
    render();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");