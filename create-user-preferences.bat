@echo off
REM Script to create user_preferences table and restart PostgREST
REM Make sure PostgreSQL is running and PostgREST is stopped before running this

echo ==========================================
echo Creating user_preferences table
echo ==========================================
echo.

REM Check if psql is available
where psql >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: psql is not in your PATH
    echo Please add PostgreSQL bin directory to your PATH
    echo Or run the SQL manually from create_user_preferences_table.sql
    pause
    exit /b 1
)

echo Running SQL to create user_preferences table...
echo You will be prompted for your PostgreSQL password.
echo.

psql -U postgres -d buildings_manager -f create_user_preferences_table.sql

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ==========================================
    echo Table created successfully!
    echo ==========================================
    echo.
    echo IMPORTANT: Restart PostgREST to refresh schema cache
    echo If PostgREST is running, stop it (Ctrl+C) and restart:
    echo   postgrest postgrest.conf
    echo.
) else (
    echo.
    echo ==========================================
    echo ERROR: Failed to create table
    echo ==========================================
    echo.
    echo Please check:
    echo 1. PostgreSQL is running
    echo 2. Database 'buildings_manager' exists
    echo 3. Your password is correct
    echo.
    echo You can also run the SQL manually:
    echo   psql -U postgres -d buildings_manager
    echo   Then copy/paste the contents of create_user_preferences_table.sql
    echo.
)

pause

