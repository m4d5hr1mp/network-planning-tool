// js/pages/airline-dashboard/AirlineStatistics.js
// Populates the network statistics panel on the airline dashboard.
// Currently renders placeholder dashes — will be wired to real data
// once the JSON import pipeline is stable and route data includes
// capacity and price fields reliably.

/**
 * @param {object} airline  - airline doc from Firestore
 * @param {Array}  routes   - route docs for this airline
 */
export function populateStatistics(airline, routes) {
    // Update panel title
    const titleEl = document.getElementById("statsTitle");
    if (titleEl) titleEl.textContent = `${airline?.username || "—"} Network Information`;

    // TODO: compute from routes once capacity/price fields are populated via import
    // - avgRouteLength: haversine(origin, dest) averaged across all routes (needs airports_clean.json lookup by acId)
    // - avgFrequency: sum(frequency) / routes.length
    // - avgRevenuePerKm: sum(price.total * frequency) / sum(distance * frequency)
    // - avgProfitPerKm: requires cost model (fuel burn, crew, etc.) — out of scope for now
    // - operationalMargin: profit / revenue
    //
    // Passenger class split:
    // - totalPax: sum(capacity.total * frequency) across all routes
    // - economyPct: sum(capacity.economy * frequency) / totalPax
    // - etc.

    // For now all values stay as "—" (set in HTML)
    // Uncomment and implement below when ready:

    /*
    if (!routes.length) return;

    const totalSeats = routes.reduce((s, r) => s + (r.capacity?.total || 0) * r.frequency, 0);
    const econSeats  = routes.reduce((s, r) => s + (r.capacity?.economy || 0) * r.frequency, 0);
    const bizSeats   = routes.reduce((s, r) => s + (r.capacity?.business || 0) * r.frequency, 0);
    const firstSeats = routes.reduce((s, r) => s + (r.capacity?.first || 0) * r.frequency, 0);
    const avgFreq    = routes.reduce((s, r) => s + r.frequency, 0) / routes.length;

    document.querySelector(".pax-total").childNodes[0].textContent = totalSeats.toLocaleString();
    // update donut conic-gradient percentages...
    // update legend values...
    // update metric-value spans...
    */
}