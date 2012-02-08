#!/usr/bin/env python
# -*- coding: utf-8 -*-

import pydot
graph = pydot.Dot(graph_type='digraph', bgcolor="transparent")
gateone = pydot.Node("Gate One", style="filled", fillcolor="white")
awesome = pydot.Node("Awesome", style="filled", fillcolor="white")
unicode_smiley = pydot.Node("♥◡♥", style="filled", fillcolor="white", fontcolor="red")
graph.add_node(gateone)
graph.add_node(awesome)
graph.add_node(unicode_smiley)
graph.add_edge(pydot.Edge(gateone, awesome, label='is', fontcolor='#D80003', fontname='Ubuntu', color='red'))
graph.add_edge(pydot.Edge(gateone, unicode_smiley, label='is', fontcolor='#D80003', fontname='Ubuntu', color='red'))
print(graph.create_png('png'))
# This works too if your platform has /proc:
# graph.write_png('/proc/self/fd/0') # Write to stdout