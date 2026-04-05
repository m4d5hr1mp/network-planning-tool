// js/pages/network/NetworkView.js
// Orchestrates data loading, filter state, and rendering for the network map.

import { getCurrentAirlineId, updateNavAirlineDisplay, logout } from "../../App.js";
import AirlineDAO     from "../../dao/AirlineDAO.js";
import AirlineBaseDAO from "../../dao/AirlineBaseDAO.js";
import RouteDAO       from "../../dao/RouteDAO.js";
import IssueDAO, { ISSUE_TYPES, TARGET_TYPE } from "../../dao/IssueDAO.js";
import {
    initMap, airlineColor,
    clearLayers, addBaseMarker, addRouteLine
} from "./LeafletMap.js";
import { toast } from "../../ui/Toast.js";

window.logout = logout;

// ── Module state ──────────────────────────────────────────────────────────────
let _allAirlines = [];
let _allBases    = [];
let _allRoutes   = [];
let _airports    = [];   // airports_clean.json
let _myId        = getCurrentAirlineId();

// airlineId → color string
let _colorMap    = new Map();

// Filter state: empty Set = show all
const _hiddenAirlines    = new Set();
const _hiddenFlightTypes = new Set();

// ── Lookup helpers ────────────────────────────────────────────────────────────
const _airportByCode = new Map();
const _airlineById   = new Map();

function airlineLabel(id) {
    return _airlineById.get(id)?.username || id;
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
    clearLayers();

    // Draw routes
    _allRoutes.forEach(route => {
        if (_hiddenAirlines.has(route.airlineId))     return;
        if (_hiddenFlightTypes.has(route.flightType)) return;

        const from = _airportByCode.get(route.originIata);
        const to   = _airportByCode.get(route.destinationIata);
        if (!from || !to) return;

        const color   = _colorMap.get(route.airlineId) || "#2f81f7";
        const airline = airlineLabel(route.airlineId);

        const cap   = route.capacity ? `${route.capacity.economy}/${route.capacity.business}/${route.capacity.first}` : "—";
        const price = route.price    ? `$${route.price.economy}/$${route.price.business}/$${route.price.first}` : "—";

        const popupHtml = `
        <div class="lf-popup">
            <div class="lf-popup-title">${route.originIata} → ${route.destinationIata}</div>
            <div class="lf-popup-row"><span>Airline</span><span>${airline}</span></div>
            <div class="lf-popup-row"><span>Frequency</span><span>${route.frequency}× / wk</span></div>
            <div class="lf-popup-row"><span>Type</span><span>${route.flightType || "—"}</span></div>
            <div class="lf-popup-row"><span>Capacity Y/J/F</span><span>${cap}</span></div>
            <div class="lf-popup-row"><span>Price Y/J/F</span><span>${price}</span></div>
            <hr class="lf-popup-divider">
            <div class="lf-popup-actions">
                <button class="lf-btn lf-btn-primary"
                    onclick="window._mapView?.openIssueModal({toAirlineId:'${route.airlineId}',type:'Add Frequency',target:'${route.id}',sub:'Add frequency on ${route.originIata}→${route.destinationIata}'})">
                    Request freq+
                </button>
                <button class="lf-btn lf-btn-ghost"
                    onclick="window._mapView?.openIssueModal({toAirlineId:'${route.airlineId}',type:'Give Me Route',target:'${route.id}',sub:'Take over ${route.originIata}→${route.destinationIata}'})">
                    Request takeover
                </button>
            </div>
        </div>`;

        addRouteLine({
            from: [from.lat, from.lon],
            to:   [to.lat, to.lon],
            color, weight: 1.5, opacity: 0.65, popupHtml
        });
    });

    // Draw bases
    _allBases.forEach(base => {
        if (_hiddenAirlines.has(base.airlineId)) return;

        const airport = _airportByCode.get(base.iata);
        if (!airport) return;

        const color   = _colorMap.get(base.airlineId) || "#2f81f7";
        const airline = airlineLabel(base.airlineId);

        addBaseMarker({
            lat: airport.lat, lon: airport.lon,
            iata: base.iata, airlineName: airline, color
        });
    });

    // Update sidebar stats
    const visibleRoutes = _allRoutes.filter(r =>
        !_hiddenAirlines.has(r.airlineId) && !_hiddenFlightTypes.has(r.flightType)
    );
    const statsEl = document.getElementById("mapStats");
    if (statsEl) statsEl.textContent =
        `${visibleRoutes.length} routes · ${_allBases.filter(b => !_hiddenAirlines.has(b.airlineId)).length} bases`;
}

// ── Sidebar filters ───────────────────────────────────────────────────────────
function buildFilters() {
    // Airlines
    const airlineEl = document.getElementById("airlineFilters");
    if (airlineEl) {
        airlineEl.innerHTML = _allAirlines.map((a, i) => {
            const color = _colorMap.get(a.id);
            const isMine = a.id === _myId;
            return `<label class="filter-item">
                <input type="checkbox" checked data-airline="${a.id}"
                    onchange="window._mapView?.toggleAirline('${a.id}', this.checked)">
                <span class="airline-dot" style="background:${color}"></span>
                <span>${a.username}${isMine ? " (me)" : ""}</span>
            </label>`;
        }).join("");
    }

    // Flight types
    const types = [...new Set(_allRoutes.map(r => r.flightType).filter(Boolean))].sort();
    const typeEl = document.getElementById("typeFilters");
    if (typeEl) {
        typeEl.innerHTML = types.length
            ? types.map(t => `<label class="filter-item">
                <input type="checkbox" checked data-type="${t}"
                    onchange="window._mapView?.toggleType('${t}', this.checked)">
                <span>${t}</span>
            </label>`).join("")
            : `<span style="color:var(--muted);font-size:12px">No route types</span>`;
    }
}

