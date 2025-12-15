let map;
let airlineLayers = {};      // Group 1: All routes by specific airline
let baseLayers = {};         // Group 3: All routes from an airport (any airline)
let airlineBaseLayers = {};  // Group 2: All routes by specific airline from specific base
let catchmentLayers = {};    // Hub-specific catchment layer groups
let allBounds = L.latLngBounds();
let currentMode = 'airline';

async function initMap() {
    const data = await fetch('data.json').then(res => res.json());
    const catchmentsData = await fetch('catchments.json').then(res => res.json());

    map = L.map('map', {
        minZoom: 2,
        maxZoom: 7,
        worldCopyJump: true,
        zoomControl: false // Remove zoom buttons so they are not in the way of sidebar toggle
    }).setView([38, 135], 4);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
    }).addTo(map);

        // Create a dedicated pane for base markers
    map.createPane('baseMarkerPane');
    map.getPane('baseMarkerPane').style.zIndex = 650;  // Above overlays (default 400) but below popups (700)

    // Sidebar & Tab Logic (unchanged)
    function switchTab(mode) {
        if (mode === currentMode) return;
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        document.getElementById(`${mode}-controls`).classList.add('active');
        document.querySelector(`.tab-button[data-tab="${mode}"]`).classList.add('active');

        Object.values(airlineLayers).forEach(l => map.addLayer(l));
        Object.values(baseLayers).forEach(l => map.addLayer(l));
        Object.values(airlineBaseLayers).forEach(l => map.addLayer(l));

        document.querySelectorAll('#tab-content input[type="checkbox"]').forEach(cb => cb.checked = true);
        currentMode = mode;
    }

    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('toggle-sidebar').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('hidden');
        document.getElementById('toggle-sidebar').textContent = sidebar.classList.contains('hidden') ? '»' : '«';
    });

    // Route & Marker Rendering
    for (const [airlineCode, airline] of Object.entries(data.airlines)) {
        airlineLayers[airlineCode] = L.layerGroup().addTo(map);

        for (const [baseCode, base] of Object.entries(airline.bases)) {
            if (!baseLayers[baseCode]) baseLayers[baseCode] = L.layerGroup().addTo(map);
            const airlineBaseKey = `${airlineCode}-${baseCode}`;
            if (!airlineBaseLayers[airlineBaseKey]) airlineBaseLayers[airlineBaseKey] = L.layerGroup().addTo(map);

            // Base Markers with Popup + Toggle Button
            if (!baseLayers[baseCode]._baseMarkers) baseLayers[baseCode]._baseMarkers = [];
            const airport = data.airports[baseCode];
            if (airport) {
                const offsets = [-360, 0, 360];
                offsets.forEach(offset => {
                    const offsetLng = airport.lon + offset;
                    const offsetLatLng = [airport.lat, offsetLng];
                    if (offset === 0 || !baseLayers[baseCode]._baseMarkers.some(m => m.getLatLng().lng === offsetLng)) {
                        const baseMarker = L.circleMarker(offsetLatLng, {
                            radius: 6,
                            fillColor: '#ffffff',
                            color: '#000000',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 1.0,
                            pane: 'baseMarkerPane'  // Assign to the high-z-index pane
                        }).addTo(map);

                        // Enhanced Popup with Dropdown for Catchment Selection
                        const popupDiv = document.createElement('div');
                        popupDiv.innerHTML = `<b>${baseCode}</b><br>`;
                        const catchmentSelect = document.createElement('select');
                        catchmentSelect.style.marginTop = '8px';
                        catchmentSelect.style.width = '100%';
                        catchmentSelect.style.padding = '4px';

                        // Default option
                        const defaultOption = document.createElement('option');
                        defaultOption.value = '';
                        defaultOption.textContent = '— Select Catchment —';
                        defaultOption.selected = true;
                        catchmentSelect.appendChild(defaultOption);

                        // Populate options from catchmentsData if available for this hub
                        if (catchmentsData.hubs && catchmentsData.hubs[baseCode] && catchmentsData.hubs[baseCode].catchments) {
                            catchmentsData.hubs[baseCode].catchments.forEach((c, index) => {
                                const option = document.createElement('option');
                                option.value = index;  // Use index or name as identifier
                                option.textContent = c.name;
                                catchmentSelect.appendChild(option);
                            });
                        }

                        catchmentSelect.onchange = function(e) {
                            e.stopPropagation();
                            const selectedIndex = this.value;

                            // Remove existing catchment for this hub
                            if (catchmentLayers[baseCode]) {
                                map.removeLayer(catchmentLayers[baseCode]);
                                delete catchmentLayers[baseCode];
                            }

                            if (selectedIndex !== '' && catchmentsData.hubs[baseCode]) {
                                const selectedCatchment = catchmentsData.hubs[baseCode].catchments[selectedIndex];
                                // Render only the selected catchment group (core + its primary/secondary)
                                renderSelectedCatchmentForHub(baseCode, catchmentsData.hubs[baseCode], selectedCatchment, airport);
                                map.addLayer(catchmentLayers[baseCode]);
                            }
                        };

                        popupDiv.appendChild(catchmentSelect);
                        baseMarker.bindPopup(popupDiv);
                    }
                });
            }

            // Routes (unchanged)
            for (const route of base.routes) {
                const origin = data.airports[baseCode];
                const dest = data.airports[route.destination];
                if (!origin || !dest) continue;
                const offsets = [-360, 0, 360];
                offsets.forEach(offset => {
                    const offsetOrigin = [origin.lat, origin.lon + offset];
                    const offsetDest = [dest.lat, dest.lon + offset];
                    const geodesic = new L.Geodesic([offsetOrigin, offsetDest], {
                        color: airline.color,
                        weight: 1.25,
                        opacity: 0.6,
                        wrap: false,
                        steps: 32
                    });
                    geodesic.addTo(airlineLayers[airlineCode]);
                    geodesic.addTo(baseLayers[baseCode]);
                    geodesic.addTo(airlineBaseLayers[airlineBaseKey]);
                    if (offset === 0) {
                        allBounds.extend([origin.lat, origin.lon]);
                        allBounds.extend([dest.lat, dest.lon]);
                    }
                });
            }
        }
    }

    if (allBounds.isValid()) map.fitBounds(allBounds.pad(0.1));

    generateControls(data);
}

