class MapManager {
    constructor() {
        this.map = null;
        this.routeLayer = null;
        this.shadowLayer = null;
        this.startMarker = null;
        this.endMarker = null;
        this.isSettingPoints = false;
        this.currentPoint = 'start';
        this.shadeWeight = 1.0;
        this.lastShadowsData = null;
        this.lastRouteData = null;
        this.routeCalculationTimeout = null;
        this.comparisonRoutes = []; // Store multiple routes for comparison
        this.currentComparisonIndex = 0;
        this.mapStyles = {
            streets: 'https://api.maptiler.com/maps/streets/style.json?key=9nCgTFPJn6Zp08161WIx',
            satellite: 'https://api.maptiler.com/maps/hybrid/style.json?key=9nCgTFPJn6Zp08161WIx',
            hybrid: 'https://api.maptiler.com/maps/streets-dark/style.json?key=9nCgTFPJn6Zp08161WIx',
            terrain: 'https://api.maptiler.com/maps/terrain/style.json?key=9nCgTFPJn6Zp08161WIx',
            basic: 'https://api.maptiler.com/maps/basic-v2/style.json?key=9nCgTFPJn6Zp08161WIx'
        };
        this.initializeMap();
        this.initializeComparisonUI();
    }

    initializeMap() {
        this.map = new maplibregl.Map({
            container: 'map',
            style: this.mapStyles.streets,
            center: [34.8035, 31.2639],  // Ben Gurion University coordinates
            zoom: 16,
            pitch: 45,
            bearing: -17.6
        });

        // Add navigation controls
        this.map.addControl(new maplibregl.NavigationControl(), 'top-right');

        // Add 3D buildings when the map loads
        this.map.on('load', () => {
            this.add3DBuildings();
            this.map.on('click', (e) => this.handleMapClick(e));
        });
    }

