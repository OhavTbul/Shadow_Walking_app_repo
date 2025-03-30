from typing import Dict, Any

# Coordinate Reference Systems
CRS_WGS84 = "EPSG:4326"
CRS_UTM = "EPSG:32636"

# API Configuration
API_CONFIG: Dict[str, Any] = {
    "MAX_ROUTE_DISTANCE": 10000,  # meters
    "MIN_SHADE_WEIGHT": 0.1,
    "MAX_SHADE_WEIGHT": 10.0,
    "DEFAULT_SHADE_WEIGHT": 1.0,
}

# Error Messages
ERROR_MESSAGES: Dict[str, str] = {
    "INVALID_COORDINATES": "Invalid coordinates provided. Please check the format.",
    "ROUTE_NOT_FOUND": "No route found between the specified points.",
    "INVALID_SHADE_WEIGHT": "Invalid shade weight. Must be between 0.1 and 10.0.",
    "POINTS_TOO_FAR": "The selected points are too far apart.",
    "SERVER_ERROR": "An unexpected error occurred. Please try again.",
}

# CORS Configuration
CORS_ORIGINS = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8001",
    "http://127.0.0.1:8001",
] 