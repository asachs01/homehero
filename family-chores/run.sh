#!/bin/bash

echo "[INFO] Starting HomeHero..."
echo "[INFO] Using SQLite database at /data/homehero.db"

cd /app
exec npm start