// Catchment Rendering Functions:
function renderCatchmentsForHub(hubCode, hubData, airport) {
    if (!hubData || !airport) return;
    const hubLatLng = [airport.lat, airport.lon];
    const layerGroup = L.layerGroup();
    catchmentLayers[hubCode] = layerGroup;

    // Core Circle
    if (hubData.core_radius_km) {
        L.circle(hubLatLng, {
            radius: hubData.core_radius_km * 1000,
            color: '#FFFFFF',
            weight: 1,
            opacity: 0.5,
            fillOpacity: 0.15
        }).addTo(layerGroup);
    }

    // Catchment Groups
    hubData.catchments.forEach(c => {
        const baseOpacity = 0.5;
        ['primary', 'secondary'].forEach(type => {
            const sectors = c[type] || [];
            const opacity = type === 'secondary' ? baseOpacity - (c.secondary_alpha_reduction || 0.3) : baseOpacity;
            sectors.forEach(sec => {
                const sectorPoly = turf.sector([airport.lon, airport.lat], sec.length_km, sec.start_heading_deg, sec.end_heading_deg, {steps: 64, units: 'kilometers'});
                L.geoJSON(sectorPoly, {
                    style: {
                        color: c.color,
                        weight: 1,
                        opacity: opacity,
                        fillOpacity: opacity * 0.6
                    }
                }).addTo(layerGroup);
            });
        });
    });
}

function renderSelectedCatchmentForHub(hubCode, hubData, selectedCatchment, airport) {
    if (!hubData || !selectedCatchment || !airport) return;
    const hubLatLng = [airport.lat, airport.lon];
    const layerGroup = L.layerGroup();
    catchmentLayers[hubCode] = layerGroup;

    const constantGray = '#808080';  // Fixed gray color for all catchment elements
    const baseOpacity = 0.5;

    // Core Circle
    if (hubData.core_radius_km) {
        L.circle(hubLatLng, {
            radius: hubData.core_radius_km * 1000,
            color: constantGray,
            weight: 1,
            opacity: baseOpacity,
            fillOpacity: baseOpacity * 0.3
        }).addTo(layerGroup);
    }

    // Selected Catchment Sectors
    ['primary', 'secondary'].forEach(type => {
        const sectors = selectedCatchment[type] || [];
        const opacity = type === 'secondary' ? baseOpacity - (selectedCatchment.secondary_alpha_reduction || 0.3) : baseOpacity;
        sectors.forEach(sec => {
            const sectorPoly = turf.sector([airport.lon, airport.lat], sec.length_km, sec.start_heading_deg, sec.end_heading_deg, {steps: 64, units: 'kilometers'});
            L.geoJSON(sectorPoly, {
                style: {
                    color: constantGray,
                    weight: 1,
                    opacity: opacity,
                    fillOpacity: opacity * 0.6
                }
            }).addTo(layerGroup);
        });
    });
}

