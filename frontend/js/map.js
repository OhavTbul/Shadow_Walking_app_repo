class MapManager {
    constructor() {
        this.map = null;
        this.startMarker = null;
        this.endMarker = null;
        this.startPointCoords = null;
        this.endPointCoords = null;
        this.isSettingPoints = false;
        this.shadowRefreshInterval = null;
        this.shadowRefreshRate = 15 * 60 * 1000;
        this.lastShadowUpdateTime = null;
        this.currentPoint = 'start';
        this.shadeWeight = 1.0;
        this.lastShadowsData = null; // ישמש לשמירת הצללים האחרונים שנטענו (בין אם עתידיים או נוכחיים)
        this.lastRouteData = null;
        this.routeCalculationTimeout = null;
        this.comparisonRoutes = [];
        this.currentComparisonIndex = 0;
        this.mapStyles = {
            streets: 'https://api.maptiler.com/maps/streets/style.json?key=9nCgTFPJn6Zp08161WIx',
            satellite: 'https://api.maptiler.com/maps/hybrid/style.json?key=9nCgTFPJn6Zp08161WIx',
            terrain: 'https://api.maptiler.com/maps/terrain/style.json?key=9nCgTFPJn6Zp08161WIx',
            basic: 'https://api.maptiler.com/maps/basic-v2/style.json?key=9nCgTFPJn6Zp08161WIx',
            night: 'https://api.maptiler.com/maps/streets-v2-dark/style.json?key=9nCgTFPJn6Zp08161WIx'
        };
        this.currentMapStyleKey = 'streets';
        this.comparisonStatsElement = document.getElementById('comparisonStatsDisplay');
        this.initializeMap();
    }

    initializeMap() {
        this.map = new maplibregl.Map({
            container: 'map',
            style: this.mapStyles.streets,
            center: [34.8035, 31.2639], // BGU Coords
            zoom: 16,
            pitch: 45,
            bearing: -17.6,
            antialias: true
        });

        this.map.addControl(new maplibregl.NavigationControl(), 'top-right');

        this.map.on('load', () => {
            console.log('Map loaded');
            this.add3DBuildings();
            this.map.on('click', (e) => this.handleMapClick(e));
            console.log("MapManager: Requesting shadows for client's current time on initial load.");
            this.resetShadowsToCurrentTime().catch(error => {
            console.error("MapManager: Error loading shadows for client's current time on initial load:", error);
            });
            this.startShadowAutoRefresh();
        });

        this.map.on('error', (e) => {
            console.error('MapLibre GL Error:', e.error);
            this.showError('Map loading error. Please try refreshing.');
        });
    }

add3DBuildings() {
    // הסר שכבה קיימת אם יש
    if (this.map.getLayer('3d-buildings')) {
        try {
            this.map.removeLayer('3d-buildings');
        } catch (e) {
            console.warn("MapManager: Failed to remove existing 3d-buildings layer", e);
        }
    }

    // קבע את source וה-layer לפי הסגנון הנוכחי
    let sourceName = 'openmaptiles';
    let sourceLayerName = 'building';

    if (this.currentMapStyleKey === 'night') {
        sourceName = 'maptiler_planet';
        sourceLayerName = 'building';
    }

    // בדיקה שה-source באמת קיים
    if (!this.map.getSource(sourceName)) {
        console.warn(`MapManager: Source "${sourceName}" not found in current style "${this.currentMapStyleKey}". Cannot add 3D buildings.`);
        return;
    }

    // מצא שכבת תוויות שנכניס לפניה
    const layers = this.map.getStyle().layers;
    let labelLayerId;
    for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
            labelLayerId = layers[i].id;
            break;
        }
    }

    // הוסף שכבת בניינים
    this.map.addLayer({
        'id': '3d-buildings',
        'source': sourceName,
        'source-layer': sourceLayerName,
        'filter': ['==', 'extrude', 'true'],
        'type': 'fill-extrusion',
        'minzoom': 15,
        'paint': {
            'fill-extrusion-color': '#cccccc',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.65
        }
    }, labelLayerId);
}


    handleMapClick(e) {
        if (!this.isSettingPoints) return;
        const lngLat = e.lngLat;
        if (this.currentPoint === 'start') {
            this.setStartPoint(lngLat);
            this.currentPoint = 'end';
            this.updateSetPointsButtonState(true, 'Tap map to set Destination');
        } else {
            this.setEndPoint(lngLat);
            this.isSettingPoints = false;
            this.currentPoint = 'start';
            this.updateSetPointsButtonState(false);
            this.calculateRoute();
        }
    }

