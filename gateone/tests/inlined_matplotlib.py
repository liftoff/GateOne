#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
import matplotlib
matplotlib.use('Agg')
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure
import pylab

fig = Figure()
canvas = FigureCanvasAgg(fig)
ax = fig.add_subplot(111)
x = pylab.randn(1000)
ax.hist(x, 100)
ax.set_title('Gate One Inline Matplotlib Test')
canvas.print_figure(sys.stdout)
