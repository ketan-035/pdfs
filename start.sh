#!/bin/bash
set -e

echo "----------------------------------------"
echo "Starting Full Stack Application"
echo "----------------------------------------"

# 1. Start Backend in Background
echo "Starting FastAPI Backend on port 8000..."
# Use the virtual environment Python to run uvicorn
./backend/venv/bin/uvicorn app:app --app-dir ./backend --host 0.0.0.0 --port 8000 &

# 2. Start Frontend
echo "Starting Next.js Frontend on port 7860..."
cd ./frontend

# Optional: Ensure DB schema is up to date (useful for first run in new environment)
if [ -n "$DATABASE_URL" ]; then
    echo "Running Prisma DB Push..."
    npx prisma db push --accept-data-loss || echo "Prisma DB Push failed (check DB connection)"
fi

# Next.js start
npm start
