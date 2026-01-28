#!/usr/bin/with-contenv bashio

# Export configuration as environment variables
export POSTGRES_HOST=$(bashio::config 'postgres_host')
export POSTGRES_PORT=$(bashio::config 'postgres_port')
export POSTGRES_DB=$(bashio::config 'postgres_db')
export POSTGRES_USER=$(bashio::config 'postgres_user')
export POSTGRES_PASSWORD=$(bashio::config 'postgres_password')

bashio::log.info "Starting Family Household Manager..."
bashio::log.info "Connecting to PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}"

cd /app
exec npm start
