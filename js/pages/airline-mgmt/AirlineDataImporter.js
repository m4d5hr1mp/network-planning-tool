// js/pages/airline-mgmt/AirlineDataImporter.js
// Handles the AC JSON import pipeline:
//   file select / drag-drop → parse → validate → preview → batch Firestore write

import { db } from "../../core/Firebase.js";
import { toast, setStatus } from "../../ui/Toast.js";

let _myId         = null;
let _pendingImport = null; // { routes, bases }
let _onComplete    = null; // callback after successful import

export function init(myId, { onImportComplete }) {
    _myId       = myId;
    _onComplete = onImportComplete;
    setupDropZone();
}

// ── Drop zone ─────────────────────────────────────────────────────────────────

function setupDropZone() {
    const zone = document.getElementById("dropZone");
    if (!zone) return;

    zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", e => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        const file = e.dataTransfer?.files?.[0];
        if (file) parseFile(file);
    });
}

export function onFileSelected(e) {
    const file = e.target?.files?.[0];
    if (file) parseFile(file);
}

// ── Parse ─────────────────────────────────────────────────────────────────────

function parseFile(file) {
    if (!file.name.endsWith(".json")) { alert("Expected a .json file"); return; }
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const raw = JSON.parse(e.target.result);
            processRaw(raw);
        } catch(err) {
            alert(`Failed to parse JSON: ${err.message}`);
        }
    };
    reader.readAsText(file);
}

function cleanRoute(raw) {
    const required = ["fromAirportCode", "fromAirportId", "toAirportCode", "toAirportId", "frequency", "capacity", "price"];
    for (const f of required) {
        if (raw[f] === undefined || raw[f] === null) throw new Error(`Route missing field: ${f}`);
    }
    return {
        id:              crypto.randomUUID(),
        airlineId:       _myId,
        originIata:      raw.fromAirportCode.toUpperCase(),
        destinationIata: raw.toAirportCode.toUpperCase(),
        originAcId:      raw.fromAirportId,
        destinationAcId: raw.toAirportId,
        frequency:       raw.frequency,
        flightType:      raw.flightType || null,
        capacity: {
            economy:  raw.capacity.economy  || 0,
            business: raw.capacity.business || 0,
            first:    raw.capacity.first    || 0,
            total:    raw.capacity.total    || 0
        },
        price: {
            economy:  raw.price.economy  || 0,
            business: raw.price.business || 0,
            first:    raw.price.first    || 0,
            total:    raw.price.total    || 0
        },
        createdAt:  new Date().toISOString(),
        importedAt: new Date().toISOString()
    };
}

function extractBases(rawRoutes) {
    const seen = new Map();
    for (const r of rawRoutes) {
        if (!seen.has(r.fromAirportId)) {
            seen.set(r.fromAirportId, {
                id:        crypto.randomUUID(),
                airlineId: _myId,
                iata:      r.fromAirportCode.toUpperCase(),
                acId:      r.fromAirportId,
                createdAt: new Date().toISOString()
            });
        }
    }
    return [...seen.values()];
}

function processRaw(raw) {
    if (!Array.isArray(raw) || raw.length === 0) { alert("Expected a non-empty array of routes"); return; }

    let routes, bases;
    try {
        routes = raw.map(r => cleanRoute(r));
        bases  = extractBases(raw);
    } catch(e) {
        alert(`Validation error: ${e.message}`); return;
    }

    _pendingImport = { routes, bases };
    showPreview(routes, bases);
}

// ── Preview ───────────────────────────────────────────────────────────────────

function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function showPreview(routes, bases) {
    const totalCap = routes.reduce((s,r) => s + (r.capacity.total * r.frequency), 0);

    document.getElementById("prevRouteCount").textContent = routes.length;
    document.getElementById("prevBaseCount").textContent  = bases.length;
    document.getElementById("prevTotalPax").textContent   = totalCap.toLocaleString();
    document.getElementById("prevBaseList").textContent   = "Bases: " + bases.map(b => b.iata).join("  ·  ");

    const tbody = document.querySelector("#prevTable tbody");
    if (tbody) {
        tbody.innerHTML = routes.map(r => `<tr>
            <td><span class="mono">${esc(r.originIata)}</span><span style="color:var(--muted);padding:0 3px">→</span><span class="mono">${esc(r.destinationIata)}</span></td>
            <td><span class="ft-pill">${esc(r.flightType || "—")}</span></td>
            <td>${r.frequency}×</td>
            <td style="color:var(--muted)">${r.capacity.economy}/${r.capacity.business}/${r.capacity.first}</td>
            <td style="color:var(--muted)">$${r.price.economy}/$${r.price.business}/$${r.price.first}</td>
        </tr>`).join("");
    }

    const sec = document.getElementById("previewSection");
    if (sec) { sec.style.display = "block"; sec.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
}

export function cancelImport() {
    _pendingImport = null;
    const sec  = document.getElementById("previewSection");
    const inp  = document.getElementById("jsonFileInput");
    const stat = document.getElementById("importStatus");
    if (sec)  sec.style.display = "none";
    if (inp)  inp.value = "";
    if (stat) stat.textContent = "";
}

// ── Batch write ───────────────────────────────────────────────────────────────

export async function confirmImport() {
    if (!_pendingImport) return;
    const { routes, bases } = _pendingImport;

    const btn = document.getElementById("importBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Importing…"; }

    try {
        const [existingRoutes, existingBases] = await Promise.all([
            db.collection("routes").where("airlineId", "==", _myId).get(),
            db.collection("airline_bases").where("airlineId", "==", _myId).get()
        ]);

        const ops = [];
        existingRoutes.docs.forEach(d => ops.push({ type: "delete", ref: d.ref }));
        existingBases.docs.forEach(d  => ops.push({ type: "delete", ref: d.ref }));
        bases.forEach(b  => ops.push({ type: "set", ref: db.collection("airline_bases").doc(b.id), data: b }));
        routes.forEach(r => ops.push({ type: "set", ref: db.collection("routes").doc(r.id), data: r }));

        for (let i = 0; i < ops.length; i += 499) {
            const batch = db.batch();
            ops.slice(i, i + 499).forEach(op => {
                op.type === "delete" ? batch.delete(op.ref) : batch.set(op.ref, op.data);
            });
            await batch.commit();
        }

        cancelImport();
        toast(`✓ Imported ${routes.length} routes across ${bases.length} bases`);
        if (_onComplete) await _onComplete();

    } catch(e) {
        setStatus("importStatus", `Error: ${e.message}`, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Import — replace network"; }
    }
}