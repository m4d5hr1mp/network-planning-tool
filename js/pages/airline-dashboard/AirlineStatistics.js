// js/pages/airline-dashboard/AirlineStatistics.js
// Computes and renders the network statistics panel.

// ── Pricing constants from Pricing.scala ─────────────────────────────────────
// modifierBrackets: list of (maxDistanceInBracket, ratePerKm)
const PRICE_BRACKETS = [[200, 0.25], [800, 0.125], [1000, 0.1], [Infinity, 0.05]];
const INTL_MULT  = 1.05;
const IC_MULT    = 1.10;
const FINAL_MULT = 1.5; // Pricing.scala line: (price * 1.5).toInt

// LinkClass.priceMultiplier — not in provided Scala, reverse-engineered from AC export data:
// economy $270 on 719km domestic → standard = $322 → ratio ≈ 0.839
// business $950 on same route → 950 / (322 * 3.5) = 0.843 ✓ consistent
// first $2100 on same route → 2100 / (322 * 7.0) = 0.932 (close enough, airlines price first differently)
const CLASS_MULT = { economy: 1.0, business: 3.5, first: 7.0 };

const INTL_TYPES = new Set([
    "Short-haul International", "Medium-haul International", "Long-haul International"
]);
const IC_TYPES = new Set([
    "Short-haul Intercontinental", "Medium-haul Intercontinental",
    "Long-haul Intercontinental", "Ultra Long-haul Intercontinental"
]);

/** Compute AC standard price for a given distance, flightType, and cabin class. */
function defaultPrice(distance, flightType, cabinClass) {
    let remain = distance;
    let price  = 100.0;

    for (const [bracketSize, rate] of PRICE_BRACKETS) {
        if (remain <= 0) break;
        price  += Math.min(remain, bracketSize) * rate;
        remain -= bracketSize;
    }

    const ftMult = IC_TYPES.has(flightType) ? IC_MULT
                 : INTL_TYPES.has(flightType) ? INTL_MULT
                 : 1.0;

    return Math.floor(price * ftMult * CLASS_MULT[cabinClass] * FINAL_MULT);
}

// ── Haul classification ───────────────────────────────────────────────────────
// Categories are mutually exclusive; routes fall into exactly one bucket.
// Feeder: not base-to-base AND distance < 500
// Short:  distance < 1250 (and not feeder)
// Medium: 1250–4499
// IC:     4500–9999
// ULH:    10000+

