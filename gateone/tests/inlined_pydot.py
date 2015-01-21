#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
An example of using pydot to print out a PNG file to stdout using Python.

NOTE:  It should display a diagram of Gate One's architecture.
"""

import pydot
graph = pydot.Dot(graph_type='digraph', bgcolor="transparent", rankdir='TB')
cluster1 = pydot.Cluster('standalone', label='Single Gate One Server', style="filled", fillcolor="#304568", fontcolor="white")
cluster2 = pydot.Cluster('perserver', label='Alternate: Gate One On Each Host', style="filled", fillcolor="#304568", fontcolor="white")
gateone = pydot.Node("Gate One", style="filled", fillcolor="#222222", fontcolor="white")
server1 = pydot.Node("Server1", style="filled", fillcolor="white", shape='rectangle')
server2 = pydot.Node("Server2", style="filled", fillcolor="white", shape='rectangle')
serverX = pydot.Node("ServerX", style="filled", fillcolor="white", shape='rectangle')
browsers = pydot.Node("Web Browser", style="filled", fillcolor="#F4FFCC", fontcolor="black")
cluster1.add_node(gateone)
cluster1.add_node(server1)
cluster1.add_node(server2)
cluster1.add_node(serverX)
cluster1.add_node(browsers)
graph.add_subgraph(cluster1)
graph.add_edge(pydot.Edge(gateone, server1, label='SSH', fontcolor='green', fontname='Ubuntu', color='green'))
graph.add_edge(pydot.Edge(gateone, server2, label='SSH', fontcolor='green', fontname='Ubuntu', color='green'))
graph.add_edge(pydot.Edge(gateone, serverX, label='Telnet', fontcolor='red', fontname='Ubuntu', color='red'))
graph.add_edge(pydot.Edge(gateone, browsers, label='HTTPS', fontcolor='#76ABFF', fontname='Ubuntu', color='#76ABFF'))
graph.add_edge(pydot.Edge(browsers, gateone, color='#76ABFF'))
gateone1 = pydot.Node("Gate One on Server1\n/bin/login", style="filled", fillcolor="#999999", fontcolor="black", shape='rectangle')
gateone2 = pydot.Node("Gate One on Server2\n/usr/bin/custom.sh", style="filled", fillcolor="#999999", fontcolor="black", shape='rectangle')
gateone3 = pydot.Node("Gate One on ServerX\n/opt/legacy/app", style="filled", fillcolor="#999999", fontcolor="black", shape='rectangle')
cluster2.add_node(gateone1)
cluster2.add_node(gateone2)
cluster2.add_node(gateone3)
graph.add_subgraph(cluster2)
graph.add_edge(pydot.Edge(gateone1, browsers, label='HTTPS', fontcolor='#76ABFF', fontname='Ubuntu', color='#76ABFF'))
graph.add_edge(pydot.Edge(browsers, gateone1, color='#76ABFF'))
graph.add_edge(pydot.Edge(gateone2, browsers, label='HTTPS', fontcolor='#76ABFF', fontname='Ubuntu', color='#76ABFF'))
graph.add_edge(pydot.Edge(browsers, gateone2, color='#76ABFF'))
graph.add_edge(pydot.Edge(gateone3, browsers, label='HTTPS', fontcolor='#76ABFF', fontname='Ubuntu', color='#76ABFF'))
graph.add_edge(pydot.Edge(browsers, gateone3, color='#76ABFF'))

print(graph.create_png('png'))
# This works too if your platform has /proc:
# graph.write_png('/proc/self/fd/0') # Write to stdout