// בקובץ map.js, בתוך class MapManager
setMapStyle(styleKey, newShadowDataForStyleArg) {
    return new Promise((resolveOuter, rejectOuter) => { // Promise חיצוני
        console.log(`MapManager: setMapStyle called. Target style: '${styleKey}'. Current style: '${this.currentMapStyleKey}'.`);
        try {
            console.log(`MapManager: newShadowDataForStyleArg received:`, newShadowDataForStyleArg ? JSON.parse(JSON.stringify(newShadowDataForStyleArg)) : 'null or undefined');
        } catch (e) {
            console.error("MapManager: Error stringifying newShadowDataForStyleArg for logging", e);
            console.log("MapManager: newShadowDataForStyleArg (raw):", newShadowDataForStyleArg);
        }

        if (!this.map) {
            // ... (טיפול בשגיאה נשאר אותו דבר)
            return rejectOuter(new Error("MapManager: Map object is not initialized."));
        }

        const processShadows = () => {
            // ... (הפונקציה processShadows נשארת כפי שהיא מההצעה הקודמת)
            console.log(`MapManager: (processShadows) Called for style '${styleKey}'.`);
            try {
                console.log(`MapManager: (processShadows) newShadowDataForStyleArg available:`, newShadowDataForStyleArg ? JSON.parse(JSON.stringify(newShadowDataForStyleArg)) : 'null or undefined');
            } catch (e) {
                 console.error("MapManager: (processShadows) Error stringifying newShadowDataForStyleArg for logging", e);
                 console.log("MapManager: (processShadows) newShadowDataForStyleArg (raw):", newShadowDataForStyleArg);
            }

            if (styleKey !== 'night') {
                if (newShadowDataForStyleArg && newShadowDataForStyleArg.features && newShadowDataForStyleArg.features.length > 0) {
                    console.log("MapManager: (processShadows) Displaying NEW shadows for day style using newShadowDataForStyleArg.");
                    this.displayShadows(newShadowDataForStyleArg);
                } else {
                    console.log("MapManager: (processShadows) Day style, but newShadowDataForStyleArg is empty or invalid. Clearing display.");
                    this.clearShadowDisplay();
                }
            } else {
                console.log("MapManager: (processShadows) Clearing shadow display because it's night style.");
                this.clearShadowDisplay();
            }
        };

        if (this.mapStyles[styleKey]) {
            if (this.currentMapStyleKey !== styleKey) {
                console.log(`MapManager: Style is different. Proceeding to change from '${this.currentMapStyleKey}' to '${styleKey}'.`);
                let styleUrl = this.mapStyles[styleKey];
                try {
                    const urlObject = new URL(styleUrl);
                    urlObject.searchParams.set('cb', new Date().getTime());
                    styleUrl = urlObject.toString();
                } catch (e) { /* שגיאה ב-cache busting, לא קריטי */ }

                // ניצור Promise פנימי שיטפל בהמתנה לאירועי המפה
                const styleChangePromise = new Promise((resolveInner, rejectInner) => {
                    let settled = false;

                    const onStyleData = () => {
                        if (settled) return;
                        this.map.off('error', onStyleError); // חשוב להסיר את המאזין השני
                        console.log(`MapManager: (onStyleData for ${styleKey}) 'styledata' event completed. Re-adding base layers and processing shadows.`);

                        this.add3DBuildings();
                        if (this.lastRouteData) this.displayRoute(this.lastRouteData);

                        processShadows();

                        settled = true;
                        resolveInner(); // Promise פנימי מסתיים
                    };

                    const onStyleError = (errEvent) => {
                        if (settled) return;
                        this.map.off('styledata', onStyleData); // חשוב להסיר את המאזין השני
                        console.error(`MapManager: (onStyleError for ${styleKey}) Map error:`, errEvent);
                        settled = true;
                        rejectInner(new Error(`Failed to set map style to '${styleKey}' after an error event.`)); // Promise פנימי נדחה
                    };

                    this.currentMapStyleKey = styleKey;
                    this.map.once('styledata', onStyleData);
                    this.map.once('error', onStyleError);

                    try {
                        this.map.setStyle(styleUrl);
                        console.log(`MapManager: map.setStyle call initiated for '${styleKey}'.`);
                    } catch (error) { // שגיאה סינכרונית מיידית מ-setStyle
                        if (settled) return;
                        this.map.off('styledata', onStyleData);
                        this.map.off('error', onStyleError);
                        console.error(`MapManager: Error immediately during map.setStyle for '${styleKey}':`, error);
                        settled = true;
                        rejectInner(error); // Promise פנימי נדחה
                    }
                });

                // ה-Promise החיצוני ימתין ל-Promise הפנימי
                styleChangePromise.then(() => {
                    console.log(`MapManager: styleChangePromise for '${styleKey}' resolved. Resolving outer promise.`);
                    resolveOuter();
                }).catch((error) => {
                    console.error(`MapManager: styleChangePromise for '${styleKey}' rejected. Rejecting outer promise.`, error);
                    this.showError(error.message || `Failed to set style ${styleKey}`);
                    rejectOuter(error);
                });

            } else { // Style is already the target style
                console.log(`MapManager: Map style is already '${styleKey}'. No style change needed. Ensuring shadow display is correct.`);
                this.add3DBuildings();
                if (this.lastRouteData) this.displayRoute(this.lastRouteData);

                processShadows();
                resolveOuter();
            }
        } else {
            // ... (טיפול בשגיאה נשאר אותו דבר)
            rejectOuter(new Error(`Style key "${styleKey}" not found`));
        }
    });
}
// בקובץ map.js, בתוך class MapManager
async loadShadowsForFutureTime(dateTimeString, loadingMessage = 'טוען צללים עתידיים...') {
    this.showLoading(loadingMessage);
    try {
        const response = await fetch('/shadows_at_time', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ datetime_str: dateTimeString }),
        });
        const data = await response.json();

        if (!response.ok) {
            const errorMsgFromServer = data.error || `שגיאה ${response.status} בטעינת צללים מהשרת`;
            throw new Error(errorMsgFromServer);
        }

        this.lastShadowUpdateTime = new Date(data.requested_time);
        this.updateLastShadowTimeDisplay(this.lastShadowUpdateTime);

        let geojsonData = null;
        if (data.shadows) {
            // ודא ש-data.shadows אינו מחרוזת ריקה לפני ניסיון ה-JSON.parse
            if (typeof data.shadows === 'string' && data.shadows.trim() !== '') {
                try {
                    geojsonData = JSON.parse(data.shadows);
                } catch (parseError) {
                    console.error("MapManager: Error parsing data.shadows JSON string:", parseError, "Raw data.shadows:", data.shadows);
                    // השאר את geojsonData כ-null אם יש שגיאת parse
                }
            } else if (typeof data.shadows === 'object' && data.shadows !== null) {
                geojsonData = data.shadows;
            }
        }

        const hasShadows = geojsonData && geojsonData.features && geojsonData.features.length > 0;
        const serverIndicatesNoShadows = data.message && (data.message.toLowerCase().includes('night') || data.message.toLowerCase().includes('no shadow'));
        const newStyleKey = (hasShadows && !serverIndicatesNoShadows) ? 'streets' : 'night';

        // הדפסות דיבאג חשובות:
        console.log(`loadShadowsForFutureTime: For time ${dateTimeString}`);
        console.log(`loadShadowsForFutureTime: hasShadows = ${hasShadows}, serverIndicatesNoShadows = ${serverIndicatesNoShadows}, calculated newStyleKey = ${newStyleKey}`);

        let geojsonDataForLog = 'null or undefined';
        if (geojsonData) {
            try {
                // ננסה להדפיס רק חלק קטן אם האובייקט גדול מאוד
                if (geojsonData.features && geojsonData.features.length > 5) {
                    geojsonDataForLog = `FeatureCollection with ${geojsonData.features.length} features (showing first 5): ` +
                                        JSON.stringify({ type: geojsonData.type, features: geojsonData.features.slice(0,5) });
                } else {
                    geojsonDataForLog = JSON.parse(JSON.stringify(geojsonData));
                }
            } catch (e) {
                geojsonDataForLog = "Error stringifying geojsonData for detailed logging";
            }
        }
        console.log(`loadShadowsForFutureTime: geojsonData being passed to setMapStyle:`, geojsonDataForLog);

        // !!! בדיקה קריטית עם alert ו-console.error !!!
        if (newStyleKey === 'streets') {
            console.error(`>>> CRITICAL DEBUG (loadShadowsForFutureTime): About to call setMapStyle for STREETS. geojsonData features count: ${geojsonData && geojsonData.features ? geojsonData.features.length : 'N/A'}`, geojsonData);
            await this.setMapStyle(newStyleKey, geojsonData);
            console.log('MapManager: Successfully called setMapStyle for streets with (potentially new) shadow data.');
        } else { // newStyleKey === 'night'
            console.error(">>> CRITICAL DEBUG (loadShadowsForFutureTime): About to call setMapStyle for NIGHT.");
            await this.setMapStyle(newStyleKey, null);
            console.log('MapManager: Successfully called setMapStyle for night with null shadow data.');
            if (serverIndicatesNoShadows && data.message) {
                 console.log('Server message:', data.message);
            }
        }

        return data.requested_time;

    } catch (error) {
        console.error('MapManager - loadShadowsForFutureTime error:', error);
        this.showError(error.message || 'שגיאה כללית בטעינת צללים עתידיים.');
        // במקרה של שגיאה, אולי כדאי לחזור לסגנון ברירת מחדל בטוח
        // await this.setMapStyle('streets', null); // לדוגמה, חזרה ליום ללא צללים
        throw error;
    } finally {
        this.hideLoading();
    }
}


    createCustomMarker(color, label) {
        const container = document.createElement('div');
        container.className = 'custom-marker-container';
        const inner = document.createElement('div');
        inner.className = 'custom-marker';
        inner.style.backgroundColor = color;
        inner.style.width = '30px'; inner.style.height = '30px';
        inner.style.borderRadius = '50%'; inner.style.border = '2px solid white';
        inner.style.display = 'flex'; inner.style.alignItems = 'center';
        inner.style.justifyContent = 'center'; inner.style.color = 'white';
        inner.style.fontWeight = 'bold'; inner.style.fontSize = '14px';
        inner.style.boxShadow = '0 0 5px rgba(0,0,0,0.5)';
        inner.innerText = label;
        container.appendChild(inner);
        return container;
    }

    setStartPoint(lngLat) {
        if (this.startMarker) this.startMarker.remove();
        this.startPointCoords = lngLat;
        const el = this.createCustomMarker('var(--primary-color)', 'S');
        this.startMarker = new maplibregl.Marker({ element: el }).setLngLat([lngLat.lng, lngLat.lat]).addTo(this.map);
    }

    setEndPoint(lngLat) {
        if (this.endMarker) this.endMarker.remove();
        this.endPointCoords = lngLat;
        const el = this.createCustomMarker('var(--danger-color)', 'E');
        this.endMarker = new maplibregl.Marker({ element: el }).setLngLat([lngLat.lng, lngLat.lat]).addTo(this.map);
    }

    updateSetPointsButtonState(isActive, customText = null) {
        const buttonExpanded = document.getElementById('setPointsBtnExpanded');
        const buttonCollapsed = document.getElementById('setPointsBtnSheet');
        const defaultText = 'קבע/נקה נקודות';
        const activeText = customText ? customText : 'לחץ על המפה... (בטל)';
        [buttonExpanded, buttonCollapsed].forEach(button => {
            if (button) {
                if (isActive) {
                    button.classList.add('active'); button.textContent = activeText;
                } else {
                    button.classList.remove('active'); button.textContent = defaultText;
                }
            }
        });
    }

    async calculateRoute() {
        if (!this.startPointCoords || !this.endPointCoords) {
            this.showError("Please set both start and destination points."); return;
        }
        const start = this.startPointCoords; const end = this.endPointCoords;
        this.showLoading('Calculating route...');
        try {
            const response = await fetch('/route', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start: [start.lat, start.lng], dest: [end.lat, end.lng],
                    shade_weight: this.shadeWeight
                })
            });
            const data = await response.json();
            if (response.ok && data.route && data.route.length > 0) {
                const routeGeoJSON = {
                    type: 'Feature', properties: {},
                    geometry: { type: 'LineString', coordinates: data.route.map(coord => [coord[1], coord[0]]) }
                };
                this.displayRoute(routeGeoJSON); this.updateRouteInfo(data);
                this.clearComparisonDisplay();
            } else {
                throw new Error(data.error || 'Failed to calculate route or route is empty');
            }
        } catch (error) {
            console.error('Route calculation error:', error);
            this.showError(error.message || 'Failed to connect to the routing server');
            this.clearRouteDisplay(); this.updateRouteInfo(null);
        } finally { this.hideLoading(); }
    }

    getCurrentPoints() {
        if (!this.startPointCoords || !this.endPointCoords) return { start: null, dest: null };
        return {
            start: { lat: this.startPointCoords.lat, lng: this.startPointCoords.lng },
            dest: { lat: this.endPointCoords.lat, lng: this.endPointCoords.lng }
        };
    }