function generateControls(data) {
    const airlineDiv = document.getElementById('airline-controls');
    const baseDiv = document.getElementById('base-controls');
    const airlineBaseDiv = document.getElementById('airline-base-controls');
    const legendDiv = document.getElementById('legend');

    airlineDiv.innerHTML = '<h3>Filter by Airline</h3>';
    baseDiv.innerHTML = '<h3>Filter by Origin Base</h3>';
    airlineBaseDiv.innerHTML = '<h3>Filter by Airline Base</h3>';
    legendDiv.innerHTML = '';

    // === Airline Controls ===
    for (const [code, airline] of Object.entries(data.airlines)) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `airline-${code}`;
        checkbox.checked = true;  // Start with all selected

        checkbox.onchange = function() {
            if (currentMode !== 'airline') return;

            // Always hide all airline layers first
            Object.values(airlineLayers).forEach(l => map.removeLayer(l));

            // Show only checked airlines
            const checked = document.querySelectorAll('#airline-controls input[type="checkbox"]:checked');
            checked.forEach(cb => {
                const layerCode = cb.id.replace('airline-', '');
                map.addLayer(airlineLayers[layerCode]);
            });

            // If none checked, keep all hidden (empty routes, bases remain visible)
        };

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = airline.name;

        airlineDiv.appendChild(checkbox);
        airlineDiv.appendChild(label);
        airlineDiv.appendChild(document.createElement('br'));

        // Legend
        const item = document.createElement('div');
        item.className = 'legend-item';
        const colorBox = document.createElement('div');
        colorBox.className = 'legend-color';
        colorBox.style.backgroundColor = airline.color;
        const text = document.createElement('span');
        text.textContent = airline.name;
        item.appendChild(colorBox);
        item.appendChild(text);
        legendDiv.appendChild(item);
    }

    // === Origin Base Controls ===
    const bases = new Set();
    for (const airline of Object.values(data.airlines)) {
        Object.keys(airline.bases).forEach(b => bases.add(b));
    }
    for (const baseCode of bases) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `base-${baseCode}`;
        checkbox.checked = true;

        checkbox.onchange = function() {
            if (currentMode !== 'base') return;

            Object.values(baseLayers).forEach(l => map.removeLayer(l));

            const checked = document.querySelectorAll('#base-controls input[type="checkbox"]:checked');
            if (checked.length === 0) {
                Object.values(baseLayers).forEach(l => map.addLayer(l));
            } else {
                checked.forEach(cb => {
                    const layerCode = cb.id.replace('base-', '');
                    map.addLayer(baseLayers[layerCode]);
                });
            }
        };

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = baseCode;

        baseDiv.appendChild(checkbox);
        baseDiv.appendChild(label);
        baseDiv.appendChild(document.createElement('br'));
    }

    // For Origin Base
    checkbox.onchange = function() {
        if (currentMode !== 'base') return;

        Object.values(baseLayers).forEach(l => map.removeLayer(l));

        const checked = document.querySelectorAll('#base-controls input[type="checkbox"]:checked');
        checked.forEach(cb => {
            const layerCode = cb.id.replace('base-', '');
            map.addLayer(baseLayers[layerCode]);
        });
        // No "show all" fallback when none checked
    };

    // For Airline-Base
    checkbox.onchange = function() {
        if (currentMode !== 'airline-base') return;

        Object.values(airlineBaseLayers).forEach(l => map.removeLayer(l));

        const checked = document.querySelectorAll('#airline-base-controls input[type="checkbox"]:checked');
        checked.forEach(cb => {
            const layerKey = cb.id.replace('airlinebase-', '');
            map.addLayer(airlineBaseLayers[layerKey]);
        });
        // No "show all" fallback when none checked
    };
}

initMap();