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

app = Flask(__name__)
CORS(app)

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
Class_Shadow.analyze_coverage(osm.G, shadow_gdf, osm.Buildings, osm.combined_bounds, False)

@app.route("/route", methods=["POST"])
@cross_origin()
def route():
    data = request.get_json()
    start = data['start']     # [lat, lon]
    dest = data['dest']       # [lat, lon]
    weight = float(data['shade_weight'])

    transformer = Transformer.from_crs("EPSG:4326", "EPSG:32636", always_xy=True)
    start_x, start_y = transformer.transform(start[1], start[0])
    dest_x, dest_y = transformer.transform(dest[1], dest[0])

    G = osm.G
    orig_node = osm.get_nearest_node(x=start_x, y=start_y)
    dest_node = osm.get_nearest_node(x=dest_x, y=dest_y)

    make_new_weights(G, weight)

    try:
        route_nodes = nx.shortest_path(G, orig_node, dest_node, weight="new_weights")
    except:
        return jsonify({"error": "No route found"}), 400

    nodes, _ = ox.graph_to_gdfs(G)
    route_utm = [(nodes.loc[n]['x'], nodes.loc[n]['y']) for n in route_nodes]

    # Convert UTM back to lat/lon
    transformer_back = Transformer.from_crs("EPSG:32636", "EPSG:4326", always_xy=True)
    route_coords = [transformer_back.transform(x, y) for x, y in route_utm]

    # Return in (lat, lon) format
    return jsonify(route=[(lat, lon) for lon, lat in route_coords])

@app.route("/shadows", methods=["GET"])
@cross_origin()
def get_shadows():
    try:
        print("✅ /shadows route hit")

        # Create a clean GeoDataFrame copy with shadow_geometry only
        temp_shadow = shadow_gdf[["shadow_geometry"]].copy()
        temp_shadow = temp_shadow.set_geometry("shadow_geometry")
        temp_shadow = temp_shadow.rename_geometry("geometry")
        temp_shadow = temp_shadow.to_crs(epsg=4326)

        geojson_str = temp_shadow.to_json()
        return jsonify({"shadows": geojson_str})
    except Exception as e:
        print("Error in /shadows route:", e)
        return jsonify({"error": str(e)}), 500

def make_new_weights(G, delta):
    for u, v, key, edge in G.edges(keys=True, data=True):
        coverage = edge.get('shadow_coverage', 0)
        path = edge.get('geometry')
        total_path_length = path.length
        distance_shadow = (coverage * total_path_length) / 100
        new_distance_shadow = distance_shadow / delta
        distance_sun = total_path_length - distance_shadow
        G[u][v][key]["new_weights"] = distance_sun + new_distance_shadow

if __name__ == "__main__":
    app.run(debug=True)
