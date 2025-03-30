import numpy as np
import osmnx as ox
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt
from shapely.geometry import MultiPolygon, Polygon, LineString, MultiLineString, GeometryCollection
from shapely.ops import unary_union
from shapely.ops import linemerge
import re


class Class_Shadow:
    @staticmethod
    def create_shadow_polygon(building, dx, dy):
        # Assuming `building` is a Polygon, get the exterior coordinates
        exterior_coords = list(building.exterior.coords)
        shadow_coords = [(x + dx, y + dy) for x, y in exterior_coords]
        return Polygon(shadow_coords)

    @staticmethod
    def generate_distorted_shadow(building, azimuth, altitude):
        """
        Generate a realistically distorted shadow for a building polygon based on sun altitude and azimuth.
        Includes the union of the building and shadow to fill gaps.
        """

        height = float(building['height'])  # Use building height in meters
        footprint = building['geometry']  # Original building footprint

        # Inflate the building footprint slightly to ensure overlap with shadow
        inflated_footprint = footprint.buffer(0.5)  # Inflate by 0.5 meters

        # Extract scalar values
        altitude_value = altitude.values[0] if isinstance(altitude, pd.Series) else altitude
        azimuth = azimuth.iloc[0] if isinstance(azimuth, pd.Series) else azimuth

        # Calculate shadow length using the altitude value
        shadow_length = height / max(0.1, np.tan(np.radians(altitude_value)))

        # If no shadow length (e.g., sun is directly overhead or negative), return None
        if shadow_length <= 0:
            return None

        # Calculate shadow vector based on azimuth, negated to ensure the shadow is cast away from the building
        azimuth_radians = np.radians(azimuth)
        shadow_vector = np.array([-np.sin(azimuth_radians), -np.cos(azimuth_radians)]) * shadow_length

        # Ensure the geometry is valid
        if isinstance(footprint, (Polygon, MultiPolygon)):
            if footprint.is_empty:
                print("Warning: Empty geometry for building.")
                return footprint

            # Get the coordinates of the polygon's exterior
            original_coords = list(footprint.exterior.coords)
            distorted_coords = []

            # Find the centroid of the building for reference
            centroid = np.mean(np.array(original_coords), axis=0)

            for x, y in original_coords:
                # Calculate the relative position of the vertex to the shadow vector
                vertex_vector = np.array([x, y]) - centroid
                projection = np.dot(vertex_vector, shadow_vector) / np.linalg.norm(shadow_vector)

                # Stretch vertices farther away from the shadow base
                if projection >= 0:  # Vertices on the far side of the shadow
                    stretch_factor = 0.5 + (projection / (2 * height))  # Scale down the stretch factor
                    displacement = shadow_vector * stretch_factor
                else:  # Vertices closer to the shadow base
                    displacement = shadow_vector * 0.2  # Increase displacement for near-side vertices

                # Apply the displacement to the vertex
                new_x = x + displacement[0]
                new_y = y + displacement[1]
                distorted_coords.append((new_x, new_y))

            # Create a new polygon for the shadow
            shadow_polygon = Polygon(distorted_coords)

            # Buffer the shadow polygon slightly to ensure overlap
            buffered_shadow = shadow_polygon.buffer(0.5)

            # Combine the inflated building footprint and the buffered shadow to fill gaps
            combined_polygon = unary_union([inflated_footprint, buffered_shadow])

            # Print information for debugging or verification
            print(f"Building Height: {height}, Altitude: {altitude_value}, Shadow Length: {shadow_length}")
            print(f"Azimuth: {azimuth}, Shadow Vector: {shadow_vector}")

            if isinstance(combined_polygon, Polygon):
                # Create a new Polygon without holes
                filled_polygon = Polygon(combined_polygon.exterior)
            elif combined_polygon.geom_type == 'MultiPolygon':
                # If there are multiple polygons, iterate and remove holes from each
                filled_polygons = []
                for poly in combined_polygon.geoms:
                    filled_polygons.append(Polygon(poly.exterior))
                filled_polygon = unary_union(filled_polygons)
            return filled_polygon
        else:
            raise ValueError(f"Invalid geometry type for footprint: {type(footprint)}")

    @staticmethod
    def project_shadow(building, azimuth, altitude):
        """
        Creates a shadow polygon for a building by calling the shadow generation function.
        """
        height = float(building['height'])  # Use building height in meters
        footprint = building['geometry']  # Original building footprint

        # Extract scalar values for altitude and azimuth
        altitude_value = altitude.values[0] if isinstance(altitude, pd.Series) else altitude
        azimuth = azimuth.iloc[0] if isinstance(azimuth, pd.Series) else azimuth

        # Calculate shadow length using the altitude value
        shadow_length = height / max(0.1, np.tan(np.radians(altitude_value)))

        # If no shadow length (e.g., sun is directly overhead or negative), return the footprint
        if shadow_length <= 0:
            return footprint

        # Ensure the footprint is valid
        if isinstance(footprint, (Polygon, MultiPolygon)):
            if footprint.is_empty:
                print("Warning: Empty geometry for building.")
                return footprint

            # Call the shadow generation function
            shadow_polygon = Class_Shadow.generate_distorted_shadow(building, azimuth, altitude)
            if shadow_polygon is None:
                return footprint  # If no shadow could be generated, return the original footprint

            # Combine the building footprint and the shadow to ensure continuity
            extended_polygon = footprint.union(shadow_polygon)

            print(f"Building Height: {height}, Altitude: {altitude_value}, Shadow Length: {shadow_length}")
            print(f"Azimuth: {azimuth}, Shadow Polygon Created: {shadow_polygon is not None}")

            return extended_polygon
        else:
            raise ValueError(f"Invalid geometry type for footprint: {type(footprint)}")

    @staticmethod
    def calculate_shadow_weight(edge, shadows):
        edge_geom = edge['geometry']
        shadowed_length = 0

        for shadow in shadows['shadow_geometry']:
            if edge_geom.intersects(shadow):
                shadowed_length += edge_geom.intersection(shadow).length

        return shadowed_length / edge_geom.length  # Fraction of edge in shadow

    @staticmethod
    def analyze_and_plot_coverage(G, buildings, custom_bounds=None, plot=True):
        # Step 1: Create a MultiPolygon for all shadow geometries
        all_shadows = MultiPolygon([shadow for shadow in buildings['shadow_geometry'] if shadow is not None])

        # Step 2: Plot all the shadows, paths, and buildings with numeric addresses
        fig, ax = plt.subplots(figsize=(14, 14))

        # Plot the roads graph using osmnx
        ox.plot_graph(G, ax=ax, show=False, close=False, edge_color='gray', edge_linewidth=0.5)

        # Plot all shadows on top of roads
        shadows_gdf = gpd.GeoSeries(all_shadows)
        shadows_gdf.plot(ax=ax, color='darkgrey', alpha=0.7, label='Shadows')

        # Plot buildings
        buildings.plot(ax=ax, color='orange', alpha=0.7, edgecolor='black')

        # Adding numeric house number labels to buildings if available
        for idx, building in buildings.iterrows():
            housenumber = building.get('addr:housenumber', None)

            if pd.notna(housenumber):
                # Extract only the numeric part of the house number
                numeric_housenumber = ''.join(re.findall(r'\d+', str(housenumber)))

                if numeric_housenumber:  # Only label if a numeric part exists
                    centroid = building.geometry.centroid
                    ax.text(centroid.x, centroid.y, numeric_housenumber, fontsize=8, color='black', alpha=0.9,
                            ha='center')

        x_min, x_max = ax.get_xlim()
        y_min, y_max = ax.get_ylim()

        # Add a margin to zoom out (e.g., 10% margin)
        margin = 0.1  # 10% margin
        x_margin = (x_max - x_min) * margin
        y_margin = (y_max - y_min) * margin

        # Set new limits with the added margin
        ax.set_xlim(x_min - x_margin, x_max + x_margin)
        ax.set_ylim(y_min - y_margin, y_max + y_margin)

        # Add legend and labels
        ax.set_title('Buildings, Shadows, and Paths at Ben Gurion University with Numeric House Numbers')
        ax.set_xlabel('Longitude')
        ax.set_ylabel('Latitude')
        if plot:
            plt.show()

    @staticmethod
    def analyze_coverage(G, shadow_gdf, buildings, custom_bounds=None,plot=True):
        # Ensure CRS consistency before analyzing paths
        graph_crs = G.graph.get('crs', None)
        if graph_crs is None:
            raise ValueError("Graph G does not have a defined CRS. Please make sure it has a valid CRS.")

        # Ensure both datasets are in the same CRS
        if shadow_gdf.crs != graph_crs:
            shadow_gdf = shadow_gdf.to_crs(graph_crs)

        # Create a larger figure for visualization
        fig, ax = plt.subplots(figsize=(15, 15), dpi=100)
        fig.tight_layout()

        # Plot buildings (as shadow proxies)
        shadow_gdf.plot(ax=ax, color='darkgrey', alpha=0.7, label='Shadows')

        buildings.plot(ax=ax, color='orange', alpha=0.7, edgecolor='black')

        # Plot the graph with all paths using osmnx
        ox.plot_graph(G, ax=ax, show=False, close=False, edge_color="gray", edge_linewidth=1)

        for u, v, key, edge in G.edges(keys=True, data=True):
            path = edge.get('geometry')

            if path is not None and isinstance(path, (LineString, MultiLineString)):
                if isinstance(path, MultiLineString):
                    path = linemerge(path)  # Merge MultiLineString into LineString

                # Validate and buffer the path slightly to improve intersection accuracy
                if not path.is_valid:
                    path = path.buffer(0)

                # Step 6: Find the intersection of the path with the combined geometry
                intersection = shadow_gdf.unary_union.intersection(path)

                # Step 7: Calculate the covered length
                covered_path_length = 0
                if isinstance(intersection, LineString):
                    covered_path_length = intersection.length
                elif isinstance(intersection, MultiLineString):
                    covered_path_length = sum(line.length for line in intersection.geoms)
                elif isinstance(intersection, GeometryCollection):
                    covered_path_length = sum(
                        geom.length for geom in intersection.geoms if isinstance(geom, (LineString, MultiLineString)))

                # Calculate the length of the path
                total_path_length = path.length

                # Calculate coverage percentage
                coverage_percentage = (covered_path_length / total_path_length) * 100 if total_path_length > 0 else 0

                # Add the coverage percentage as an attribute to the edge
                G[u][v][key]['shadow_coverage'] = coverage_percentage

                # Plot the path
                x, y = path.xy
                ax.plot(x, y, color='gray', linestyle='-', linewidth=2, alpha=0.7)

                # Plot the covered portion of the path in red
                if not intersection.is_empty:
                    if isinstance(intersection, LineString):
                        x, y = intersection.xy
                        ax.plot(x, y, color='red', linestyle='-', linewidth=3, alpha=0.9)
                    elif isinstance(intersection, MultiLineString):
                        for line in intersection.geoms:
                            x, y = line.xy
                            ax.plot(x, y, color='red', linestyle='-', linewidth=3, alpha=0.9)

        # Step 8: Output the results for each path
        for u, v, key, data in G.edges(keys=True, data=True):
            coverage = data.get('shadow_coverage', 0)
            #print(f"Edge {u}-{v}: {coverage:.2f}% covered by shadow/buildings")

        # Adding numeric house number labels to buildings if available
        for idx, building in buildings.iterrows():
            housenumber = building.get('addr:housenumber', None)

            if pd.notna(housenumber):
                # Extract only the numeric part of the house number
                numeric_housenumber = ''.join(re.findall(r'\d+', str(housenumber)))

                if numeric_housenumber:  # Only label if a numeric part exists
                    centroid = building.geometry.centroid
                    ax.text(centroid.x, centroid.y, numeric_housenumber, fontsize=8, color='black', alpha=0.9,
                            ha='center')

        x_min, x_max = ax.get_xlim()
        y_min, y_max = ax.get_ylim()

        # Add a margin to zoom out (e.g., 10% margin)
        margin = 0.1  # 10% margin
        x_margin = (x_max - x_min) * margin
        y_margin = (y_max - y_min) * margin

        # Set new limits with the added margin
        ax.set_xlim(x_min - x_margin, x_max + x_margin)
        ax.set_ylim(y_min - y_margin, y_max + y_margin)

        # Add title and labels
        plt.title("Buildings, Shadows, and Paths at Ben Gurion University", fontsize=20)
        plt.xlabel("Longitude", fontsize=16)
        plt.ylabel("Latitude", fontsize=16)

        # Improve visibility of plot grid and background
        ax.grid(True, linestyle='--', linewidth=0.5)

        # Show the plot
        plt.tight_layout()
        if plot:
            plt.show()

    @staticmethod
    def make_new_weights(G):
        delta = [1, 10, 50, 80]
        for u, v, key, edge in G.edges(keys=True, data=True):
            coverage = edge.get('shadow_coverage', 0)
            path = edge.get('geometry')
            total_path_length = path.length
            distance_shadow = (coverage * total_path_length) / 100
            i = 1
            for d in delta:
                new_distance_shadow = distance_shadow / d
                #print(f"new_distance_shadow: {new_distance_shadow}\n")
                d_name = f"cost_{i}"
                i = i + 1
                distance_sun = total_path_length - distance_shadow
                G[u][v][key][d_name] = distance_sun + new_distance_shadow