displayRoute(routeGeoJSON) {
    this.lastRouteData = routeGeoJSON;

    const source = this.map.getSource('route');
    if (source) {
        source.setData(routeGeoJSON);
    } else {
        this.map.addSource('route', { type: 'geojson', data: routeGeoJSON });

        let beforeLayerId = '3d-buildings';
        if (!this.map.getLayer(beforeLayerId)) {
            const layers = this.map.getStyle().layers;
            for (let i = 0; i < layers.length; i++) {
                if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
                    beforeLayerId = layers[i].id;
                    break;
                }
            }
        }

        this.map.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': '#2563eb',
                'line-width': 5,
                'line-opacity': 0.85
            }
        }, beforeLayerId); // if beforeLayerId is undefined, it will add it last
    }

    if (routeGeoJSON.geometry.coordinates.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        routeGeoJSON.geometry.coordinates.forEach(coord => bounds.extend(coord));
        this.map.fitBounds(bounds, {
            padding: { top: 50, bottom: 150, left: 50, right: 50 },
            duration: 1000,
            maxZoom: 17
        });
    }
}


    clearRouteDisplay() {
        if (this.map.getLayer('route')) this.map.removeLayer('route');
        if (this.map.getSource('route')) this.map.removeSource('route');
        this.lastRouteData = null;
    }

    updateRouteInfo(data) {
        const distanceEl = document.getElementById('routeDistance');
        const timeEl = document.getElementById('routeTime');
        const nodesEl = document.getElementById('routeNodes');
        const sectionEl = document.getElementById('routeInfoSectionSheet');
        if (distanceEl && timeEl && nodesEl && sectionEl) {
            if (data && data.distance !== undefined) {
                const distance = Math.round(data.distance);
                const minutes = Math.round(distance / 84);
                distanceEl.textContent = `${distance}m`;
                timeEl.textContent = `~${minutes} min`;
                nodesEl.textContent = data.nodes || 'N/A';
                sectionEl.classList.remove('hidden');
            } else {
                distanceEl.textContent = '...'; timeEl.textContent = '...';
                nodesEl.textContent = '...'; sectionEl.classList.add('hidden');
            }
        }
    }

    startShadowAutoRefresh(newRate) {
    console.log("MapManager: startShadowAutoRefresh called. Current rate:", this.shadowRefreshRate, "New rate (if any):", newRate);
    if (newRate && typeof newRate === 'number' && newRate > 0) {
        this.shadowRefreshRate = newRate;
    }

    // נקה אינטרוול קודם אם קיים כדי למנוע כפילויות
    if (this.shadowRefreshInterval) {
        clearInterval(this.shadowRefreshInterval);
        console.log("MapManager: Cleared existing shadowRefreshInterval.");
    }

    this.shadowRefreshInterval = setInterval(() => {
        console.log("MapManager: Auto-refreshing shadows for current time...");
        // אין צורך לעדכן את planningStatusP או כפתורים מכאן, כי זה רענון אוטומטי "שקט"
        this.resetShadowsToCurrentTime().catch(error => {
            console.error("MapManager: Error during automatic shadow refresh:", error);
            if (document.getElementById('shadowUpdateTimeDisplay')) {
                document.getElementById('shadowUpdateTimeDisplay').textContent = 'שגיאה ברענון צללים אוטומטי';
            }
        });
    }, this.shadowRefreshRate);

    console.log(`MapManager: Shadow auto-refresh started/updated with interval: ${this.shadowRefreshRate / 60000} minutes.`);
}

