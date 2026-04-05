// js/pages/airline-mgmt/AirlineBases.js

import AirlineBaseDAO from "../../dao/AirlineBaseDAO.js";
import { setStatus } from "../../ui/Toast.js";
import { attachById } from "../../AirportSearch.js";

let _myId = null;
let _onBaseChange = null; // callback so AirlineLinks can refresh origin dropdown

export async function init(myId, { onBaseChange } = {}) {
    _myId        = myId;
    _onBaseChange = onBaseChange;

    // Attach airport search to the static IATA input
    attachById("baseIata");

    // Event delegation on the bases table
    document.getElementById("basesTable")?.addEventListener("click", async e => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === "deleteBase") await deleteBase(id);
    });

    // Add base button
    document.getElementById("addBaseBtn")?.addEventListener("click", addBase);
    document.getElementById("baseIata")?.addEventListener("keydown", e => {
        if (e.key === "Enter") addBase();
    });

    await load();
}

export async function load() {
    const bases  = await AirlineBaseDAO.getAllForAirline(_myId);
    const tbody  = document.querySelector("#basesTable tbody");
    if (!tbody) return;

    tbody.innerHTML = bases.length
        ? bases.map(b => `<tr>
            <td><strong>${esc(b.iata)}</strong></td>
            <td class="muted">${b.acId || "—"}</td>
            <td class="muted">${new Date(b.createdAt).toLocaleDateString()}</td>
            <td><button class="btn btn-sm btn-danger" data-action="deleteBase" data-id="${b.id}">Delete</button></td>
          </tr>`).join("")
        : `<tr><td colspan="4" class="empty">No bases yet.</td></tr>`;

    if (_onBaseChange) await _onBaseChange(bases);
    return bases;
}

async function addBase() {
    const input = document.getElementById("baseIata");
    const iata  = input?.value.trim().toUpperCase();

    if (!iata || iata.length !== 3) {
        setStatus("baseStatus", "IATA must be exactly 3 letters", "error"); return;
    }
    try {
        await AirlineBaseDAO.add({ airlineId: _myId, iata });
        if (input) input.value = "";
        setStatus("baseStatus", `✓ Base ${iata} added`, "success");
        await load();
    } catch(e) {
        setStatus("baseStatus", e.message, "error");
    }
}

async function deleteBase(id) {
    if (!confirm("Delete this base?")) return;
    await AirlineBaseDAO.delete(id);
    await load();
}

const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");