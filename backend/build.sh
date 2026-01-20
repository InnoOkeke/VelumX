#!/bin/bash
# Render deployment build script
cd "$(dirname "$0")"
npm install
npm run build
