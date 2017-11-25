from .example_package import hooks, initialize, __version__, __author__

# NOTE: If you want to make this an application instead of just a plugin you'll
# want to use something like the code below:
#apps = []
#from .example_package import ExampleApplication
    #apps.append(ExampleApplication)

# When loading application packages Gate One looks for (and loads)
# <your app>.apps objects.
