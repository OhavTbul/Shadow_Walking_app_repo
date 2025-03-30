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
        this.initializeMap();
    }

    initializeMap() {
        this.map = L.map('map').setView([31.2639, 34.8035], 16);  // Ben Gurion University coordinates
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        // Add click handler to map
        this.map.on('click', (e) => this.handleMapClick(e));
    }

    handleMapClick(e) {
        if (!this.isSettingPoints) return;

        const latlng = e.latlng;
        if (this.currentPoint === 'start') {
            this.setStartPoint(latlng);
            this.currentPoint = 'end';
        } else {
            this.setEndPoint(latlng);
            this.isSettingPoints = false;
            this.currentPoint = 'start';
            this.calculateRoute();
        }
    }

    setStartPoint(latlng) {
        if (this.startMarker) {
            this.map.removeLayer(this.startMarker);
        }
        this.startMarker = L.marker(latlng, {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: '<div style="background-color: #2563eb; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(this.map);
    }

    setEndPoint(latlng) {
        if (this.endMarker) {
            this.map.removeLayer(this.endMarker);
        }
        this.endMarker = L.marker(latlng, {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: '<div style="background-color: #ef4444; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(this.map);
    }

    async calculateRoute() {
        if (!this.startMarker || !this.endMarker) return;

        const start = this.startMarker.getLatLng();
        const end = this.endMarker.getLatLng();

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
        if (this.routeLayer) {
            this.map.removeLayer(this.routeLayer);
        }

        this.routeLayer = L.polyline(route, {
            color: '#2563eb',
            weight: 4,
            opacity: 0.8
        }).addTo(this.map);

        this.map.fitBounds(this.routeLayer.getBounds());
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
        }
    }

    displayShadows(geojson) {
        if (this.shadowLayer) {
            this.map.removeLayer(this.shadowLayer);
        }

        this.shadowLayer = L.geoJSON(JSON.parse(geojson), {
            style: {
                color: "transparent",
                weight: 0,
                fillColor: "#1e293b",
                fillOpacity: 0.2
            }
        }).addTo(this.map);
    }

    setShadeWeight(weight) {
        this.shadeWeight = parseFloat(weight);
        // Update the display value with one decimal place
        document.getElementById('shadeValue').textContent = this.shadeWeight.toFixed(1);
        if (this.startMarker && this.endMarker) {
            this.calculateRoute();
        }
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
}

// Initialize map when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.mapManager = new MapManager();
    window.mapManager.loadShadows();
}); 