    add3DBuildings() {
        // Insert the layer beneath any symbol layer
        const layers = this.map.getStyle().layers;
        let labelLayerId;
        for (let i = 0; i < layers.length; i++) {
            if (layers[i].type === 'symbol' && layers[i].layout['text-field']) {
                labelLayerId = layers[i].id;
                break;
            }
        }

        // Add 3D buildings layer
        this.map.addLayer({
            'id': '3d-buildings',
            'source': 'composite',
            'source-layer': 'building',
            'type': 'fill-extrusion',
            'minzoom': 15,
            'paint': {
                'fill-extrusion-color': '#aaa',
                'fill-extrusion-height': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15,
                    0,
                    15.05,
                    ['get', 'height']
                ],
                'fill-extrusion-base': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15,
                    0,
                    15.05,
                    ['get', 'min_height']
                ],
                'fill-extrusion-opacity': 0.6
            }
        }, labelLayerId);
    }

    handleMapClick(e) {
        if (!this.isSettingPoints) return;

        const lngLat = e.lngLat;
        if (this.currentPoint === 'start') {
            this.setStartPoint(lngLat);
            this.currentPoint = 'end';
        } else {
            this.setEndPoint(lngLat);
            this.isSettingPoints = false;
            this.currentPoint = 'start';
            this.calculateRoute();
        }
    }

    setStartPoint(lngLat) {
        if (this.startMarker) {
            this.startMarker.remove();
        }

        const el = document.createElement('div');
        el.className = 'custom-div-icon';
        el.style.backgroundColor = '#2563eb';
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';

        this.startMarker = new maplibregl.Marker(el)
            .setLngLat(lngLat)
            .addTo(this.map);
    }

    setEndPoint(lngLat) {
        if (this.endMarker) {
            this.endMarker.remove();
        }

        const el = document.createElement('div');
        el.className = 'custom-div-icon';
        el.style.backgroundColor = '#ef4444';
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';

        this.endMarker = new maplibregl.Marker(el)
            .setLngLat(lngLat)
            .addTo(this.map);
    }

    async calculateRoute() {
        if (!this.startMarker || !this.endMarker) return;

        const start = this.startMarker.getLngLat();
        const end = this.endMarker.getLngLat();

        try {
            this.showLoading('Calculating route...');
            const response = await fetch('http://localhost:8001/route', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    start: [start.lat, start.lng],
                    dest: [end.lat, end.lng],
                    shade_weight: this.shadeWeight
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                this.displayRoute(data.route);
                this.updateRouteInfo(data);
            } else {
                this.showError(data.error || 'Failed to calculate route');
            }
        } catch (error) {
            this.showError('Failed to connect to the server');
            console.error('Error:', error);
        } finally {
            this.hideLoading();
        }
    }

    displayRoute(route) {
        this.lastRouteData = route; // Store for style changes
        
        // Remove existing route layers and sources
        if (this.map.getLayer('route')) {
            this.map.removeLayer('route');
        }
        if (this.map.getSource('route')) {
            this.map.removeSource('route');
        }

        // Convert route coordinates to GeoJSON format
        const routeGeoJSON = {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: route.map(coord => [coord[1], coord[0]]) // Swap lat/lng to lng/lat
            }
        };

        // Add the new route source and layer
        this.map.addSource('route', {
            type: 'geojson',
            data: routeGeoJSON
        });

        this.map.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#2563eb',
                'line-width': 4,
                'line-opacity': 0.8
            }
        });

        // Fit bounds to the route
        const bounds = new maplibregl.LngLatBounds();
        route.forEach(coord => {
            bounds.extend([coord[1], coord[0]]); // Swap lat/lng to lng/lat
        });

        this.map.fitBounds(bounds, {
            padding: 50,
            duration: 1000 // Add animation duration for smoother transition
        });
    }

    updateRouteInfo(data) {
        const distance = Math.round(data.distance);
        const duration = Math.round(distance / 1.4); // Assuming average walking speed of 1.4 m/s
        
        const routeInfo = document.getElementById('routeInfo');
        if (routeInfo) {
            routeInfo.innerHTML = `
                <div class="route-stats">
                    <div>Distance: ${distance}m</div>
                    <div>Estimated time: ${duration}s</div>
                    <div>Nodes: ${data.nodes}</div>
                </div>
            `;
        }
    }

    async loadShadows() {
        try {
            this.showLoading('Loading shadows...');
            const response = await fetch('http://localhost:8001/shadows');
            const data = await response.json();
            
            if (response.ok) {
                this.displayShadows(data.shadows);
            } else {
                this.showError(data.error || 'Failed to load shadows');
            }
        } catch (error) {
            this.showError('Failed to connect to the server');
            console.error('Error:', error);
        } finally {
            this.hideLoading();
        }
    }

    displayShadows(geojson) {
        this.lastShadowsData = geojson; // Store for style changes
        if (this.shadowLayer) {
            this.map.removeLayer('shadows');
            this.map.removeSource('shadows');
        }

        try {
            const parsedData = JSON.parse(geojson);
            this.map.addSource('shadows', {
                type: 'geojson',
                data: parsedData
            });

            // Find the first symbol layer to insert shadows before it
            const layers = this.map.getStyle().layers;
            let labelLayerId;
            for (let i = 0; i < layers.length; i++) {
                if (layers[i].type === 'symbol' && layers[i].layout['text-field']) {
                    labelLayerId = layers[i].id;
                    break;
                }
            }

            this.map.addLayer({
                id: 'shadows',
                type: 'fill',
                source: 'shadows',
                paint: {
                    'fill-color': '#1e293b',
                    'fill-opacity': 0.2,
                    'fill-outline-color': 'transparent'
                }
            }, labelLayerId);
            this.shadowLayer = true;
        } catch (error) {
            console.error('Error displaying shadows:', error);
            this.shadowLayer = false;
        }
    }

    setShadeWeight(weight) {
        this.shadeWeight = parseFloat(weight);
        // Update the display value with one decimal place
        document.getElementById('shadeValue').textContent = this.shadeWeight.toFixed(1);
        
        // Clear any existing timeout
        if (this.routeCalculationTimeout) {
            clearTimeout(this.routeCalculationTimeout);
        }
        
        // Set a new timeout to calculate the route after 500ms of no changes
        this.routeCalculationTimeout = setTimeout(() => {
            if (this.startMarker && this.endMarker) {
                this.calculateRoute();
            }
        }, 500);
    }

    togglePointSetting() {
        this.isSettingPoints = !this.isSettingPoints;
        const button = document.querySelector('.set-points-button');
        if (button) {
            button.classList.toggle('active');
            button.textContent = this.isSettingPoints ? 'Cancel' : 'Set Points';
        }
    }

    showLoading(message) {
        const spinner = document.querySelector('.loading-spinner');
        if (spinner) {
            spinner.querySelector('.message').textContent = message;
            spinner.classList.add('active');
        }
    }

    hideLoading() {
        const spinner = document.querySelector('.loading-spinner');
        if (spinner) {
            spinner.classList.remove('active');
        }
    }

    showError(message) {
        const errorElement = document.querySelector('.error-message');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('active');
            setTimeout(() => {
                errorElement.classList.remove('active');
            }, 5000);
        }
    }

    async changeMapStyle(styleName) {
        const currentStyle = this.map.getStyle().name;
        if (currentStyle === styleName) return;

        // Store current view state
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();
        const pitch = this.map.getPitch();
        const bearing = this.map.getBearing();

        // Change the map style
        await this.map.setStyle(this.mapStyles[styleName]);

        // Restore the view state
        this.map.setCenter(center);
        this.map.setZoom(zoom);
        this.map.setPitch(pitch);
        this.map.setBearing(bearing);

        // Wait for the style to load completely
        this.map.once('style.load', () => {
            // Add 3D buildings first
            this.add3DBuildings();
            
            // Re-add click handler
            this.map.on('click', (e) => this.handleMapClick(e));
            
            // Re-add shadows after a short delay to ensure proper layer ordering
            setTimeout(() => {
                if (this.lastShadowsData) {
                    this.displayShadows(this.lastShadowsData);
                }
                
                // Re-add route if it exists
                if (this.lastRouteData) {
                    this.displayRoute(this.lastRouteData);
                }
            }, 100);
        });
    }

    initializeComparisonUI() {
        // Remove any existing comparison container
        const existingContainer = document.querySelector('.comparison-container');
        if (existingContainer) {
            existingContainer.remove();
        }

        const comparisonContainer = document.createElement('div');
        comparisonContainer.className = 'comparison-container';
        comparisonContainer.innerHTML = `
            <div class="comparison-controls">
                <button class="compare-routes-button">Compare Routes</button>
                <div class="comparison-stats" style="display: none;">
                    <div class="route-comparison">
                        <div class="route-info">
                            <h3>Route Comparison</h3>
                            <div class="route-details"></div>
                        </div>
                        <div class="route-navigation">
                            <button class="prev-route">Previous</button>
                            <span class="route-counter">1/1</span>
                            <button class="next-route">Next</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(comparisonContainer);

        // Add event listeners
        const compareButton = comparisonContainer.querySelector('.compare-routes-button');
        const prevButton = comparisonContainer.querySelector('.prev-route');
        const nextButton = comparisonContainer.querySelector('.next-route');

        compareButton.addEventListener('click', () => this.startRouteComparison());
        prevButton.addEventListener('click', () => this.showPreviousRoute());
        nextButton.addEventListener('click', () => this.showNextRoute());

        // Make sure the container is visible
        comparisonContainer.style.display = 'block';
    }

    async startRouteComparison() {
        if (!this.startMarker || !this.endMarker) {
            this.showError('Please set start and end points first');
            return;
        }

        this.comparisonRoutes = [];
        const shadeWeights = [0.2, 0.5, 0.8, 1.0]; // Different shadow preferences to compare

        try {
            this.showLoading('Calculating route comparisons...');
            const start = this.startMarker.getLngLat();
            const end = this.endMarker.getLngLat();

            // Calculate routes with different shadow preferences
            for (const weight of shadeWeights) {
                const response = await fetch('http://localhost:8001/route', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        start: [start.lat, start.lng],
                        dest: [end.lat, end.lng],
                        shade_weight: weight
                    })
                });

                const data = await response.json();
                if (response.ok) {
                    this.comparisonRoutes.push({
                        route: data.route,
                        distance: data.distance,
                        nodes: data.nodes,
                        shadeWeight: weight
                    });
                }
            }

            if (this.comparisonRoutes.length > 0) {
                this.showComparisonUI();
                this.currentComparisonIndex = 0;
                this.displayComparisonRoute(0);
            } else {
                this.showError('Failed to calculate comparison routes');
            }
        } catch (error) {
            this.showError('Failed to connect to the server');
            console.error('Error:', error);
        } finally {
            this.hideLoading();
        }
    }

    showComparisonUI() {
        const compareButton = document.querySelector('.compare-routes-button');
        
        if (compareButton) {
            // Remove any existing comparison stats
            const existingStats = document.querySelector('.comparison-stats');
            if (existingStats) {
                existingStats.remove();
            }

            // Create new comparison stats container
            const statsContainer = document.createElement('div');
            statsContainer.className = 'comparison-stats';
            document.body.appendChild(statsContainer);

            // Add the comparison content
            statsContainer.innerHTML = `
                <div class="route-comparison">
                    <div class="route-info">
                        <h3>Route Comparison</h3>
                        <div class="route-details"></div>
                    </div>
                    <div class="route-navigation">
                        <button class="prev-route">Previous</button>
                        <span class="route-counter">1/1</span>
                        <button class="next-route">Next</button>
                    </div>
                </div>
            `;

            // Re-attach event listeners
            const prevButton = statsContainer.querySelector('.prev-route');
            const nextButton = statsContainer.querySelector('.next-route');
            prevButton.addEventListener('click', () => this.showPreviousRoute());
            nextButton.addEventListener('click', () => this.showNextRoute());
            
            this.updateComparisonStats();
        }
    }

    displayComparisonRoute(index) {
        if (index < 0 || index >= this.comparisonRoutes.length) return;
        
        const route = this.comparisonRoutes[index];
        this.displayRoute(route.route);
        this.updateComparisonStats();
    }

    updateComparisonStats() {
        const routeDetails = document.querySelector('.route-details');
        const routeCounter = document.querySelector('.route-counter');
        const currentRoute = this.comparisonRoutes[this.currentComparisonIndex];

        if (currentRoute) {
            const duration = Math.round(currentRoute.distance / 1.4);
            routeDetails.innerHTML = `
                <div class="route-stat">
                    <span>Shadow Preference:</span>
                    <span>${(currentRoute.shadeWeight * 100).toFixed(0)}%</span>
                </div>
                <div class="route-stat">
                    <span>Distance:</span>
                    <span>${Math.round(currentRoute.distance)}m</span>
                </div>
                <div class="route-stat">
                    <span>Estimated Time:</span>
                    <span>${duration}s</span>
                </div>
                <div class="route-stat">
                    <span>Nodes:</span>
                    <span>${currentRoute.nodes}</span>
                </div>
            `;

            routeCounter.textContent = `${this.currentComparisonIndex + 1}/${this.comparisonRoutes.length}`;
        }
    }

    showPreviousRoute() {
        if (this.currentComparisonIndex > 0) {
            this.currentComparisonIndex--;
            this.displayComparisonRoute(this.currentComparisonIndex);
        }
    }

    showNextRoute() {
        if (this.currentComparisonIndex < this.comparisonRoutes.length - 1) {
            this.currentComparisonIndex++;
            this.displayComparisonRoute(this.currentComparisonIndex);
        }
    }
}

// Initialize map when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.mapManager = new MapManager();
    window.mapManager.loadShadows();
}); 