stopShadowAutoRefresh() {
    if (this.shadowRefreshInterval) {
        clearInterval(this.shadowRefreshInterval);
        this.shadowRefreshInterval = null;
        console.log("MapManager: Shadow auto-refresh stopped.");
    }
}


    // פונקציה לטעינה ראשונית של צללים (צללי "עכשיו" מהשרת)
    async loadInitialShadows() {
        this.showLoading('טוען צללים...');
        try {
            const response = await fetch('/shadows'); // קורא לנקודת הקצה שמחזירה צללי ברירת מחדל (עכשיו)
            const data = await response.json();
            if (response.ok && data.shadows) {
                let geojsonData;
                if (typeof data.shadows === 'string') {
                    geojsonData = JSON.parse(data.shadows);
                } else {
                    geojsonData = data.shadows;
                }
                this.displayShadows(geojsonData);
                this.lastShadowsData = geojsonData; // שמור את הצללים הראשוניים
                console.log("Initial shadows loaded and displayed.");
            } else {
                 throw new Error(data.error || 'Failed to load initial shadows');
            }
        } catch (error) {
            console.error('Initial shadow loading error:', error);
            this.showError(error.message || 'Failed to connect for initial shadows');
            this.clearShadowDisplay();
        } finally {
            this.hideLoading();
        }
    }


