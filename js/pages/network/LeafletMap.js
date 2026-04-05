// js/pages/network/LeafletMap.js
// All Leaflet (L) references live inside function bodies — never at module scope.

let _map    = null;
let _bases  = [];   // { layer, data }
let _routes = [];   // { layer, data }

// ── Airline colour palette (deterministic by index) ───────────────────────────
const PALETTE = [
    "#2f81f7","#3fb950","#d29922","#f85149","#bc8cff",
    "#39d353","#ff7b72","#ffa657","#79c0ff","#56d364"
];
export function airlineColor(idx) { return PALETTE[idx % PALETTE.length]; }

// ── Init ──────────────────────────────────────────────────────────────────────
export function initMap(containerId = "map", view = [30, 10], zoom = 3) {
    _map = L.map(containerId, { zoomControl: false }).setView(view, zoom);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap © CARTO",
        maxZoom: 19
    }).addTo(_map);

    L.control.zoom({ position: "bottomright" }).addTo(_map);
    return _map;
}

export function getMap() { return _map; }

// ── Clear ─────────────────────────────────────────────────────────────────────
export function clearLayers() {
    [..._bases, ..._routes].forEach(item => _map?.removeLayer(item.layer));
    _bases  = [];
    _routes = [];
}

export function clearRoutes() {
    _routes.forEach(item => _map?.removeLayer(item.layer));
    _routes = [];
}

export function clearBases() {
    _bases.forEach(item => _map?.removeLayer(item.layer));
    _bases = [];
}

// ── Base marker ───────────────────────────────────────────────────────────────
export function addBaseMarker({ lat, lon, iata, airlineName, color = "#2f81f7", onRaiseIssue }) {
    const cap = color;

    const marker = L.circleMarker([lat, lon], {
        radius: 7, color: cap, weight: 2,
        fillColor: cap, fillOpacity: 0.9,
        pane: "markerPane"
    });

    const popupHtml = `
    <div class="lf-popup">
        <div class="lf-popup-title">🏢 ${iata}</div>
        <div class="lf-popup-row"><span>Airline</span><span>${airlineName}</span></div>
        <hr class="lf-popup-divider">
        <div class="lf-popup-actions">
            <button class="lf-btn lf-btn-primary" onclick="window._mapView?.openIssueModal({type:'Build Lounge',target:'${iata}',sub:'Lounge at ${iata}'})">Request Lounge</button>
            <button class="lf-btn lf-btn-ghost"  onclick="window._mapView?.openIssueModal({type:'Add Route',targetA:'${iata}',sub:'Route from ${iata}'})">Request Route</button>
        </div>
    </div>`;

    marker.bindPopup(popupHtml, { className: "dark-popup", maxWidth: 260 });
    marker.addTo(_map);
    _bases.push({ layer: marker, data: { iata, airlineName } });
    return marker;
}

// ── Route line ────────────────────────────────────────────────────────────────
/**
 * Draw a geodesic-ish arc between two points by interpolating intermediate
 * points on a great circle. Handles antimeridian crossing.
 */
function greatCirclePoints(from, to, steps = 50) {
    const toRad = d => d * Math.PI / 180;
    const toDeg = r => r * 180 / Math.PI;

    const [lat1, lon1] = from.map(toRad);
    const [lat2, lon2] = to.map(toRad);

    const d = 2 * Math.asin(Math.sqrt(
        Math.sin((lat2-lat1)/2)**2 +
        Math.cos(lat1)*Math.cos(lat2)*Math.sin((lon2-lon1)/2)**2
    ));

    if (d === 0) return [from, to];

    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const A = Math.sin((1-f)*d) / Math.sin(d);
        const B = Math.sin(f*d)     / Math.sin(d);
        const x = A*Math.cos(lat1)*Math.cos(lon1) + B*Math.cos(lat2)*Math.cos(lon2);
        const y = A*Math.cos(lat1)*Math.sin(lon1) + B*Math.cos(lat2)*Math.sin(lon2);
        const z = A*Math.sin(lat1)                + B*Math.sin(lat2);
        pts.push([toDeg(Math.atan2(z, Math.sqrt(x*x+y*y))), toDeg(Math.atan2(y, x))]);
    }

    // Handle antimeridian: if longitude jumps >180° between points, split
    const segments = [[]];
    for (let i = 0; i < pts.length; i++) {
        const seg = segments[segments.length - 1];
        if (seg.length > 0) {
            const prevLon = seg[seg.length - 1][1];
            if (Math.abs(pts[i][1] - prevLon) > 180) {
                segments.push([]);
            }
        }
        segments[segments.length - 1].push(pts[i]);
    }
    return segments;
}

export function addRouteLine({ from, to, color = "#2f81f7", weight = 1.5, opacity = 0.65, popupHtml = "" }) {
    const segments = greatCirclePoints(from, to);
    const layers = [];

    segments.forEach(seg => {
        if (seg.length < 2) return;
        const line = L.polyline(seg, { color, weight, opacity });
        if (popupHtml) line.bindPopup(popupHtml, { className: "dark-popup", maxWidth: 280 });
        line.addTo(_map);
        layers.push(line);
    });

    // Store all segments as one logical route
    const group = { layer: { remove: () => layers.forEach(l => _map?.removeLayer(l)) }, data: {} };
    _routes.push(group);
    return layers;
}

// ── Leaflet dark popup CSS (injected once) ────────────────────────────────────
const _style = document.createElement("style");
_style.textContent = `
.dark-popup .leaflet-popup-content-wrapper {
    background: #161b22; border: 1px solid #30363d;
    color: #e6edf3; border-radius: 6px; padding: 0;
    box-shadow: 0 8px 24px rgba(0,0,0,.6);
}
.dark-popup .leaflet-popup-content { margin: 12px 14px; }
.dark-popup .leaflet-popup-tip-container { display: none; }
.dark-popup .leaflet-popup-close-button { color: #8b949e; top: 8px; right: 10px; }
.dark-popup .leaflet-popup-close-button:hover { color: #e6edf3; background: none; }
`;
document.head.appendChild(_style);