# backend/app.py

from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
import osmnx as ox
import networkx as nx
import geopandas as gpd
from pyproj import Transformer
from SunLocation import SunLocation
from Open_Street_Map import Open_Street_Map
from Class_Shadow import Class_Shadow
from config import (
    CRS_WGS84,
    CRS_UTM,
    API_CONFIG,
    ERROR_MESSAGES,
    CORS_ORIGINS
)
import os

app = Flask(__name__)
# Configure logging to only show errors
app.logger.setLevel('ERROR')
CORS(app, origins=CORS_ORIGINS)

# Load once
sunloc = SunLocation()
azimuth = sunloc.azimuth
altitude = sunloc.altitude

osm = Open_Street_Map()
osm.Buildings = osm.Buildings.to_crs(epsg=32636)
osm.Buildings['area'] = osm.Buildings['geometry'].area
osm.Buildings['height'] = osm.Buildings.get('height', 0).fillna(0)

osm.Buildings['shadow_geometry'] = osm.Buildings.apply(
    lambda b: Class_Shadow.generate_distorted_shadow(b, azimuth, altitude), axis=1)

shadow_gdf = gpd.GeoDataFrame(osm.Buildings, geometry='shadow_geometry').set_crs(epsg=32636)
# Disable print output from analyze_coverage
import sys
original_stdout = sys.stdout
sys.stdout = open(os.devnull, 'w')
Class_Shadow.analyze_coverage(osm.G, shadow_gdf, osm.Buildings, osm.combined_bounds, False)
sys.stdout = original_stdout

def validate_coordinates(coord):
    """Validate coordinate format and range."""
    if not isinstance(coord, list) or len(coord) != 2:
        return False
    lat, lon = coord
    return -90 <= lat <= 90 and -180 <= lon <= 180

def validate_shade_weight(weight):
    """Validate shade weight is within acceptable range."""
    try:
        weight = float(weight)
        return API_CONFIG["MIN_SHADE_WEIGHT"] <= weight <= API_CONFIG["MAX_SHADE_WEIGHT"]
    except (ValueError, TypeError):
        return False

@app.route("/route", methods=["POST"])
@cross_origin()
def route():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": ERROR_MESSAGES["INVALID_COORDINATES"]}), 400

        start = data.get('start')
        dest = data.get('dest')
        weight = data.get('shade_weight', API_CONFIG["DEFAULT_SHADE_WEIGHT"])

        # Input validation
        if not all(validate_coordinates(coord) for coord in [start, dest]):
            return jsonify({"error": ERROR_MESSAGES["INVALID_COORDINATES"]}), 400
        
        if not validate_shade_weight(weight):
            return jsonify({"error": ERROR_MESSAGES["INVALID_SHADE_WEIGHT"]}), 400

        transformer = Transformer.from_crs(CRS_WGS84, CRS_UTM, always_xy=True)
        start_x, start_y = transformer.transform(start[1], start[0])
        dest_x, dest_y = transformer.transform(dest[1], dest[0])

        G = osm.G
        orig_node = osm.get_nearest_node(x=start_x, y=start_y)
        dest_node = osm.get_nearest_node(x=dest_x, y=dest_y)

        # Check if points are too far apart
        distance = nx.shortest_path_length(G, orig_node, dest_node, weight='length')
        if distance > API_CONFIG["MAX_ROUTE_DISTANCE"]:
            return jsonify({"error": ERROR_MESSAGES["POINTS_TOO_FAR"]}), 400

        make_new_weights(G, weight)

        try:
            route_nodes = nx.shortest_path(G, orig_node, dest_node, weight="new_weights")
        except nx.NetworkXNoPath:
            return jsonify({"error": ERROR_MESSAGES["ROUTE_NOT_FOUND"]}), 400

        nodes, _ = ox.graph_to_gdfs(G)
        route_utm = [(nodes.loc[n]['x'], nodes.loc[n]['y']) for n in route_nodes]

        # Convert UTM back to lat/lon
        transformer_back = Transformer.from_crs(CRS_UTM, CRS_WGS84, always_xy=True)
        route_coords = [transformer_back.transform(x, y) for x, y in route_utm]

        return jsonify({
            "route": [(lat, lon) for lon, lat in route_coords],
            "distance": distance,
            "nodes": len(route_nodes)
        })

    except Exception as e:
        app.logger.error(f"Error in /route endpoint: {str(e)}")
        return jsonify({"error": ERROR_MESSAGES["SERVER_ERROR"]}), 500

@app.route("/shadows", methods=["GET"])
@cross_origin()
def get_shadows():
    try:
        # Create a clean GeoDataFrame copy with shadow_geometry only
        temp_shadow = shadow_gdf[["shadow_geometry"]].copy()
        temp_shadow = temp_shadow.set_geometry("shadow_geometry")
        temp_shadow = temp_shadow.rename_geometry("geometry")
        temp_shadow = temp_shadow.to_crs(epsg=4326)

        geojson_str = temp_shadow.to_json()
        return jsonify({"shadows": geojson_str})
    except Exception as e:
        app.logger.error(f"Error in /shadows route: {str(e)}")
        return jsonify({"error": ERROR_MESSAGES["SERVER_ERROR"]}), 500

def make_new_weights(G, delta):
    # Clear any existing new_weights
    for u, v, key, edge in G.edges(keys=True, data=True):
        if "new_weights" in edge:
            del edge["new_weights"]
    
    # Calculate new weights
    for u, v, key, edge in G.edges(keys=True, data=True):
        coverage = edge.get('shadow_coverage', 0)
        path = edge.get('geometry')
        total_path_length = path.length
        distance_shadow = (coverage * total_path_length) / 100
        new_distance_shadow = distance_shadow / delta
        distance_sun = total_path_length - distance_shadow
        G[u][v][key]["new_weights"] = distance_sun + new_distance_shadow

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=8001)
