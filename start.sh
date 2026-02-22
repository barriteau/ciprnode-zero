#!/bin/bash
# Ciprnode Unix Start Script

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

if [ -f "dist/ciprnode" ]; then
    echo "Starting Ciprnode from dist..."
    ./dist/ciprnode
elif [ -f "./ciprnode" ]; then
    echo "Starting Ciprnode..."
    ./ciprnode
else
    echo "Ciprnode executable not found! Please run 'deno task build' first."
    exit 1
fi
