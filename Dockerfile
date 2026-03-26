FROM node:22-slim

# Install system dependencies for Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Dashboard dependencies ──────────────────────────────────────────
COPY package.json package-lock.json* ./
RUN npm install --production

# ── E2E project ─────────────────────────────────────────────────────
COPY e2e/ ./e2e/
WORKDIR /app/e2e
RUN npm install --include=dev
RUN npx playwright install chromium
WORKDIR /app

# ── Dashboard source ────────────────────────────────────────────────
COPY server.js ./
COPY public/ ./public/
COPY scripts/ ./scripts/
RUN chmod +x scripts/run-tests.sh

# ── Data directory (will be volume-mounted for persistence) ─────────
RUN mkdir -p data/reports

EXPOSE 3000
CMD ["node", "server.js"]
