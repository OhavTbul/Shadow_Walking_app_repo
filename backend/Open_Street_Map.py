
import pandas as pd
import geopandas as gpd
from shapely.geometry import LineString, Point
import osmnx as ox
import random
import folium
import matplotlib.pyplot as plt


class Open_Street_Map:
    def __init__(self):
        place_name = "Ben Gurion University, Beer Sheva, Israel"
        custom_filter = '["highway"~"footway|path|pedestrian|sidewalk|cycleway|living_street|service|unclassified|residential|tertiary|road|steps"]'
        self.crs = 'EPSG:32636'
        ox.settings.use_cache = False
        #G = pl.G
        G = ox.graph_from_place(place_name, network_type="walk", custom_filter=custom_filter, retain_all=True)
        G = ox.project_graph(G, to_crs=self.crs)
        self.G = G
        self.Buildings = ox.features_from_place(place_name, tags={"building": True})
        self.calculate_high()
        self.handel_bad_path()
        self.buildings_with_only_shadows = None
        self.combined_bounds = self.combine()
        self.buildings_gdf = self.convert_geodata()

    def combine(self):
        # Ensure buildings are reprojected to match the graph CRS
        buildings_projected = self.Buildings.to_crs(self.crs)

        # Define graph bounds based on node positions
        node_positions = [data for _, data in self.G.nodes(data=True)]
        graph_bounds = (
            min(node["x"] for node in node_positions),  # minx
            min(node["y"] for node in node_positions),  # miny
            max(node["x"] for node in node_positions),  # maxx
            max(node["y"] for node in node_positions),  # maxy
        )

        # Get bounds for buildings in the same CRS as the graph
        building_bounds = buildings_projected.total_bounds

        # Combine bounds
        combined_bounds = (
            min(building_bounds[0], graph_bounds[0]),  # minx
            min(building_bounds[1], graph_bounds[1]),  # miny
            max(building_bounds[2], graph_bounds[2]),  # maxx
            max(building_bounds[3], graph_bounds[3])  # maxy
        )
        return combined_bounds

    def calculate_high(self):
        # Set 'levels' to numeric if it exists, otherwise set to None
        floor_high = 2.7
        if 'building:levels' in self.Buildings.columns:
            self.Buildings['levels'] = pd.to_numeric(self.Buildings['building:levels'], errors='coerce')
        else:
            self.Buildings['levels'] = None
        #print(self.Buildings['building:levels'])
        #print(f"height : {self.Buildings['height']}")

        # If building has levels, calculate height as levels * 2.7
        self.Buildings['height'] = self.Buildings.apply(
            lambda row: row['levels'] * floor_high if pd.notna(row['levels']) else row['height'], axis=1
        )
        #print(f"height : {self.Buildings['height']}")

        # Set height to 0 if it is still missing
        self.Buildings['height'].fillna(0, inplace=True)

    def handel_bad_path(self):
        """
        Add geometry if missing to the path in G
        """
        for u, v, key, edge in self.G.edges(keys=True, data=True):
            path = edge.get('geometry')

            # Check if geometry is missing
            if path is None:
                # Get the coordinates of the start and end nodes
                x1, y1 = self.G.nodes[u]['x'], self.G.nodes[u]['y']
                x2, y2 = self.G.nodes[v]['x'], self.G.nodes[v]['y']

                # Create a LineString geometry from the coordinates
                path = LineString([(x1, y1), (x2, y2)])
                edge['geometry'] = path

    def convert_geodata(self):
        return gpd.GeoDataFrame(self.Buildings)

    def validation_height_and_handel(self):
        if 'height' not in self.Buildings.columns:
            self.Buildings['height'] = 0  # Initialize with 0 if not present

        # Replace NaN values in height with 0
        self.Buildings['height'] = self.Buildings['height'].fillna(0)

    def get_nearest_node(self, x, y):
         return ox.distance.nearest_nodes(self.G, X=x, Y=y)

    def graph_to_gdfs(self):
        nodes_gdf, edges_gdf = ox.graph_to_gdfs(self.G, nodes=True, edges=True)
        return nodes_gdf, edges_gdf

    def plot_route_folium(self, route_nodes, weight=5, color='blue'):
        # Extract the nodes and edges as GeoDataFrames
        nodes, edges = ox.graph_to_gdfs(self.G)

        # Get the coordinates of the route nodes
        route_coords = [(nodes.loc[node]['y'], nodes.loc[node]['x']) for node in route_nodes]

        # Create a folium map centered at the first coordinate
        route_map = folium.Map(location=route_coords[0], zoom_start=14)

        # Add the route as a polyline
        folium.PolyLine(
            route_coords,
            weight=weight,
            color=color,
            opacity=0.8
        ).add_to(route_map)

        # Optionally, add markers for the start and end points
        folium.Marker(route_coords[0], popup="Start", icon=folium.Icon(color="green")).add_to(route_map)
        folium.Marker(route_coords[-1], popup="End", icon=folium.Icon(color="red")).add_to(route_map)

        # Return the map object
        return route_map

    def find_nodes_in_G(self, dest, original):
        """
        Find nearest nodes in the graph for two points when the CRS of the input is the same as the graph's CRS.

        Input:
            dest: tuple of destination coordinates (x, y) in the same CRS as the graph.
            original: tuple of origin coordinates (x, y) in the same CRS as the graph.

        Output:
            orig_node: Nearest node in the graph to the origin point.
            dest_node: Nearest node in the graph to the destination point.
        """
        # Extract coordinates
        origin_x, origin_y = original
        dest_x, dest_y = dest

        # Validate coordinates against graph bounds
        bounds = self.combined_bounds  # minx, miny, maxx, maxy
        if not (bounds[0] <= origin_x <= bounds[2] and bounds[1] <= origin_y <= bounds[3]):
            raise ValueError(f"Origin point ({origin_x}, {origin_y}) is outside the graph bounds.")
        if not (bounds[0] <= dest_x <= bounds[2] and bounds[1] <= dest_y <= bounds[3]):
            raise ValueError(f"Destination point ({dest_x}, {dest_y}) is outside the graph bounds.")

        # Find nearest nodes
        orig_node = self.get_nearest_node(x=origin_x, y=origin_y)
        dest_node = self.get_nearest_node(x=dest_x, y=dest_y)

        return orig_node, dest_node

    def get_random_point_in_G(self):
        """
        Generate one random point within the bounds of the graph G.
        """
        # Get the graph bounds

        graph_bounds = self.combined_bounds  # minx, miny, maxx, maxy
        print("-----------------graph_bounds----------------------------")
        print(graph_bounds)
        while True:
            # Generate random coordinates within the bounds
            x = random.uniform(graph_bounds[0], graph_bounds[2])  # Between minx and maxx
            y = random.uniform(graph_bounds[1], graph_bounds[3])  # Between miny and maxy

            # Validate if the point is near any graph node
            try:
                self.get_nearest_node(x, y)  # Check if a valid node exists near this point
                return x, y  # Return the valid random point
            except Exception:
                # If no valid node is found, continue generating another point
                continue

    def plot_graph_with_info(self):
        """
        Plot the graph with red nodes, white background, and edge lengths displayed.
        """
        import matplotlib.pyplot as plt
        from shapely.geometry import LineString

        # Get the number of nodes and edges
        num_nodes = len(self.G.nodes)
        num_edges = len(self.G.edges)

        # Extract nodes and their positions
        node_positions = {node: (data['x'], data['y']) for node, data in self.G.nodes(data=True)}

        # Extract edges and their geometry
        edge_geometries = []
        for u, v, data in self.G.edges(data=True):
            if 'geometry' in data:
                edge_geometries.append((u, v, data['geometry'], data.get('length', None)))
            else:
                # If no geometry, create a straight LineString
                x1, y1 = node_positions[u]
                x2, y2 = node_positions[v]
                line = LineString([(x1, y1), (x2, y2)])
                edge_geometries.append((u, v, line, data.get('length', None)))

        # Create the plot
        fig, ax = ox.plot_graph(
            self.G,
            node_color="red",
            node_size=10,
            edge_color="blue",
            edge_linewidth=0.5,
            bgcolor="white",  # Set the background color to white
            show=False,
            close=False,
        )

        # Add edge lengths
        for u, v, geometry, length in edge_geometries:
            if length is not None:
                # Get the midpoint of the edge geometry
                if isinstance(geometry, LineString):
                    midpoint = geometry.interpolate(0.5, normalized=True)
                    mid_x, mid_y = midpoint.x, midpoint.y
                else:
                    # Fallback if no geometry
                    mid_x, mid_y = (
                        (node_positions[u][0] + node_positions[v][0]) / 2,
                        (node_positions[u][1] + node_positions[v][1]) / 2,
                    )

                # Add text for edge length
                ax.text(
                    mid_x,
                    mid_y,
                    f"{length:.1f}m",  # Format length to 1 decimal place
                    fontsize=6,
                    color='black',
                    ha='center',
                    va='center',
                    bbox=dict(facecolor='white', edgecolor='none', alpha=0.7),
                )

        # Add total node and edge counts in the corner
        ax.text(
            0.05, 0.95,
            f"Nodes: {num_nodes}\nEdges: {num_edges}",
            transform=ax.transAxes,
            fontsize=12,
            verticalalignment="top",
            bbox=dict(facecolor="white", alpha=0.9),
        )

        # Show the plot
        plt.show()

    def plot_graph_with_node_numbers_only(self):
        """
        Plot the graph with white background and display only the node numbers.
        """
        import matplotlib.pyplot as plt

        # Extract nodes and their positions
        node_positions = {node: (data['x'], data['y']) for node, data in self.G.nodes(data=True)}

        # Create the plot
        fig, ax = ox.plot_graph(
            self.G,
            node_color="none",  # Hide node dots
            edge_color="blue",
            edge_linewidth=0.5,
            bgcolor="white",  # Set the background color to white
            show=False,
            close=False,
        )

        # Add node numbers
        for node, (x, y) in node_positions.items():
            ax.text(
                x,
                y,
                str(node),  # Display the node number
                fontsize=8,
                color='black',
                ha='center',
                va='center',
                bbox=dict(facecolor='white', edgecolor='black', alpha=0.7, boxstyle="round,pad=0.2"),
            )

        # Show the plot
        plt.show()