// בתוך map.js

displayShadows(geojson) {
    console.log("MapManager: (displayShadows) Displaying shadows. Data:", geojson ? "Exists" : "null/undefined");
    this.lastShadowsData = geojson; // <<<< עדכון חשוב כאן
    const source = this.map.getSource('shadows');
    if (source) {
        source.setData(geojson);
        console.log("MapManager: (displayShadows) Updated existing shadows source.");
    } else {
        this.map.addSource('shadows', { type: 'geojson', data: geojson });
        const layers = this.map.getStyle().layers;
        let labelLayerId;
        // מנסה למצוא שכבת תוויות כדי לשים את שכבת הצללים לפניה
        for (let i = 0; i < layers.length; i++) {
            if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
                labelLayerId = layers[i].id;
                break;
            }
        }
        // אם קיימת שכבת מסלול, שים את הצללים לפניה, אחרת לפני שכבת התוויות (אם נמצאה)
        const beforeLayerId = this.map.getLayer('route') ? 'route' : labelLayerId;

        this.map.addLayer({
            id: 'shadows',
            type: 'fill',
            source: 'shadows',
            paint: {
                'fill-color': 'rgba(0, 0, 0, 0.3)',
                'fill-opacity': 0.7,
                'fill-outline-color': 'transparent'
            }
        }, beforeLayerId); // אם beforeLayerId הוא undefined, השכבה תתווסף בסוף
        console.log("MapManager: (displayShadows) Added new shadows source and layer. Before layer:", beforeLayerId);
    }
}

