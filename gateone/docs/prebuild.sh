#!/bin/bash
#
# Description:
#   Adds each application's documentation to the Applications/index.rst

# Setup some globals
APP_RST=`readlink -f source/Applications/index.rst`
APPLICATIONS=`ls ../applications`

# Replace source/Applications/index.rst with a modified one that includes all
# our applications' docs/index.rst files

# Remove any existing symbolic links to applications in the Applications dir
find ./source/Applications -lname '*' -exec rm -f {} \;

# Get rid of everything after the first 8 lines:
sed -i '1,8!d' ${APP_RST}
echo "" >> ${APP_RST} # Newline to keep things readable

# Now add the index.rst for all application docs directories (if they exist):
cd source/Applications # Need to be here to make the symbolic links
for app in ${APPLICATIONS}; do
    if [ -f "../../../applications/${app}/docs/index.rst" ]; then
        echo "Adding ${app} to the Applications/index.rst"
        # Make a symbolic link since Sphinx only allows rst in the source dir
        ln -s ../../../applications/${app}/docs ${app}
        echo "    ${app}/index.rst" >> ${APP_RST}
    fi
done

# Now the build can continue...
