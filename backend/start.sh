#!/bin/bash
# Render deployment start script
cd "$(dirname "$0")"
node dist/backend/src/index.js
