@echo off
REM Test Runner Script for Buildings Manager (Windows)
REM This script sets up the test environment and runs the regression tests

echo 🏗️  Buildings Manager Test Suite
echo ==================================
echo.

REM Check if .env.test exists
if not exist .env.test (
    echo ⚠️  Warning: .env.test not found
    echo Creating .env.test from template...
    (
        echo # Test Database Configuration
        echo # For local PostgreSQL:
        echo TEST_DB_URL=postgresql://postgres:postgres@localhost:5432/buildings_manager_test
        echo.
        echo # OR for Supabase (uncomment and fill):
        echo # VITE_SUPABASE_URL=https://your-project.supabase.co
        echo # VITE_SUPABASE_ANON_KEY=your-anon-key
    ) > .env.test
    echo ✅ Created .env.test - please configure it with your database credentials
    echo.
)

echo 🧪 Running regression tests...
echo.

REM Run tests
call npm run test:run

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Tests completed successfully!
) else (
    echo.
    echo ❌ Tests failed with error code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

