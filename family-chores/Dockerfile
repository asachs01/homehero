ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install Node.js 20, bash for bashio, and build dependencies for better-sqlite3
RUN apk add --no-cache \
    nodejs=~20 \
    npm \
    bash \
    python3 \
    make \
    g++ \
    sqlite

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (better-sqlite3 requires native compilation)
RUN npm ci --only=production

# Copy source files
COPY src/ ./src/

# Copy run script
COPY run.sh /

# Make run script executable
RUN chmod a+x /run.sh

# Don't set ENTRYPOINT - the Home Assistant base image uses s6-overlay
# which will automatically run /run.sh as the service script
