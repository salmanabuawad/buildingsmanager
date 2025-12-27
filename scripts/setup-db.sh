#!/bin/bash

# Buildings Manager - Local Database Setup Script
# This script automates the local PostgreSQL database setup

set -e

echo "=========================================="
echo "Buildings Manager - Database Setup"
echo "=========================================="
echo ""

# Configuration
DB_NAME="buildings_manager"
DB_USER="postgres"
DB_HOST="localhost"
DB_PORT="5432"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: PostgreSQL is not installed${NC}"
    echo "Please install PostgreSQL first:"
    echo "  - Mac: brew install postgresql@15"
    echo "  - Linux: sudo apt-get install postgresql postgresql-contrib"
    echo "  - Windows: Download from https://www.postgresql.org/download/windows/"
    exit 1
fi

echo -e "${GREEN}✓ PostgreSQL is installed${NC}"

# Check if PostgreSQL is running
if ! pg_isready -h $DB_HOST -p $DB_PORT &> /dev/null; then
    echo -e "${YELLOW}⚠ PostgreSQL is not running${NC}"
    echo "Attempting to start PostgreSQL..."

    # Try to start PostgreSQL based on OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # Mac
        brew services start postgresql@15 || brew services start postgresql
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        sudo systemctl start postgresql
    else
        echo -e "${RED}Please start PostgreSQL manually${NC}"
        exit 1
    fi

    sleep 2

    if ! pg_isready -h $DB_HOST -p $DB_PORT &> /dev/null; then
        echo -e "${RED}Failed to start PostgreSQL${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ PostgreSQL is running${NC}"

# Prompt for password
read -sp "Enter PostgreSQL password for user '$DB_USER': " DB_PASSWORD
echo ""

# Test connection
export PGPASSWORD=$DB_PASSWORD
if ! psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "SELECT 1" postgres &> /dev/null; then
    echo -e "${RED}Error: Cannot connect to PostgreSQL${NC}"
    echo "Please check your password and PostgreSQL configuration"
    exit 1
fi

echo -e "${GREEN}✓ Connected to PostgreSQL${NC}"

# Check if database exists
if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo -e "${YELLOW}⚠ Database '$DB_NAME' already exists${NC}"
    read -p "Do you want to drop and recreate it? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Dropping existing database..."
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "DROP DATABASE $DB_NAME;" postgres
        echo "Creating database..."
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME;" postgres
        echo -e "${GREEN}✓ Database recreated${NC}"
    else
        echo "Keeping existing database"
    fi
else
    echo "Creating database '$DB_NAME'..."
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME;" postgres
    echo -e "${GREEN}✓ Database created${NC}"
fi

# Run setup script
echo "Running database setup script..."
if [ -f "install_fresh_database.sql" ]; then
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f install_fresh_database.sql
    echo -e "${GREEN}✓ Database schema created${NC}"
elif [ -f "setup-local-db.sql" ]; then
    echo -e "${YELLOW}⚠ Using legacy setup-local-db.sql (consider migrating to install_fresh_database.sql)${NC}"
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f setup-local-db.sql
    echo -e "${GREEN}✓ Database schema created${NC}"
else
    echo -e "${RED}Error: install_fresh_database.sql or setup-local-db.sql not found${NC}"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << EOF
# Local Development Environment Variables
VITE_USE_LOCAL_DB=true
VITE_LOCAL_DB_URL=postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
EOF
    echo -e "${GREEN}✓ .env file created${NC}"
else
    echo -e "${YELLOW}⚠ .env file already exists (not overwriting)${NC}"
fi

# Unset password
unset PGPASSWORD

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Setup completed successfully!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Review and update .env file if needed"
echo "  2. Install dependencies: npm install"
echo "  3. Start the application: npm run dev"
echo ""
echo "Optional: Install and run PostgREST for full compatibility"
echo "  See LOCAL_SETUP.md for details"
echo ""