// ── Issue modal (pre-filled from popup buttons) ───────────────────────────────
let _pendingIssue = {};

function openIssueModal({ toAirlineId, type, target, targetA, sub }) {
    _pendingIssue = { toAirlineId, type, target, targetA };
    document.getElementById("issueModalSub").textContent = sub || "From the network map";
    document.getElementById("issueModalError").textContent = "";
    document.getElementById("issueModalMsg").value = "";
    document.getElementById("issueModalTarget").style.display = "none";

    // Populate recipient dropdown
    const toSel = document.getElementById("issueModalTo");
    toSel.innerHTML = `<option value="">— select —</option>`;
    _allAirlines.filter(a => a.id !== _myId).forEach(a => {
        const o = new Option(`${a.username}`, a.id);
        if (a.id === toAirlineId) o.selected = true;
        toSel.appendChild(o);
    });

    // Populate type dropdown
    const typeSel = document.getElementById("issueModalType");
    typeSel.innerHTML = `<option value="">— select type —</option>`;
    ISSUE_TYPES.forEach(t => {
        const o = new Option(t, t);
        if (t === type) o.selected = true;
        typeSel.appendChild(o);
    });

    // If target pre-filled, inject it
    if (target || targetA) {
        const sec = document.getElementById("issueModalTarget");
        if (target) {
            sec.innerHTML = `<div class="field"><label>Target (pre-filled)</label>
                <input id="issueModalTargetVal" value="${target}" readonly style="opacity:.7"></div>`;
        } else if (targetA) {
            sec.innerHTML = `<div class="field"><label>Origin → Destination IATA</label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    <input id="tA" value="${targetA}" placeholder="Origin" maxlength="3" style="text-transform:uppercase">
                    <input id="tB" placeholder="Destination" maxlength="3" style="text-transform:uppercase">
                </div></div>`;
        }
        sec.style.display = "block";
    }

    document.getElementById("issueModal").classList.add("active");
}

function closeIssueModal() {
    document.getElementById("issueModal").classList.remove("active");
    _pendingIssue = {};
}

function onIssueTypeChange() {
    // Type changed manually — clear pre-filled target
    document.getElementById("issueModalTarget").style.display = "none";
    _pendingIssue.target = null;
    _pendingIssue.targetA = null;
}

async function sendIssue() {
    const toAirlineId = document.getElementById("issueModalTo").value;
    const type        = document.getElementById("issueModalType").value;
    const message     = document.getElementById("issueModalMsg").value.trim();
    const errEl       = document.getElementById("issueModalError");
    errEl.textContent = "";

    if (!toAirlineId) { errEl.textContent = "Select a recipient"; return; }
    if (!type)        { errEl.textContent = "Select a type"; return; }

    let target = _pendingIssue.target || null;
    if (!target && _pendingIssue.targetA) {
        const a = (document.getElementById("tA")?.value||"").trim().toUpperCase();
        const b = (document.getElementById("tB")?.value||"").trim().toUpperCase();
        if (!a || !b) { errEl.textContent = "Both IATA codes required"; return; }
        target = `${a}-${b}`;
    }

    try {
        await IssueDAO.add({ fromAirlineId: _myId, toAirlineId, type, target, message });
        toast("✉ Request sent");
        closeIssueModal();
    } catch(e) {
        errEl.textContent = e.message;
    }
}

// ── Public API (exposed on window._mapView for popup onclick handlers) ────────
window._mapView = {
    toggleAirline(id, visible) {
        visible ? _hiddenAirlines.delete(id) : _hiddenAirlines.add(id);
        render();
    },
    toggleType(type, visible) {
        visible ? _hiddenFlightTypes.delete(type) : _hiddenFlightTypes.add(type);
        render();
    },
    resetFilters() {
        _hiddenAirlines.clear();
        _hiddenFlightTypes.clear();
        document.querySelectorAll("#airlineFilters input, #typeFilters input")
            .forEach(el => el.checked = true);
        render();
    },
    openIssueModal, closeIssueModal, onIssueTypeChange, sendIssue
};

// ── Overlay close ─────────────────────────────────────────────────────────────
document.getElementById("issueModal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeIssueModal();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener("load", async () => {
    updateNavAirlineDisplay();
    initMap("map");

    // Load airports JSON
    try {
        const res = await fetch("./airports_clean.json");
        _airports = await res.json();
        _airports.forEach(a => _airportByCode.set(a.code, a));
    } catch(e) {
        console.error("Failed to load airports:", e);
    }

    // Load Firestore data
    try {
        _allAirlines = await AirlineDAO.getAll();
        _allAirlines.forEach((a, i) => {
            _colorMap.set(a.id, airlineColor(i));
            _airlineById.set(a.id, a);
        });
    } catch(e) {
        console.error("Failed to load airlines:", e);
    }

    try {
        // Fetch all bases and routes across all airlines
        const { db } = await import("../../core/Firebase.js");
        const [basesSnap, routesSnap] = await Promise.all([
            db.collection("airline_bases").get(),
            db.collection("routes").get()
        ]);
        _allBases  = basesSnap.docs.map(d => d.data());
        _allRoutes = routesSnap.docs.map(d => d.data());
    } catch(e) {
        console.error("Failed to load bases/routes:", e);
    }

    buildFilters();
    render();
});