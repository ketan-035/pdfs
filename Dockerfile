
# Use Node.js 20 as the base image (includes npm/node)
FROM node:20-bullseye

# Install Python 3.11 and pip, LibreOffice, and tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libreoffice \
    fontconfig \
    wget \
    cabextract \
    && rm -rf /var/lib/apt/lists/*

# Force install Microsoft Core Fonts (Arial, Times New Roman, Courier New, Comic Sans, etc.) to prevent text displacement
RUN echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
    && apt-get update \
    && apt-get install -y ttf-mscorefonts-installer \
    && fc-cache -f -v \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# ---------------------------------------------------------------------
# Backend Setup
# ---------------------------------------------------------------------

# Copy requirements separately to leverage Docker cache
COPY backend/requirements.txt ./backend/requirements.txt

# Create venv and install dependencies
RUN python3 -m venv /app/backend/venv
RUN /app/backend/venv/bin/pip install --no-cache-dir --upgrade pip
RUN /app/backend/venv/bin/pip install --no-cache-dir -r ./backend/requirements.txt

# Copy the rest of the backend code
COPY backend ./backend

# ---------------------------------------------------------------------
# Frontend Setup
# ---------------------------------------------------------------------

# Copy package files
COPY frontend/package.json frontend/package-lock.json ./frontend/

WORKDIR /app/frontend

# Install dependencies (clean install)
RUN npm ci

# Copy the rest of the frontend code
COPY frontend .

# Generate Prisma Client
# We use a dummy URL because we only need the generated types/client code at build time. 
# The actual connection string is provided at runtime.
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# Build the Next.js application
RUN npm run build

# ---------------------------------------------------------------------
# Runtime Config
# ---------------------------------------------------------------------

WORKDIR /app

# Expose port 7860 for Hugging Face Spaces
EXPOSE 7860

# Copy the startup script
COPY start.sh .
RUN chmod +x start.sh

# Define environment variables
ENV NODE_ENV=production
# Force Next.js to listen on 7860
ENV PORT=7860 
ENV HOSTNAME="0.0.0.0"

# Main command
CMD ["./start.sh"]