clearShadowDisplay() {
    console.log("MapManager: (clearShadowDisplay) Clearing shadow display.");
    this.lastShadowsData = null; // <<<< עדכון חשוב כאן
    if (this.map.getLayer('shadows')) {
        this.map.removeLayer('shadows');
        console.log("MapManager: (clearShadowDisplay) Removed shadows layer.");
    }
    if (this.map.getSource('shadows')) {
        this.map.removeSource('shadows');
        console.log("MapManager: (clearShadowDisplay) Removed shadows source.");
    }
}

    // In map.js, inside MapManager class
updateLastShadowTimeDisplay(timestamp) {
    const displayElement = document.getElementById('shadowUpdateTimeDisplay');
    console.log("MapManager: updateLastShadowTimeDisplay called with:", timestamp); // הדפסת בדיקה
    if (displayElement) {
        if (timestamp) {
            try {
                const dateObj = new Date(timestamp);
                const timeString = dateObj.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
                displayElement.textContent = `צללים עודכנו לאחרונה: ${timeString}`;
            } catch (e) {
                displayElement.textContent = 'שגיאה בעדכון זמן הצללים';
                console.error("MapManager: Error formatting shadow update time:", e);
            }
        } else {
            displayElement.textContent = 'טוען מידע על צללים...';
        }
    } else {
        console.warn("MapManager: Element with ID 'shadowUpdateTimeDisplay' not found.");
    }
}



    async resetShadowsToCurrentTime() {
    // ... (קוד ליצירת nowDateTimeString) ...
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const nowDateTimeString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;

    return this.loadShadowsForFutureTime(nowDateTimeString, 'טוען צללים נוכחיים...'); // <<-- הנקודה החשובה
}

    // --- סוף פונקציות תכנון עתידי ---


    setShadeWeight(weight) {
        this.shadeWeight = parseFloat(weight);
        const displayElement = document.getElementById('shadeValueDisplaySheet');
        if (displayElement) displayElement.textContent = this.shadeWeight.toFixed(1);
        if (this.routeCalculationTimeout) clearTimeout(this.routeCalculationTimeout);
        if (this.startMarker && this.endMarker) {
            this.routeCalculationTimeout = setTimeout(() => { this.calculateRoute(); }, 500);
        }
    }

    togglePointSetting() {
        this.isSettingPoints = !this.isSettingPoints;
        this.currentPoint = 'start';
        if (this.isSettingPoints) {
            this.updateSetPointsButtonState(true, 'Tap map to set Start');
        } else {
            this.updateSetPointsButtonState(false);
            if (this.startMarker) { this.startMarker.remove(); this.startMarker = null; }
            if (this.endMarker) { this.endMarker.remove(); this.endMarker = null; }
            this.startPointCoords = null; this.endPointCoords = null;
            this.clearRouteDisplay(); this.updateRouteInfo(null);
            this.clearComparisonDisplay();
        }
        console.log('Toggled point setting mode:', this.isSettingPoints);
    }

    showLoading(message = 'Loading...') {
        const spinnerContainer = document.querySelector('.loading-spinner');
        if (spinnerContainer) {
            const messageElement = spinnerContainer.querySelector('.message');
            if(messageElement) messageElement.textContent = message;
            spinnerContainer.classList.add('active');
        } else { console.warn('.loading-spinner element not found'); }
    }

    hideLoading() {
        const spinnerContainer = document.querySelector('.loading-spinner');
        if (spinnerContainer) spinnerContainer.classList.remove('active');
    }

    showError(message = 'An error occurred.') {
        const errorElement = document.querySelector('.error-message');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('active');
            setTimeout(() => { errorElement.classList.remove('active'); }, 5000);
        } else {
            console.error('Error message element not found. Error:', message);
            alert(`Error: ${message}`);
        }
    }

    async startRouteComparison() {
        if (!this.startMarker || !this.endMarker) {
            this.showError('Please set start and end points first'); return;
        }
        this.comparisonRoutes = [];
        const shadeWeights = [1, 3, 6, 9];
        this.showLoading('Calculating comparison routes...');
        try {
            const start = this.startMarker.getLngLat();
            const end = this.endMarker.getLngLat();
            for (const weight of shadeWeights) {
                const response = await fetch('/route', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        start: [start.lat, start.lng], dest: [end.lat, end.lng],
                        shade_weight: weight
                    })
                });
                const data = await response.json();
                // console.log(`Data from backend for shade_weight ${weight}:`, JSON.parse(JSON.stringify(data))); // להסיר אחרי בדיקה
                if (response.ok && data.route && data.route.length > 0) {
                    const routeGeoJSON = {
                        type: 'Feature', properties: { shadeWeight: weight },
                        geometry: { type: 'LineString', coordinates: data.route.map(coord => [coord[1], coord[0]]) }
                    };
                    this.comparisonRoutes.push({
                        route: routeGeoJSON, distance: data.distance,
                        nodes: data.nodes, shadeWeight: weight
                    });
                } else {
                    console.warn(`Failed to calculate route for shade weight ${weight}: ${data.error || 'Unknown error'}`);
                }
            }
            // console.log('All comparison routes data stored:', JSON.parse(JSON.stringify(this.comparisonRoutes))); // להסיר אחרי בדיקה

            if (this.comparisonRoutes.length > 0) {
                this.currentComparisonIndex = 0;
                this.displayComparisonRoute(this.currentComparisonIndex);
                if(this.comparisonStatsElement) this.comparisonStatsElement.classList.remove('hidden');
            } else {
                this.showError('Failed to calculate any comparison routes');
                this.clearComparisonDisplay();
            }
        } catch (error) {
            console.error('Route comparison error:', error);
            this.showError(error.message || 'Failed to connect to the server for comparison');
            this.clearComparisonDisplay();
        } finally { this.hideLoading(); }
    }

    displayComparisonRoute(index) {
        if (index < 0 || index >= this.comparisonRoutes.length) return;
        const routeData = this.comparisonRoutes[index];
        this.displayRoute(routeData.route);
        this.updateComparisonStats();
    }

    updateComparisonStats() {
        if (!this.comparisonStatsElement) { console.warn('#comparisonStatsDisplay element not found'); return; }
        if (this.comparisonRoutes.length === 0) { this.clearComparisonDisplay(); return; }
        const currentRoute = this.comparisonRoutes[this.currentComparisonIndex];
        if (!currentRoute) { this.clearComparisonDisplay(); return; }

        // הסרנו הדפסות מיותרות מכאן
        const distanceForDisplay = Math.round(currentRoute.distance);
        const minutesForDisplay = Math.round(currentRoute.distance / 84);

        this.comparisonStatsElement.innerHTML = `
            <h4>Route Comparison (${this.currentComparisonIndex + 1}/${this.comparisonRoutes.length})</h4>
            <div class="route-details">
                <div class="route-stat"><span>Shade Preference:</span><span>${currentRoute.shadeWeight.toFixed(1)}</span></div>
                <div class="route-stat"><span>Distance:</span><span>${distanceForDisplay}m</span></div>
                <div class="route-stat"><span>Estimated Time:</span><span>~${minutesForDisplay} min</span></div>
                <div class="route-stat"><span>Nodes:</span><span>${currentRoute.nodes || 'N/A'}</span></div>
            </div>
            <div class="route-navigation">
                 <button id="prevCompRouteBtn" class="sheet-button" ${this.currentComparisonIndex === 0 ? 'disabled' : ''}>&lt; Prev</button>
                <button id="nextCompRouteBtn" class="sheet-button" ${this.currentComparisonIndex >= this.comparisonRoutes.length - 1 ? 'disabled' : ''}>Next &gt;</button>
            </div>
        `;
        this.comparisonStatsElement.classList.remove('hidden');
        const parentSection = document.getElementById('comparisonSectionSheet');
        if (parentSection) parentSection.classList.remove('hidden');
    }

    clearComparisonDisplay() {
        this.comparisonRoutes = []; this.currentComparisonIndex = 0;
        if (this.comparisonStatsElement) {
            this.comparisonStatsElement.innerHTML = '';
            this.comparisonStatsElement.classList.add('hidden');
        }
    }

    showPreviousComparisonRoute() {
        if (this.currentComparisonIndex > 0) {
            this.currentComparisonIndex--; this.displayComparisonRoute(this.currentComparisonIndex);
        }
    }

    showNextComparisonRoute() {
        if (this.currentComparisonIndex < this.comparisonRoutes.length - 1) {
            this.currentComparisonIndex++; this.displayComparisonRoute(this.currentComparisonIndex);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.mapManager = new MapManager();
});