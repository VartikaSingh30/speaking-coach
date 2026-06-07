#!/bin/bash

# Echo - Live Speaking Coach Startup Script

echo "🎤 Echo - Live Speaking Coach"
echo "=============================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ to continue."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)

if [ $MAJOR_VERSION -lt 18 ]; then
    echo "❌ Node.js version 18+ required. Current version: v$NODE_VERSION"
    exit 1
fi

echo "✅ Node.js v$NODE_VERSION detected"
echo ""

# Build core package first
echo "🔨 Building core package..."
cd packages/core
npm run build
cd ../..

# Check if env files exist
if [ ! -f "apps/api/.env" ]; then
    echo "📋 Setting up API environment file..."
    cp apps/api/.env.example apps/api/.env
fi

if [ ! -f "apps/web/.env.local" ]; then
    echo "📋 Setting up web environment file..."
    cp apps/web/.env.example apps/web/.env.local
fi

echo ""
echo "🚀 Starting development servers..."
echo ""
echo "The application will be available at:"
echo "  Frontend: http://localhost:3000"
echo "  API:      http://localhost:8787"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Start all development servers
npm run dev