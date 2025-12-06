#!/bin/bash

# Test Runner Script for Buildings Manager
# This script sets up the test environment and runs the regression tests

set -e

echo "🏗️  Buildings Manager Test Suite"
echo "=================================="
echo ""

# Check if .env.test exists
if [ ! -f .env.test ]; then
    echo "⚠️  Warning: .env.test not found"
    echo "Creating .env.test from template..."
    cat > .env.test << EOF
# Test Database Configuration
# For local PostgreSQL:
TEST_DB_URL=postgresql://postgres:postgres@localhost:5432/buildings_manager_test

# OR for Supabase (uncomment and fill):
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key
EOF
    echo "✅ Created .env.test - please configure it with your database credentials"
    echo ""
fi

# Load environment variables
if [ -f .env.test ]; then
    export $(cat .env.test | grep -v '^#' | xargs)
fi

# Check if test database exists (for local PostgreSQL)
if [ -n "$TEST_DB_URL" ] && [[ "$TEST_DB_URL" == postgresql://* ]]; then
    DB_NAME=$(echo $TEST_DB_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
    echo "📊 Checking test database: $DB_NAME"
    
    # Try to connect to test database
    if psql "$TEST_DB_URL" -c "SELECT 1" > /dev/null 2>&1; then
        echo "✅ Test database connection successful"
    else
        echo "❌ Cannot connect to test database"
        echo "Please ensure:"
        echo "  1. PostgreSQL is running"
        echo "  2. Database '$DB_NAME' exists"
        echo "  3. Connection string in .env.test is correct"
        exit 1
    fi
fi

echo ""
echo "🧪 Running regression tests..."
echo ""

# Run tests
npm run test:run

echo ""
echo "✅ Tests completed!"

