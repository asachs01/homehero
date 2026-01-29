#!/usr/bin/with-contenv bashio

bashio::log.info "Starting Family Household Manager..."
bashio::log.info "Using SQLite database at /data/family-chores.db"

cd /app
exec npm start
