// js/airport-search.js
// Attaches IATA autocomplete to any <input> element.
// Searches by IATA code, city name, and airport name.
// Fills just the 3-letter IATA code on selection.

let airportCache = null;

async function loadAirports() {
    if (airportCache) return airportCache;
    const res = await fetch('./airports_clean.json');
    airportCache = await res.json();
    return airportCache;
}

function score(airport, q) {
    const query = q.toLowerCase();
    const code  = airport.code.toLowerCase();
    const city  = (airport.city  || "").toLowerCase();
    const name  = (airport.name  || "").toLowerCase();

    if (code === query)              return 100;
    if (code.startsWith(query))      return 80;
    if (city.startsWith(query))      return 60;
    if (name.startsWith(query))      return 40;
    if (city.includes(query))        return 20;
    if (name.includes(query))        return 10;
    return 0;
}

function search(airports, query) {
    if (!query || query.length < 1) return [];
    const q = query.trim();
    return airports
        .map(a => ({ a, s: score(a, q) }))
        .filter(x => x.s > 0)
        .sort((x, y) => y.s - x.s)
        .slice(0, 8)
        .map(x => x.a);
}

// ── Dropdown renderer ──────────────────────────────────────────────────────

function removeDropdown(input) {
    const existing = input._acDropdown;
    if (existing) { existing.remove(); input._acDropdown = null; }
}

function showDropdown(input, results, onSelect) {
    removeDropdown(input);
    if (!results.length) return;

    const dd = document.createElement("div");
    dd.style.cssText = `
        position: absolute; z-index: 9999;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: 0 8px 24px rgba(0,0,0,.4);
        max-height: 280px; overflow-y: auto;
        font-family: inherit; font-size: 13px;
        min-width: 280px;
    `;

    results.forEach((airport, i) => {
        const item = document.createElement("div");
        item.dataset.idx = i;
        item.style.cssText = `
            padding: 8px 12px; cursor: pointer;
            display: flex; align-items: baseline; gap: 8px;
            border-bottom: 1px solid var(--border);
        `;
        item.innerHTML = `
            <span style="font-weight:600;color:var(--accent);font-family:monospace;flex-shrink:0">${airport.code}</span>
            <span style="color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${airport.city}</span>
            <span style="color:var(--muted);font-size:11px;flex-shrink:0;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${airport.name}</span>
        `;
        item.addEventListener("mouseenter", () => setActive(dd, i));
        item.addEventListener("mouseleave", () => setActive(dd, -1));
        item.addEventListener("mousedown", e => {
            e.preventDefault(); // prevent input blur before click
            onSelect(airport.code);
            removeDropdown(input);
        });
        dd.appendChild(item);
    });

    // Position below the input
    const rect = input.getBoundingClientRect();
    dd.style.position = "fixed";
    dd.style.top  = (rect.bottom + 4) + "px";
    dd.style.left = rect.left + "px";
    dd.style.width = Math.max(rect.width, 280) + "px";

    document.body.appendChild(dd);
    input._acDropdown = dd;
    input._acResults  = results;
    input._acActive   = -1;
}

function setActive(dd, idx) {
    const items = dd.querySelectorAll("div[data-idx]");
    items.forEach(el => {
        el.style.background = el.dataset.idx == idx ? "var(--surface-2)" : "";
    });
    dd._activeIdx = idx;
}

// ── Public: attach to an input ─────────────────────────────────────────────

export async function attachAirportSearch(input) {
    if (input._acAttached) return;
    input._acAttached = true;

    // Force uppercase as user types (IATA convention)
    const airports = await loadAirports();

    input.setAttribute("autocomplete", "off");

    input.addEventListener("input", () => {
        const val = input.value;
        // Uppercase the portion that looks like a direct IATA entry
        const results = search(airports, val);
        showDropdown(input, results, code => {
            input.value = code;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });
    });

    input.addEventListener("keydown", e => {
        const dd = input._acDropdown;
        if (!dd) return;
        const items   = dd.querySelectorAll("div[data-idx]");
        const current = dd._activeIdx ?? -1;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = Math.min(current + 1, items.length - 1);
            setActive(dd, next);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const prev = Math.max(current - 1, -1);
            setActive(dd, prev);
        } else if (e.key === "Enter") {
            if (current >= 0 && input._acResults?.[current]) {
                e.preventDefault();
                input.value = input._acResults[current].code;
                input.dispatchEvent(new Event("change", { bubbles: true }));
                removeDropdown(input);
            }
        } else if (e.key === "Escape") {
            removeDropdown(input);
        }
    });

    input.addEventListener("blur", () => {
        // Short delay so mousedown on dropdown item fires first
        setTimeout(() => removeDropdown(input), 150);
    });
}

// Convenience: attach to element by ID (no-op if not found)
export async function attachById(id) {
    const el = document.getElementById(id);
    if (el) await attachAirportSearch(el);
}