import os
import sys
import json
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
import osmnx as ox
import networkx as nx
import geopandas as gpd
import pandas as pd
from pyproj import Transformer
from datetime import datetime as dt
import pytz
import traceback

# ודא ששמות הקבצים המיובאים תואמים לשמות הקבצים שלך בפועל
from SunLocation import SunLocation, TIME_ZONE  # מניח ש-TIME_ZONE מוגדר ב-SunLocation.py
from Open_Street_Map import Open_Street_Map
from Class_Shadow import Class_Shadow
from config import (
    CRS_WGS84,
    CRS_UTM,
    API_CONFIG,
    ERROR_MESSAGES,
    CORS_ORIGINS
)

# ── Paths & users file ─────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.normpath(os.path.join(BASE_DIR, os.pardir, 'frontend'))
USERS_FILE = os.path.join(BASE_DIR, 'users.json')

# ── initialize Flask only once ────────────────────────────────────────────────
app = Flask(
    __name__,
    static_folder=FRONTEND_DIR,
    static_url_path=''
)
app.secret_key = os.environ.get('SECRET_KEY', 'a-very-secret-key-that-you-should-change')
app.logger.setLevel('INFO')
CORS(app, origins=CORS_ORIGINS, supports_credentials=True)

# ── Flask-Login setup ─────────────────────────────────────────────────────────
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page_route'  # שנה ל-endpoint של דף הלוגין שלך אם נדרש


