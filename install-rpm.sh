python setup.py install --root=$RPM_BUILD_ROOT --record=INSTALLED_FILES
sed -i -e 's/^.*$/"&"/g' INSTALLED_FILES
