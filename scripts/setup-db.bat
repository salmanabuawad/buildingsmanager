@echo off
REM Buildings Manager - Local Database Setup Script for Windows
REM This script automates the local PostgreSQL database setup

setlocal enabledelayedexpansion

echo ==========================================
echo Buildings Manager - Database Setup
echo ==========================================
echo.

REM Configuration
set DB_NAME=buildings_manager
set DB_USER=postgres
set DB_HOST=localhost
set DB_PORT=5432

REM Check if psql is available
where psql >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: PostgreSQL is not installed or not in PATH
    echo Please install PostgreSQL from https://www.postgresql.org/download/windows/
    echo Make sure to add PostgreSQL bin directory to your PATH
    pause
    exit /b 1
)

echo [OK] PostgreSQL is installed

REM Check if PostgreSQL is running
pg_isready -h %DB_HOST% -p %DB_PORT% >nul 2>&1
if %errorlevel% neq 0 (
    echo Warning: PostgreSQL service may not be running
    echo Starting PostgreSQL service...
    net start postgresql-x64-15 >nul 2>&1
    if %errorlevel% neq 0 (
        net start postgresql >nul 2>&1
        if %errorlevel% neq 0 (
            echo Error: Could not start PostgreSQL service
            echo Please start PostgreSQL service manually from Services
            pause
            exit /b 1
        )
    )
    timeout /t 2 >nul
)

echo [OK] PostgreSQL is running

REM Prompt for password
set /p DB_PASSWORD="Enter PostgreSQL password for user '%DB_USER%': "

REM Set password for psql
set PGPASSWORD=%DB_PASSWORD%

REM Test connection
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -c "SELECT 1" postgres >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Cannot connect to PostgreSQL
    echo Please check your password and PostgreSQL configuration
    pause
    exit /b 1
)

echo [OK] Connected to PostgreSQL

REM Check if database exists
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -lqt postgres | findstr /C:"%DB_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo Warning: Database '%DB_NAME%' already exists
    set /p DROP_DB="Do you want to drop and recreate it? (y/N): "
    if /i "!DROP_DB!"=="y" (
        echo Dropping existing database...
        psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -c "DROP DATABASE %DB_NAME%;" postgres
        echo Creating database...
        psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -c "CREATE DATABASE %DB_NAME%;" postgres
        echo [OK] Database recreated
    ) else (
        echo Keeping existing database
    )
) else (
    echo Creating database '%DB_NAME%'...
    psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -c "CREATE DATABASE %DB_NAME%;" postgres
    echo [OK] Database created
)

REM Run setup script
echo Running database setup script...
if exist "setup-local-db.sql" (
    psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f setup-local-db.sql
    echo [OK] Database schema created
) else (
    echo Error: setup-local-db.sql not found
    pause
    exit /b 1
)

REM Create .env file if it doesn't exist
if not exist ".env" (
    echo Creating .env file...
    (
        echo # Local Development Environment Variables
        echo VITE_USE_LOCAL_DB=true
        echo VITE_LOCAL_DB_URL=postgresql://%DB_USER%:%DB_PASSWORD%@%DB_HOST%:%DB_PORT%/%DB_NAME%
        echo VITE_API_URL=http://localhost:8000
        echo VITE_SUPABASE_URL=
        echo VITE_SUPABASE_ANON_KEY=
    ) > .env
    echo [OK] .env file created
) else (
    echo Warning: .env file already exists ^(not overwriting^)
)

REM Clear password
set PGPASSWORD=

echo.
echo ==========================================
echo [OK] Setup completed successfully!
echo ==========================================
echo.
echo Next steps:
echo   1. Review and update .env file if needed
echo   2. Install dependencies: npm install
echo   3. Start the application: npm run dev
echo.
echo Optional: Install and run PostgREST for full compatibility
echo   See LOCAL_SETUP.md for details
echo.

pause