def load_users():
    try:
        with open(USERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        app.logger.warning(f"Users file not found at {USERS_FILE}. Returning empty list.")
        return []
    except json.JSONDecodeError:
        app.logger.error(f"Error decoding JSON from users file: {USERS_FILE}. Returning empty list.")
        return []


def save_users(users):
    try:
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(users, f, ensure_ascii=False, indent=2)
    except IOError as e:
        app.logger.error(f"Could not save users to {USERS_FILE}: {e}")


# ── User model ────────────────────────────────────────────────────────────────
class User(UserMixin):
    def __init__(self, data):
        self.id = str(data.get('id', ''))
        self.email = data.get('email', '')
        self.first_name = data.get('first_name')


@login_manager.user_loader
def load_user(user_id):
    users = load_users()
    user_data = next((u for u in users if str(u.get('id')) == str(user_id)), None)
    return User(user_data) if user_data else None


# ── Serve your SPA ─────────────────────────────────────────────────────────────
@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def serve_frontend(path):
    if ".." in path:
        return "Invalid path", 400
    return app.send_static_file(path)


# --- טעינה ראשונית של נתונים (פעם אחת כשהאפליקציה עולה) ---
app.logger.info("Starting initial data load...")
initial_shadow_gdf = None
try:
    initial_sunloc = SunLocation()
    initial_azimuth = initial_sunloc.azimuth
    initial_altitude = initial_sunloc.altitude
    if not initial_azimuth.empty and not initial_altitude.empty:
        app.logger.info(
            f"Initial sun position: Azimuth={initial_azimuth.iloc[0]:.2f}, Altitude={initial_altitude.iloc[0]:.2f}")
    else:
        app.logger.warning("Initial sun position data (azimuth/altitude) is empty.")

    osm = Open_Street_Map()
    osm.Buildings = osm.Buildings.to_crs(CRS_UTM)
    osm.Buildings['area'] = osm.Buildings['geometry'].area
    osm.Buildings['height'] = osm.Buildings.get('height', pd.Series(0.0, index=osm.Buildings.index)).fillna(0.0).astype(
        float)

    osm.Buildings['shadow_geometry_initial'] = osm.Buildings.apply(
        lambda b: Class_Shadow.generate_distorted_shadow(b, initial_azimuth, initial_altitude), axis=1
    )
    osm.Buildings_with_initial_shadows = osm.Buildings[osm.Buildings['shadow_geometry_initial'].notna()].copy()

    if not osm.Buildings_with_initial_shadows.empty:
        initial_shadow_gdf = gpd.GeoDataFrame(osm.Buildings_with_initial_shadows, geometry='shadow_geometry_initial',
                                              crs=CRS_UTM)
    else:
        app.logger.warning("No initial shadows were generated. initial_shadow_gdf will be empty.")
        initial_shadow_gdf = gpd.GeoDataFrame(geometry=[], crs=CRS_UTM)

    app.logger.info("Performing initial shadow coverage analysis on osm.G...")
    original_stdout = sys.stdout
    devnull_file = open(os.devnull, 'w')
    sys.stdout = devnull_file
    try:
        Class_Shadow.analyze_coverage(osm.G, initial_shadow_gdf, osm.Buildings, osm.combined_bounds, False)
    finally:
        sys.stdout = original_stdout
        devnull_file.close()
    app.logger.info("Initial shadow coverage analysis complete.")
except Exception as e:
    app.logger.error(f"Critical error during initial data load: {e}\n{traceback.format_exc()}")
    if 'initial_shadow_gdf' not in locals() and 'initial_shadow_gdf' not in globals():
        initial_shadow_gdf = gpd.GeoDataFrame(geometry=[], crs=CRS_UTM)


# --- Validators ---
def validate_coordinates(coord):
    if not isinstance(coord, list) or len(coord) != 2: return False
    try:
        lat, lon = float(coord[0]), float(coord[1])
        return -90 <= lat <= 90 and -180 <= lon <= 180
    except (ValueError, TypeError):
        return False


def validate_shade_weight(weight_val):
    try:
        weight_float = float(weight_val)
        min_w = API_CONFIG.get('MIN_SHADE_WEIGHT', 0.1)
        max_w = API_CONFIG.get('MAX_SHADE_WEIGHT', 10.0)
        return min_w <= weight_float <= max_w
    except (ValueError, TypeError):
        return False


# --- Route endpoint ---
@app.route('/route', methods=['POST'])
@cross_origin()
def route():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': ERROR_MESSAGES.get('INVALID_REQUEST_BODY', 'Invalid request body')}), 400

        start_coords = data.get('start')
        dest_coords = data.get('dest')
        shade_preference_weight = data.get('shade_weight', API_CONFIG.get('DEFAULT_SHADE_WEIGHT', 1.0))

        if not start_coords or not dest_coords:
            return jsonify(
                {'error': ERROR_MESSAGES.get('MISSING_COORDINATES', 'Start or destination coordinates missing')}), 400
        if not all(validate_coordinates(c) for c in [start_coords, dest_coords]):
            return jsonify({'error': ERROR_MESSAGES.get('INVALID_COORDINATES', 'Invalid coordinates provided')}), 400

        if not validate_shade_weight(shade_preference_weight):
            return jsonify({'error': ERROR_MESSAGES.get('INVALID_SHADE_WEIGHT',
                                                        'Shade weight out of allowed range or invalid format')}), 400
        shade_preference_weight = float(shade_preference_weight)

        transformer_to_utm = Transformer.from_crs(CRS_WGS84, CRS_UTM, always_xy=True)
        start_utm_x, start_utm_y = transformer_to_utm.transform(start_coords[1], start_coords[0])
        dest_utm_x, dest_utm_y = transformer_to_utm.transform(dest_coords[1], dest_coords[0])

        current_graph = osm.G

        origin_node = osm.get_nearest_node(x=start_utm_x, y=start_utm_y)
        destination_node = osm.get_nearest_node(x=dest_utm_x, y=dest_utm_y)

        make_new_weights(current_graph, shade_preference_weight)

        path_nodes = []
        try:
            path_nodes = nx.shortest_path(current_graph, origin_node, destination_node, weight='new_weights')
        except nx.NetworkXNoPath:
            return jsonify({'error': ERROR_MESSAGES.get('ROUTE_NOT_FOUND', 'No path found between the points')}), 400
        except nx.NodeNotFound:
            return jsonify({'error': ERROR_MESSAGES.get('NODE_NOT_FOUND',
                                                        'One of the points could not be mapped to the network')}), 404

        actual_path_length = 0.0
        if len(path_nodes) > 1:
            try:
                actual_path_length = nx.path_weight(current_graph, path_nodes, 'length')
            except Exception as e_path_weight:
                app.logger.error(
                    f"Error calculating path_weight with 'length' for the found path: {e_path_weight}\n{traceback.format_exc()}")
                return jsonify({'error': ERROR_MESSAGES.get('PATH_LENGTH_ERROR',
                                                            'Could not calculate length of the found path')}), 500

        gdf_nodes, _ = ox.graph_to_gdfs(osm.G)
        utm_coords = []
        for node_id in path_nodes:
            try:
                node_data = gdf_nodes.loc[node_id]
                utm_coords.append((node_data['x'], node_data['y']))
            except KeyError:
                app.logger.error(
                    f"Node ID {node_id} not found in gdf_nodes. Graph might be inconsistent.\n{traceback.format_exc()}")
                return jsonify(
                    {'error': ERROR_MESSAGES.get('NODE_DATA_ERROR', 'Error retrieving node data for path')}), 500

        transformer_to_wgs84 = Transformer.from_crs(CRS_UTM, CRS_WGS84, always_xy=True)
        route_coords_wgs84 = [transformer_to_wgs84.transform(x, y) for x, y in utm_coords]

        return jsonify({
            'route': [(lat, lon) for lon, lat in route_coords_wgs84],
            'distance': round(actual_path_length, 2),
            'nodes': len(path_nodes)
        })
    except Exception as e:
        app.logger.error(f"Critical error in /route endpoint: {e}\n{traceback.format_exc()}")
        return jsonify({'error': ERROR_MESSAGES.get('SERVER_ERROR', 'An unexpected server error occurred')}), 500


# --- Shadows endpoint (מגיש צללים של "עכשיו") ---
@app.route('/shadows', methods=['GET'])
@cross_origin()
def get_shadows():
    global initial_shadow_gdf
    try:
        if initial_shadow_gdf is None:
            app.logger.error("initial_shadow_gdf is None. Initial shadow calculation may have failed.")
            return jsonify({'error': ERROR_MESSAGES.get('SERVER_ERROR', 'Initial shadows not available.')}), 500

        if initial_shadow_gdf.empty or 'shadow_geometry_initial' not in initial_shadow_gdf.columns:
            app.logger.info("Initial shadows are empty or column missing, returning empty GeoJSON for /shadows")
            empty_gdf = gpd.GeoDataFrame(geometry=[], crs=CRS_WGS84)
            message = 'No shadows at current time (e.g., night or error in initial calculation).'
            if initial_shadow_gdf.empty and (
                    'shadow_geometry_initial' in initial_shadow_gdf.columns or initial_shadow_gdf.geometry.name == 'shadow_geometry_initial'):
                message = 'No shadows at current time (e.g., night).'
            return jsonify({'shadows': empty_gdf.to_json(), 'message': message})

        tmp_gdf = initial_shadow_gdf[['shadow_geometry_initial']].copy()
        tmp_gdf = tmp_gdf.set_geometry('shadow_geometry_initial').rename_geometry('geometry')
        tmp_gdf_wgs84 = tmp_gdf.to_crs(CRS_WGS84)  # שימוש ב-epsg= כאן בסדר כי CRS_WGS84 הוא "EPSG:4326"

        return jsonify({'shadows': tmp_gdf_wgs84.to_json()})
    except Exception as e:
        app.logger.error(f"Error in /shadows endpoint: {e}\n{traceback.format_exc()}")
        return jsonify({'error': ERROR_MESSAGES.get('SERVER_ERROR', 'An unexpected server error occurred')}), 500


# --- NEW: Endpoint for Future Time Shadows ---
@app.route('/shadows_at_time', methods=['POST'])
@cross_origin()
def get_shadows_at_time():
    try:
        data = request.get_json()
        if not data or 'datetime_str' not in data:
            return jsonify({'error': 'Missing datetime_str in request body. Expected format: YYYY-MM-DDTHH:MM:SS'}), 400

        datetime_str = data['datetime_str']

        try:
            naive_user_dt = dt.fromisoformat(datetime_str)
            map_timezone = pytz.timezone(TIME_ZONE)
            user_datetime_aware = map_timezone.localize(naive_user_dt)
        except ValueError:
            return jsonify({'error': 'Invalid datetime_str format. Please use YYYY-MM-DDTHH:MM:SS'}), 400

        app.logger.info(f"Calculating shadows for user specified time: {user_datetime_aware.isoformat()}")

        future_sunloc = SunLocation(observation_time=user_datetime_aware)
        future_azimuth = future_sunloc.azimuth
        future_altitude = future_sunloc.altitude

        # בדיקה אם נתוני השמש תקינים (למשל, אם altitude הוא מספר)
        # והאם השמש מעל האופק
        sun_is_up = False
        if not future_azimuth.empty and not future_altitude.empty:
            current_altitude = future_altitude.iloc[0]
            app.logger.info(
                f"Future sun position: Azimuth={future_azimuth.iloc[0]:.2f}, Altitude={current_altitude:.2f}")
            if current_altitude > 0:  # השמש מעל האופק
                sun_is_up = True
            else:
                app.logger.info("Sun is below horizon.")
        else:
            app.logger.warning("Future sun position data (azimuth/altitude) is empty or invalid.")

        if not sun_is_up:  # אם השמש לא למעלה, אין צללים
            app.logger.info(
                f"Sun is not up for {user_datetime_aware.isoformat()}. Updating osm.G to have zero shadow coverage.")
            empty_shadow_gdf_for_analysis = gpd.GeoDataFrame(geometry=[], crs=CRS_UTM)
            _original_stdout_night = sys.stdout
            devnull_file_night = open(os.devnull, 'w')
            sys.stdout = devnull_file_night
            try:
                Class_Shadow.analyze_coverage(osm.G, empty_shadow_gdf_for_analysis, osm.Buildings, osm.combined_bounds,
                                              plot=False)
            finally:
                sys.stdout = _original_stdout_night
                devnull_file_night.close()
            app.logger.info("osm.G shadow_coverage updated to zero for night time conditions.")
            empty_gdf_wgs84_for_response = gpd.GeoDataFrame(geometry=[], crs=CRS_WGS84)
            return jsonify({'shadows': empty_gdf_wgs84_for_response.to_json(),
                            'requested_time': user_datetime_aware.isoformat(),
                            'message': 'Night time or sun is below horizon. No shadows calculated.'})

        # אם הגענו לכאן, השמש למעלה ויש לחשב צללים
        temp_buildings_data = osm.Buildings[['geometry', 'height']].copy()
        temp_buildings_data = temp_buildings_data.to_crs(CRS_UTM)

        temp_buildings_data['calculated_shadow'] = temp_buildings_data.apply(
            lambda b: Class_Shadow.generate_distorted_shadow(b, future_azimuth, future_altitude), axis=1
        )

        temp_buildings_with_shadows = temp_buildings_data[temp_buildings_data['calculated_shadow'].notna()].copy()

        if temp_buildings_with_shadows.empty:
            app.logger.info("No physical shadows generated (e.g., sun directly overhead or no buildings cast shadows).")
            empty_gdf = gpd.GeoDataFrame(geometry=[], crs=CRS_WGS84)
            return jsonify({'shadows': empty_gdf.to_json(),
                            'requested_time': user_datetime_aware.isoformat(),
                            'message': 'Sun is up, but no shadows were generated for buildings in the area.'})

        future_shadow_gdf = gpd.GeoDataFrame(temp_buildings_with_shadows, geometry='calculated_shadow', crs=CRS_UTM)

        app.logger.info(f"Updating osm.G shadow_coverage for future time: {user_datetime_aware.isoformat()}")
        _original_stdout = sys.stdout
        devnull_file_fs = open(os.devnull, 'w')
        sys.stdout = devnull_file_fs
        try:
            Class_Shadow.analyze_coverage(osm.G, future_shadow_gdf, osm.Buildings, osm.combined_bounds, False)
        finally:
            sys.stdout = _original_stdout
            devnull_file_fs.close()
        app.logger.info("osm.G shadow_coverage updated for future time.")

        response_gdf = future_shadow_gdf[['calculated_shadow']].copy()
        response_gdf = response_gdf.set_geometry('calculated_shadow').rename_geometry('geometry')
        response_gdf_wgs84 = response_gdf.to_crs(CRS_WGS84)

        # אם הגענו לכאן, יש צללים והם חושבו
        return jsonify({'shadows': response_gdf_wgs84.to_json(),
                        'requested_time': user_datetime_aware.isoformat()
                        # אין צורך ב-message אם יש צללים
                        })

    except Exception as e:
        app.logger.error(f"Error in /shadows_at_time endpoint: {e}\n{traceback.format_exc()}")
        return jsonify({'error': ERROR_MESSAGES.get('SERVER_ERROR', 'An unexpected server error occurred')}), 500


# --- Weight helper (מוגדר מקומית ב-Flask_app.py) ---
def make_new_weights(G, delta_param):
    for u, v, key, edge_data in G.edges(keys=True, data=True):
        if 'new_weights' in edge_data:
            del G[u][v][key]['new_weights']

    for u, v, key, edge_data in G.edges(keys=True, data=True):
        cov = edge_data.get('shadow_coverage', 0.0)
        length = edge_data.get('length', 0.0)

        if 'geometry' in edge_data and edge_data['geometry'] is not None:
            if length == 0.0:
                length = edge_data['geometry'].length
        else:
            edge_data['new_weights'] = float('inf')
            continue

        if length == 0.0:
            edge_data['new_weights'] = float('inf')
            continue

        ds = (cov * length) / 100.0

        current_delta = float(delta_param)
        if abs(current_delta) < 1e-9:  # בדיקה אם current_delta קרוב מאוד לאפס
            ns = float('inf') if ds > 1e-9 else 0.0
        else:
            ns = ds / current_delta

        sun = length - ds
        edge_data['new_weights'] = sun + ns


# --- Auth endpoints ---
@app.route('/register', methods=['POST'])
@cross_origin()
def register():
    data = request.get_json() or {}
    required_fields = ('email', 'password', 'first_name', 'last_name')
    if not all(data.get(f) for f in required_fields):
        return jsonify({'error': 'Missing fields or empty values in required fields'}), 400

    users = load_users()
    if any(u['email'] == data['email'] for u in users):
        return jsonify({'error': 'Email already registered'}), 409

    new_id = max((u.get('id', 0) for u in users), default=0) + 1
    # from werkzeug.security import generate_password_hash
    # hashed_password = generate_password_hash(data['password'])
    nu = {
        'id': new_id,
        'email': data['email'],
        'password': data['password'],  # !!! לא מאובטח !!!
        'first_name': data['first_name'],
        'last_name': data['last_name'],
        'favorite_routes': []
    }
    users.append(nu)
    save_users(users)
    # login_user(User(nu)) # Consider if auto-login is desired
    return jsonify({'message': 'Registration successful. Please login.', 'first_name': nu['first_name']}), 201


@app.route('/login', methods=['POST'])
@cross_origin()
def login():
    data = request.get_json() or {}
    if not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Missing email or password'}), 400

    users = load_users()
    user_data = next((x for x in users if x.get('email') == data['email']), None)

    if not user_data:
        return jsonify({'error': 'Email not registered'}), 404

    # from werkzeug.security import check_password_hash
    # if not check_password_hash(user_data['password'], data['password']):
    if user_data.get('password') != data['password']:  # !!! לא מאובטח !!!
        return jsonify({'error': 'Incorrect password'}), 401

    login_user(User(user_data))
    return jsonify({'message': 'Login successful', 'first_name': user_data.get('first_name')}), 200


@app.route('/logout', methods=['POST'])
@login_required
@cross_origin(supports_credentials=True)
def do_logout():  # שם פונקציה שונה מ-logout_user המיובא
    logout_user()
    return jsonify({'message': 'Logged out successfully'}), 200


# --- Favorites endpoints ---
@app.route('/api/favorites', methods=['GET'])
@login_required
@cross_origin(supports_credentials=True)
def list_favorites():
    users = load_users()
    user_data = next((x for x in users if str(x.get('id')) == str(current_user.id)), None)
    if not user_data:
        return jsonify({'error': 'User not found for favorites'}), 404
    return jsonify(user_data.get('favorite_routes', []))


@app.route('/api/favorites', methods=['POST'])
@login_required
@cross_origin(supports_credentials=True)
def add_favorite():
    users = load_users()
    user_data = next((x for x in users if str(x.get('id')) == str(current_user.id)), None)
    if not user_data:
        return jsonify({'error': 'User not found for adding favorite'}), 404

    if 'favorite_routes' not in user_data:
        user_data['favorite_routes'] = []

    if len(user_data['favorite_routes']) >= API_CONFIG.get("MAX_FAVORITES", 5):
        return jsonify({'error': f"You can save up to {API_CONFIG.get('MAX_FAVORITES', 5)} favorite routes only."}), 409

    d = request.get_json() or {}
    if not d.get('origin') or not d.get('dest') or \
            not all(validate_coordinates(c) for c in [d.get('origin'), d.get('dest')]):
        return jsonify({'error': 'Invalid or missing origin/destination coordinates for favorite.'}), 400

    fav = {
        'origin': d.get('origin'),
        'dest': d.get('dest'),
        'origin_name': d.get('origin_name'),
        'dest_name': d.get('dest_name')
    }
    user_data['favorite_routes'].append(fav)
    save_users(users)
    return jsonify({'status': 'ok', 'route': fav}), 201


@app.route('/api/favorites', methods=['DELETE'])
@login_required
@cross_origin(supports_credentials=True)
def delete_favorite():
    users = load_users()
    user_data = next((x for x in users if str(x.get('id')) == str(current_user.id)), None)
    if not user_data:
        return jsonify({'error': 'User not found for deleting favorite'}), 404

    d = request.get_json() or {}
    if not d.get('origin') or not d.get('dest'):
        return jsonify({'error': 'Missing origin or destination to identify favorite for deletion.'}), 400

    initial_len = len(user_data.get('favorite_routes', []))
    user_data['favorite_routes'] = [
        fr for fr in user_data.get('favorite_routes', [])
        if not (fr.get('origin') == d.get('origin') and fr.get('dest') == d.get('dest'))
    ]

    if len(user_data.get('favorite_routes', [])) == initial_len:
        return jsonify({'error': 'Favorite not found to delete or coordinates did not match exactly'}), 404

    save_users(users)
    return jsonify({'status': 'deleted'}), 200


# --- הוספת הדפסות בדיקה ---
app.logger.info("--- Flask App: All configurations and initial loading seem complete ---")
print("--- Flask App: All configurations and initial loading seem complete (stdout) ---")

if __name__ == '__main__':
    app.logger.info("--- Flask App: Inside __main__ block, about to call app.run() ---")
    print("--- Flask App: Inside __main__ block, about to call app.run() (stdout) ---")

    app.run(debug=True, host='0.0.0.0', port=8001)