function classify(dist, isBaseToBase) {
    if (dist === null) return null;
    if (dist < 500 && !isBaseToBase) return "F";
    if (dist < 1250)                  return "SH";
    if (dist < 4500)                  return "MH";
    if (dist < 10000)                 return "IC";
    return "ULH";
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function fmt(n, decimals = 0) {
    if (n === null || isNaN(n)) return "—";
    return n.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function updateDonut(econPct, bizPct, firstPct) {
    const donut = document.querySelector(".donut");
    if (!donut) return;
    const e = econPct, b = bizPct, f = firstPct;
    donut.style.background =
        `conic-gradient(var(--accent) 0% ${e}%, var(--success) ${e}% ${e+b}%, var(--warning) ${e+b}% 100%)`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * @param {object} airline   - airline doc { username, displayName, ... }
 * @param {Array}  routes    - route docs for this airline
 * @param {Array}  bases     - base docs for this airline (for trunk classification)
 */
export function populateStatistics(airline, routes, bases = []) {
    // Panel title uses display name
    set("statsTitle", `${airline?.displayName || airline?.username || "—"} Network Information`);

    if (!routes.length) return;

    // Set of base IATAs for this airline
    const baseIatas = new Set(bases.map(b => b.iata));

    // ── Per-route enrichment ─────────────────────────────────────────────────
    const enriched = routes
        .map(r => {
            const dist        = r.distance ?? null;
            const isB2B       = baseIatas.has(r.originIata) && baseIatas.has(r.destinationIata);
            const bucket      = classify(dist, isB2B);
            const ft          = r.flightType || "";

            // Weekly seat-km (capacity × frequency × distance)
            const freqCapY    = (r.capacity?.economy  || 0) * r.frequency;
            const freqCapJ    = (r.capacity?.business || 0) * r.frequency;
            const freqCapF    = (r.capacity?.first    || 0) * r.frequency;
            const freqCapTot  = (r.capacity?.total    || 0) * r.frequency;

            // Weekly revenue = price × seats × frequency
            const revY  = (r.price?.economy  || 0) * freqCapY;
            const revJ  = (r.price?.business || 0) * freqCapJ;
            const revF  = (r.price?.first    || 0) * freqCapF;
            const revTot = revY + revJ + revF;

            // Default prices for % computation
            const defY  = dist ? defaultPrice(dist, ft, "economy")  : null;
            const defJ  = dist ? defaultPrice(dist, ft, "business") : null;
            const defF  = dist ? defaultPrice(dist, ft, "first")    : null;

            return {
                ...r, dist, bucket,
                freqCapY, freqCapJ, freqCapF, freqCapTot,
                revTot,
                defY, defJ, defF
            };
        });

    // ── Top metrics ──────────────────────────────────────────────────────────
    const withDist = enriched.filter(r => r.dist !== null);

    const avgDist = withDist.length
        ? withDist.reduce((s, r) => s + r.dist, 0) / withDist.length
        : null;

    const avgFreq = enriched.reduce((s, r) => s + r.frequency, 0) / enriched.length;

    // Avg revenue/km = sum(weekly revenue) / sum(weekly route-km)
    // weekly route-km = frequency * distance
    const totalRevenue   = withDist.reduce((s, r) => s + r.revTot, 0);
    const totalRouteKm   = withDist.reduce((s, r) => s + r.frequency * r.dist, 0);
    const avgRevKm = totalRouteKm > 0 ? totalRevenue / totalRouteKm : null;

    set("statAvgDist", fmt(avgDist));
    set("statAvgFreq", fmt(avgFreq, 1));
    set("statRevKm",   avgRevKm !== null ? `$${fmt(avgRevKm, 2)}` : "—");
    // Profit/km and margin require cost model — not available from AC export
    set("statProfKm",  "N/A");
    set("statMargin",  "N/A");

    // ── Passenger class split ────────────────────────────────────────────────
    const totalY   = enriched.reduce((s, r) => s + r.freqCapY,   0);
    const totalJ   = enriched.reduce((s, r) => s + r.freqCapJ,   0);
    const totalF   = enriched.reduce((s, r) => s + r.freqCapF,   0);
    const totalPax = enriched.reduce((s, r) => s + r.freqCapTot, 0);

    set("statPaxTotal", totalPax.toLocaleString());

    if (totalPax > 0) {
        const pctY = totalY / totalPax * 100;
        const pctJ = totalJ / totalPax * 100;
        const pctF = totalF / totalPax * 100;

        set("statPaxY",    totalY.toLocaleString());
        set("statPaxJ",    totalJ.toLocaleString());
        set("statPaxF",    totalF.toLocaleString());
        set("statPaxYpct", `${fmt(pctY, 1)}%`);
        set("statPaxJpct", `${fmt(pctJ, 1)}%`);
        set("statPaxFpct", `${fmt(pctF, 1)}%`);

        updateDonut(pctY, pctJ, pctF);
    }

    // ── Haul table ───────────────────────────────────────────────────────────
    const BUCKETS   = ["F", "SH", "MH", "IC", "ULH"];
    const bucketMap = {};
    BUCKETS.forEach(b => bucketMap[b] = enriched.filter(r => r.bucket === b));

    BUCKETS.forEach(b => {
        const group = bucketMap[b];
        if (!group.length) return;

        const withD = group.filter(r => r.dist !== null);

        // Avg length
        const avgLen = withD.length
            ? withD.reduce((s, r) => s + r.dist, 0) / withD.length
            : null;
        set(`haulLen${b}`, avgLen !== null ? `${fmt(avgLen)} km` : "—");

        // Avg price Y/J/F (weighted by seats served)
        const totalFreqCapY = group.reduce((s, r) => s + r.freqCapY, 0);
        const totalFreqCapJ = group.reduce((s, r) => s + r.freqCapJ, 0);
        const totalFreqCapF = group.reduce((s, r) => s + r.freqCapF, 0);
        const avgPrY = totalFreqCapY > 0
            ? group.reduce((s, r) => s + (r.price?.economy  || 0) * r.freqCapY, 0) / totalFreqCapY : null;
        const avgPrJ = totalFreqCapJ > 0
            ? group.reduce((s, r) => s + (r.price?.business || 0) * r.freqCapJ, 0) / totalFreqCapJ : null;
        const avgPrF = totalFreqCapF > 0
            ? group.reduce((s, r) => s + (r.price?.first    || 0) * r.freqCapF, 0) / totalFreqCapF : null;

        const priceStr = [avgPrY, avgPrJ, avgPrF]
            .map(p => p !== null ? `$${fmt(p)}` : "—")
            .join(" / ");
        set(`haulPriceStr${b}`, priceStr);

        // Price % of default — routes that have both price and distance
        const withPriceDist = group.filter(r =>
            r.dist && r.defY && r.price?.economy
        );
        if (withPriceDist.length) {
            const avgPctY = withPriceDist.reduce((s, r) => s + (r.price.economy  / r.defY  * 100), 0) / withPriceDist.length;
            const avgPctJ = withPriceDist.filter(r => r.defJ).reduce((s, r) => s + (r.price.business / r.defJ * 100), 0) / (withPriceDist.filter(r => r.defJ).length || 1);
            const avgPctF = withPriceDist.filter(r => r.defF).reduce((s, r) => s + (r.price.first    / r.defF * 100), 0) / (withPriceDist.filter(r => r.defF).length || 1);
            set(`haulPricePct${b}`, `${fmt(avgPctY, 1)}% / ${fmt(avgPctJ, 1)}% / ${fmt(avgPctF, 1)}%`);
        } else {
            set(`haulPricePct${b}`, "—");
        }

        // Profit margin — not available
        set(`haulMargin${b}`, "N/A");
    });
}