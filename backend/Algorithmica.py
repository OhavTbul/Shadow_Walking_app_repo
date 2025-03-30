import osmnx as ox
import networkx as nx
import geopandas as gpd
import matplotlib.pyplot as plt
import geopandas as gpd
from shapely.geometry import Point
from Open_Street_Map import Open_Street_Map
import pandas as pd
from pyproj import Transformer



class Algorithmic:
    def __init__(self, open_object : Open_Street_Map):
        self.open_street_map_object = open_object

    def shortest_path_near_bgu_with_buildings(self, dest, original):
        """
        input : tuple contain (lat,lng)

        1. Download road network and buildings near BGU, Beer Sheva, Israel.
        2. Project them to EPSG:32636.
        3. Compute a shortest path between two lat/lng coordinates near campus.
        4. Plot the route on a Folium map.
        5. (Optionally) plot buildings + edges + nodes in Matplotlib.
        """

        # Now find nearest nodes in the projected graph
        orig_node_32636, dest_node_32636 = self.open_street_map_object.find_nodes_in_G(dest, original)
        orig_node_32636, dest_node_32636 = 3664673537, 3664678549
        G = self.open_street_map_object.G
        # Shortest path by length (in meters)
        route_nodes = nx.shortest_path(G, orig_node_32636, dest_node_32636, weight='length')
        route_length = nx.shortest_path_length(G, orig_node_32636, dest_node_32636, weight='length')
        print("Route node IDs:", route_nodes)
        print(f"Route distance: {route_length:.2f} meters")

        # ----------------------------
        # 4) FOLIUM PLOT
        # ----------------------------
        # If we want to visualize in Folium, we must use the unprojected graph (in lat-lng, EPSG:4326).
        # So let's "unproject" (revert) or simply re-download the route in WGS84.
        # In practice, it's simpler to do the shortest-path in EPSG:32636
        # but *plot* it using the original G with lat/lng coords.

        # We can map the route_nodes (which are from G_32636) to the equivalent in G:
        # Easiest way: let OSMnx handle a "solution" using the original G for the folium route.
        # We'll demonstrate how to do that simply:
        route_map = self.open_street_map_object.plot_route_folium(route_nodes)
        #route_map.save("bgu_route.html")
        print("Folium map saved to bgu_route.html")

        # ----------------------------
        # 5) (OPTIONAL) MATPLOTLIB PLOT
        # ----------------------------
        # Convert projected graph to GeoDataFrames
        nodes_gdf, edges_gdf = self.open_street_map_object.graph_to_gdfs()

        # Plot
        fig, ax = plt.subplots(figsize=(10,10))

        # a) Buildings
        self.open_street_map_object.buildings_gdf.plot(ax=ax, color='lightgray', alpha=0.7, edgecolor='none', label='Buildings')

        # b) Edges
        edges_gdf.plot(ax=ax, color='black', linewidth=1, alpha=0.8, label='Roads')

        # c) Nodes (optional)
        nodes_gdf.plot(ax=ax, color='red', markersize=5, label='Nodes')

        # d) Highlight the route
        #   We'll subset edges_gdf to only those edges in the route
        #   (But note in a MultiDiGraph, route edges are pairs of consecutive route_nodes)
        route_edges = list(zip(route_nodes[:-1], route_nodes[1:]))
        route_edges_set = set(route_edges)  # for quick membership check
        def is_route_edge(row):
            u, v, k = row.name
            return (u,v) in route_edges_set or (v,u) in route_edges_set

        # We'll create a mask for edges that are in the route
        edges_gdf['is_route'] = edges_gdf.apply(is_route_edge, axis=1)
        edges_on_route = edges_gdf[edges_gdf['is_route'] == True]
        edges_on_route.plot(ax=ax, color='blue', linewidth=3, label='Route')

        # e) Add some legend / title
        ax.set_title("Ben-Gurion University Shortest Path (EPSG:32636)", fontsize=14)
        ax.legend()

        # Set limits to focus on the area of interest
        ax.set_xlim([671000, 672000])
        ax.set_ylim([3.45975e6, 3.46050e6])

        plt.show()

    def shortest_path_with_different_weights(self, dest, original):
        """
        Compute and plot shortest paths based on four different weights, all in one plot with distinct colors.
        """
        # Find nearest nodes in the graph
        orig_node_32636, dest_node_32636 = self.open_street_map_object.find_nodes_in_G(dest, original)
        orig_node_32636, dest_node_32636 = 3664673537, 3664678549
        G = self.open_street_map_object.G
        orig_coord = (G.nodes[orig_node_32636]['y'], G.nodes[orig_node_32636]['x'])
        dest_coord = (G.nodes[dest_node_32636]['y'], G.nodes[dest_node_32636]['x'])

        # Define a transformer from EPSG:32636 (UTM) to EPSG:4326 (Lat/Lon)
        transformer = Transformer.from_crs("EPSG:32636", "EPSG:4326", always_xy=True)

        # Convert coordinates
        orig_lon, orig_lat = transformer.transform(G.nodes[orig_node_32636]['x'], G.nodes[orig_node_32636]['y'])
        dest_lon, dest_lat = transformer.transform(G.nodes[dest_node_32636]['x'], G.nodes[dest_node_32636]['y'])

        print(f"Converted Origin Coordinates: ({orig_lat}, {orig_lon})")
        print(f"Converted Destination Coordinates: ({dest_lat}, {dest_lon})")

        # Define weight names and corresponding colors
        cost_names = [f"cost_{i}" for i in range(1, 5)]
        colors = ['blue', 'green', 'red', 'orange']  # Unique colors for each route

        # Initialize the Matplotlib plot
        fig, ax = plt.subplots(figsize=(10, 10))

        # Plot buildings and roads
        self.open_street_map_object.buildings_gdf.plot(
            ax=ax, color='lightgray', alpha=0.7, edgecolor='none', label='Buildings'
        )
        edges_gdf = self.open_street_map_object.graph_to_gdfs()[1]
        edges_gdf.plot(ax=ax, color='black', linewidth=1, alpha=0.8, label='Roads')

        # Loop through weights to calculate and plot each route
        for cost_names, color in zip(cost_names, colors):
            # Calculate the shortest path for the current weight
            route_nodes = nx.shortest_path(G, orig_node_32636, dest_node_32636, weight=cost_names)
            route_length = nx.shortest_path_length(G, orig_node_32636, dest_node_32636, weight=cost_names)
            # Print route information
            print(f"Weight: {cost_names}")
            print(f"Route node IDs: {route_nodes}")

            # Highlight the route
            route_edges = list(zip(route_nodes[:-1], route_nodes[1:]))
            route_edges_gdf = edges_gdf.loc[
                edges_gdf.index.map(lambda edge: (edge[0], edge[1]) in route_edges or (edge[1], edge[0]) in route_edges)
            ]
            filtered_edges = edges_gdf[edges_gdf.index.map(lambda edge: (edge[0], edge[1]) in route_edges or (edge[1], edge[0]) in route_edges)]
            edges_lnegth = filtered_edges['length'].tolist()
            edge_lengths = sum(list(set(edges_lnegth)))
            print(f"Route length: {edge_lengths}")
            route_edges_gdf.plot(
                ax=ax,
                color=color,
                linewidth=3,
                label=f"Route ({cost_names})"
            )

        # Add title and legend for the combined plot
        ax.set_title("Shortest Paths with Different Weights", fontsize=14)
        #ax.legend()
        ax.set_xlim([671000,672000])
        ax.set_ylim([3.45975e6, 3.46050e6])
        plt.show()

        # Save all routes as interactive Folium maps
        for weight_name, color in zip(cost_names, colors):
            route_nodes = nx.shortest_path(G, orig_node_32636, dest_node_32636, weight=cost_names)
            route_map = self.open_street_map_object.plot_route_folium(route_nodes, weight=5, color=color)
            route_map.save(f"route_{cost_names}.html")
            print(f"Folium map saved to route_{cost_names}.html")



