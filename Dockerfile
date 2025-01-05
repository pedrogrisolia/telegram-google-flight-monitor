FROM node:20-slim

# Install Chrome dependencies, Chromium, SQLite, and locales
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    sqlite3 \
    locales \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i '/pt_BR.UTF-8/s/^# //g' /etc/locale.gen \
    && locale-gen

# Set locale
ENV LANG pt_BR.UTF-8
ENV LANGUAGE pt_BR:pt
ENV LC_ALL pt_BR.UTF-8

# Create app directory
WORKDIR /app

# Create data directory for SQLite
RUN mkdir -p data

# Copy package files
COPY package*.json ./

# Install dependencies with increased timeout
RUN npm install --network-timeout=100000

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose the port
EXPOSE 3000

# Set environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV DB_PATH=/app/data/flights.db

# Start the bot
CMD ["npm", "start"] 