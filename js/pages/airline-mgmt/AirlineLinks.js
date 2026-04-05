// js/pages/airline-mgmt/AirlineLinks.js

import RouteDAO from "../../dao/RouteDAO.js";
import { setStatus } from "../../ui/Toast.js";
import { attachById } from "../../AirportSearch.js";

let _myId = null;

export async function init(myId) {
    _myId = myId;

    attachById("routeDest");

    document.getElementById("routesTable")?.addEventListener("click", async e => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === "deleteRoute") await deleteRoute(id);
    });

    document.getElementById("addRouteBtn")?.addEventListener("click", addRoute);
}

/** Refresh the origin dropdown from a fresh bases list. */
export function refreshOriginSelect(bases) {
    const sel = document.getElementById("routeOrigin");
    if (!sel) return;
    sel.innerHTML = `<option value="">— base —</option>`;
    bases.forEach(b => {
        const o = new Option(b.iata, b.iata);
        sel.appendChild(o);
    });
}

export async function load() {
    const routes = await RouteDAO.getAllForAirline(_myId);
    const tbody  = document.querySelector("#routesTable tbody");
    if (!tbody) return;

    tbody.innerHTML = routes.length
        ? routes.map(r => {
            const cap   = r.capacity ? `${r.capacity.economy}/${r.capacity.business}/${r.capacity.first}` : "—";
            const price = r.price    ? `$${r.price.economy}/$${r.price.business}/$${r.price.first}`       : "—";
            const ft    = r.flightType ? `<span class="ft-pill">${esc(r.flightType)}</span>` : `<span class="muted">—</span>`;
            return `<tr>
                <td><span class="iata">${esc(r.originIata)}</span><span class="arrow">→</span><span class="iata">${esc(r.destinationIata)}</span></td>
                <td>${ft}</td>
                <td class="num">${r.frequency}×</td>
                <td class="num">${cap}</td>
                <td class="price-cell">${price}</td>
                <td class="num">${new Date(r.createdAt).toLocaleDateString()}</td>
                <td><button class="btn btn-sm btn-danger" data-action="deleteRoute" data-id="${r.id}">×</button></td>
            </tr>`;
          }).join("")
        : `<tr><td colspan="7" class="empty">No routes yet.</td></tr>`;
}

async function addRoute() {
    const origin = document.getElementById("routeOrigin")?.value;
    const dest   = document.getElementById("routeDest")?.value.trim().toUpperCase();
    const freq   = parseInt(document.getElementById("routeFreq")?.value) || 7;

    if (!origin) { setStatus("routeStatus", "Select an origin base", "error"); return; }
    if (!dest || dest.length !== 3) { setStatus("routeStatus", "Destination must be 3-letter IATA", "error"); return; }
    if (origin === dest) { setStatus("routeStatus", "Origin and destination can't be the same", "error"); return; }

    try {
        await RouteDAO.add({ airlineId: _myId, originIata: origin, destinationIata: dest, frequency: freq });
        const destEl = document.getElementById("routeDest");
        const freqEl = document.getElementById("routeFreq");
        if (destEl) destEl.value = "";
        if (freqEl) freqEl.value = "7";
        setStatus("routeStatus", `✓ Route ${origin}→${dest} added`, "success");
        await load();
    } catch(e) {
        setStatus("routeStatus", e.message, "error");
    }
}

async function deleteRoute(id) {
    if (!confirm("Delete this route?")) return;
    await RouteDAO.delete(id);
    await load();
}

const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");