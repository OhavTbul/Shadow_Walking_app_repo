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
        this.currentPoint = null; // שינוי מ-'start' ל-null
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
        this.initializeRouteControls();
    }

    initializeMap() {
        this.map = new maplibregl.Map({
            container: 'map',
            style: this.mapStyles.streets,
            center: [34.8035, 31.2639],
            zoom: 16,
            pitch: 45,
            bearing: -17.6,
            antialias: true
        });

        // עדכון הטיפול באייקונים חסרים
        this.map.on('styleimagemissing', (e) => {
            const width = 1;
            const height = 1;
            const emptyData = new Uint8Array(width * height * 4); // RGBA format
            
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            this.map.addImage(e.id, { width, height, data: emptyData });
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
        console.log("add3DBuildings called - Current map style:", this.currentMapStyleKey);

        // Remove existing layers if present
        ['3d-buildings', '3d-buildings-base'].forEach(layerId => {
            if (this.map.getLayer(layerId)) {
                this.map.removeLayer(layerId);
                console.log(`Removed existing ${layerId} layer`);
            }
        });

        // Try different possible source names
        const possibleSources = ['composite', 'openmaptiles', 'maptiler_planet'];
        let sourceName = null;
        let sourceLayerName = 'building';

        for (const source of possibleSources) {
            if (this.map.getSource(source)) {
                sourceName = source;
                break;
            }
        }

        if (!sourceName) {
            console.error("MapManager: No valid building source found. Cannot add 3D buildings.");
            return;
        }

        console.log(`MapManager: Using building source "${sourceName}"`);

        // Find a label layer to insert buildings before
        const layers = this.map.getStyle().layers;
        let labelLayerId;
        for (let i = 0; i < layers.length; i++) {
            if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
                labelLayerId = layers[i].id;
                break;
            }
        }

        try {
            // Add a single solid building layer
            this.map.addLayer(
                {
                    'id': '3d-buildings',
                    'source': sourceName,
                    'source-layer': sourceLayerName,
                    'type': 'fill-extrusion',
                    'minzoom': 15,
                    'paint': {
                        'fill-extrusion-color': this.currentMapStyleKey === 'night' ? '#242424' : '#d9d3cc',
                        'fill-extrusion-height': [
                            'case',
                            ['has', 'height'], ['get', 'height'],
                            ['has', 'levels'], ['*', ['get', 'levels'], 3],
                            15 // default height in meters if no height data
                        ],
                        'fill-extrusion-base': [
                            'case',
                            ['has', 'min_height'], ['get', 'min_height'],
                            0 // default base height
                        ],
                        'fill-extrusion-opacity': this.currentMapStyleKey === 'night' ? 0.25 : 0.9,
                        'fill-extrusion-vertical-gradient': true
                    }
                },
                labelLayerId
            );

            console.log("3D buildings layer added successfully with refined appearance");
        } catch (error) {
            console.error("MapManager: Error adding 3D buildings layer:", error);
        }
    }

    handleMapClick(e) {
        if (!this.isSettingPoints) {
            // אם המשתמש לוחץ על המפה לפני הפעלת מצב הגדרת נקודות
            this.showError("Please click 'Start' to begin setting route points");
            return;
        }
        
        const lngLat = e.lngLat;
        
        if (this.currentPoint === 'start') {
            this.setStartPoint(lngLat);
            this.currentPoint = 'end';
            this.updateRouteButtonsState('dest');
            document.querySelector('.route-instruction').textContent = 'Touch the map to set destination point';
        } else if (this.currentPoint === 'end') {
            this.setEndPoint(lngLat);
            this.currentPoint = 'complete';
            this.updateRouteButtonsState('complete');
            document.querySelector('.route-instruction').textContent = 'Press "Set Route" to calculate the route';
        }
    }

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

    setStartPoint(lngLat) {
        if (this.startMarker) this.startMarker.remove();
        this.startPointCoords = lngLat;
        const el = this.createCustomMarker('var(--primary-color)', null);
        this.startMarker = new maplibregl.Marker({ element: el }).setLngLat([lngLat.lng, lngLat.lat]).addTo(this.map);
    }

    setEndPoint(lngLat) {
        if (this.endMarker) this.endMarker.remove();
        this.endPointCoords = lngLat;
        const el = this.createCustomMarker('var(--danger-color)', null);
        this.endMarker = new maplibregl.Marker({ element: el }).setLngLat([lngLat.lng, lngLat.lat]).addTo(this.map);
    }

    createCustomMarker(color, label) {
        const container = document.createElement('div');
        container.className = 'custom-marker-container';
        const inner = document.createElement('div');
        inner.className = 'custom-marker';
        inner.style.color = color;
        inner.style.fontSize = '32px'; // גודל האייקון
        inner.style.filter = 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))'; // צל עדין
        inner.innerHTML = '<i class="fas fa-location-dot"></i>';
        container.appendChild(inner);
        return container;
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
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start: [start.lat, start.lng], 
                    dest: [end.lat, end.lng],
                    shade_weight: this.shadeWeight
                })
            });
            const data = await response.json();
            if (response.ok && data.route && data.route.length > 0) {
                const routeGeoJSON = {
                    type: 'Feature', 
                    properties: {},
                    geometry: { 
                        type: 'LineString', 
                        coordinates: data.route.map(coord => [coord[1], coord[0]]) 
                    }
                };
                
                // עדכון מיקומי הסמנים לצמתים הראשון והאחרון במסלול
                const startNode = [data.route[0][1], data.route[0][0]];  // [lng, lat]
                const endNode = [data.route[data.route.length - 1][1], data.route[data.route.length - 1][0]];
                
                // עדכון הסמנים למיקומים החדשים
                if (this.startMarker) {
                    this.startMarker.setLngLat(startNode);
                    this.startPointCoords = { lng: startNode[0], lat: startNode[1] };
                }
                if (this.endMarker) {
                    this.endMarker.setLngLat(endNode);
                    this.endPointCoords = { lng: endNode[0], lat: endNode[1] };
                }

                this.displayRoute(routeGeoJSON);
                this.updateRouteInfo(data);  // וודא שזה נקרא
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

            // קבע את צבע המסלול בהתאם למצב המפה
            const routeColor = this.currentMapStyleKey === 'night' ? '#ffeb3b' : '#2563eb';
            const routeOpacity = this.currentMapStyleKey === 'night' ? 1 : 0.85;

            this.map.addLayer({
                id: 'route',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': routeColor,
                    'line-width': 5,
                    'line-opacity': routeOpacity
                }
            }, beforeLayerId);
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
        const routeInfoSection = document.getElementById('routeInfoSectionSheet');
        const distanceEl = document.getElementById('routeDistance');
        const timeEl = document.getElementById('routeTime');

        if (distanceEl && timeEl && routeInfoSection) {
            if (data && data.distance !== undefined) {
                const distance = Math.round(data.distance);
                const minutes = Math.round(distance / 84);
                distanceEl.textContent = `${distance}m`;
                timeEl.textContent = `~${minutes} min`;
                routeInfoSection.classList.remove('hidden');  // וודא שה-hidden מוסר
            } else {
                distanceEl.textContent = '...';
                timeEl.textContent = '...';
                routeInfoSection.classList.add('hidden');
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

    displayShadows(geojson) {
        console.log("MapManager: (displayShadows) Displaying shadows. Data:", geojson ? "Exists" : "null/undefined");
        
        // Clean up existing layers and sources
        this.clearShadowDisplay();
        if (this.map.getLayer('3d-buildings')) {
            this.map.removeLayer('3d-buildings');
        }

        // Add shadows source
        this.map.addSource('shadows', { type: 'geojson', data: geojson });
        this.lastShadowsData = geojson;

        // Get all current layers
        const style = this.map.getStyle();
        const layers = style.layers;
        
        // Find the first symbol or fill-extrusion layer to add shadows before it
        const targetLayerId = layers.find(layer => 
            layer.type === 'symbol' || 
            layer.type === 'fill-extrusion' ||
            (layer.type === 'fill' && layer.id !== 'background')
        )?.id;

        // Add shadows just above the background but below other layers
        this.map.addLayer({
            id: 'shadows',
            type: 'fill',
            source: 'shadows',
            paint: {
                'fill-color': 'rgba(0, 0, 0, 0.25)', // צל יותר עדין
                'fill-opacity': 0.7, // שקיפות מוגברת
                'fill-outline-color': 'transparent'
            }
        }, targetLayerId);

        // Add buildings on top of everything
        this.add3DBuildings();

        console.log("MapManager: (displayShadows) Added shadows below buildings");
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

    updateLastShadowTimeDisplay(timestamp) {
        const displayElement = document.getElementById('shadowUpdateTimeDisplay');
        console.log("MapManager: updateLastShadowTimeDisplay called with:", timestamp);
        if (displayElement) {
            if (timestamp) {
                try {
                    const dateObj = new Date(timestamp);
                    const timeString = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    displayElement.textContent = `Shadows last updated: ${timeString}`;
                } catch (e) {
                    displayElement.textContent = 'Error updating shadow time';
                    console.error("MapManager: Error formatting shadow update time:", e);
                }
            } else {
                displayElement.textContent = 'Loading shadow data...';
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
            this.showError('Please set start and end points first');
            return;
        }

        const compareInitialView = document.getElementById('compareInitialView');
        const compareResultsView = document.getElementById('compareResultsView');
        
        if (compareInitialView && compareResultsView) {
            compareInitialView.classList.remove('active');
            compareResultsView.classList.add('active');
        }

        // מחיקת נתוני השוואה קודמים
        this.comparisonRoutes = [];
        this.currentComparisonIndex = 0;

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
        if (!this.comparisonStatsElement) return;
        
        if (this.comparisonRoutes.length === 0) {
            this.clearComparisonDisplay();
            return;
        }

        const currentRoute = this.comparisonRoutes[this.currentComparisonIndex];
        if (!currentRoute) {
            this.clearComparisonDisplay();
            return;
        }

        const distanceForDisplay = Math.round(currentRoute.distance);
        const minutesForDisplay = Math.round(currentRoute.distance / 84);

        this.comparisonStatsElement.innerHTML = `
        <div class="control-section">
            <h3>Route Details</h3>
            <p style="color: var(--orange-main-color)">Shade Preference: <span>${currentRoute.shadeWeight.toFixed(1)}</span></p>
            <p>Distance: <span>${distanceForDisplay}m</span></p>
            <p>Est. Time: <span>~${minutesForDisplay} min</span></p>
        </div>
        <div class="route-navigation">
            <button class="nav-button" id="prevCompRouteBtn" ${this.currentComparisonIndex === 0 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i> Previous
            </button>
            <button class="nav-button" id="nextCompRouteBtn" ${this.currentComparisonIndex >= this.comparisonRoutes.length - 1 ? 'disabled' : ''}>
                Next <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;

        // הוספת מאזינים לכפתור החדש
        const newComparisonBtn = document.getElementById('newComparisonBtn');
        if (newComparisonBtn) {
            newComparisonBtn.onclick = () => {
                document.getElementById('compareInitialView').classList.add('active');
                document.getElementById('compareResultsView').classList.remove('active');
                this.clearComparisonDisplay();
            };
        }
    }

    clearComparisonDisplay() {
        this.comparisonRoutes = [];
        this.currentComparisonIndex = 0;
        
        const compareInitialView = document.getElementById('compareInitialView');
        const compareResultsView = document.getElementById('compareResultsView');
        
        if (compareInitialView && compareResultsView) {
            compareInitialView.classList.add('active');
            compareResultsView.classList.remove('active');
        }
        
        if (this.comparisonStatsElement) {
            this.comparisonStatsElement.innerHTML = '';
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

    initializeRouteControls() {
        const startBtn = document.getElementById('startPointBtn');
        const destBtn = document.getElementById('destPointBtn');
        const setRouteBtn = document.getElementById('setRouteBtn');
        const instruction = document.querySelector('.route-instruction');

        if (instruction) {
            instruction.textContent = 'Click "Start" to begin setting route points';
        }

        startBtn.addEventListener('click', () => {
            this.clearRoute();
            this.currentPoint = 'start';
            this.isSettingPoints = true;
            this.updateRouteButtonsState('start');
            instruction.textContent = 'Touch the map to create a starting point';
        });

        destBtn.addEventListener('click', () => {
            if (this.startPointCoords) {
                // רק מחיקת נקודת היעד אם קיימת
                if (this.endMarker) {
                    this.endMarker.remove();
                    this.endMarker = null;
                    this.endPointCoords = null;
                }
                this.currentPoint = 'end';
                this.isSettingPoints = true;
                this.updateRouteButtonsState('dest');
                instruction.textContent = 'Touch the map to set destination point';
            }
        });

        setRouteBtn.addEventListener('click', () => {
            if (this.startPointCoords && this.endPointCoords) {
                this.calculateRoute();
                this.isSettingPoints = false;
                // אחרי חישוב המסלול, נסמן את כפתור ההתחלה ככתום
                this.updateRouteButtonsState('ready_for_new');
                instruction.textContent = 'Route calculated. Click Start to plan a new route';
            }
        });
    }

    updateRouteButtonsState(state) {
        const startBtn = document.getElementById('startPointBtn');
        const destBtn = document.getElementById('destPointBtn');
        const setRouteBtn = document.getElementById('setRouteBtn');

        // קודם מנקים את כל המצבים הפעילים
        startBtn.classList.remove('active');
        destBtn.classList.remove('active');
        setRouteBtn.classList.remove('active');

        switch(state) {
            case 'start':
                startBtn.classList.add('active');
                break;
            case 'dest':
                destBtn.classList.add('active');
                break;
            case 'complete':
                setRouteBtn.classList.add('active');
                break;
            case 'ready_for_new':
                startBtn.classList.add('active'); // מדגיש את כפתור ההתחלה
                break;
        }
    }

    clearRoute() {
        if (this.startMarker) {
            this.startMarker.remove();
            this.startMarker = null;
            this.startPointCoords = null;
        }
        if (this.endMarker) {
            this.endMarker.remove();
            this.endMarker = null;
            this.endPointCoords = null;
        }
        this.clearRouteDisplay();
        this.updateRouteInfo(null);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.mapManager = new MapManager();
});