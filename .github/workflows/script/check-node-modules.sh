#!/bin/bash
set -eu

# Sanity check that repo is clean to start with
if [ ! -z "$(git status --porcelain)" ]; then
    # If we get a fail here then this workflow needs attention...
    >&2 echo "Failed: Repo should be clean before testing!"
    exit 1
fi
# Reinstall modules and then clean to remove absolute paths
# Use 'npm ci' instead of 'npm install' as this is intended to be reproducible
npm ci
npm run removeNPMAbsolutePaths
# Check that repo is still clean
if [ ! -z "$(git status --porcelain)" ]; then
    # If we get a fail here then the PR needs attention
    >&2 echo "Failed: node_modules are not up to date. Run 'npm ci && npm run removeNPMAbsolutePaths'."
    git status
    exit 1
fi
echo "Success: node_modules are up to date"