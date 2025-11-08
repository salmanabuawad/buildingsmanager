# Buildings Manager

A modern web application for managing buildings and apartments, built with React, TypeScript, Vite frontend and Python FastAPI backend with PostgreSQL database and GraphQL API.

## Features

- 📊 Interactive data grid for buildings and apartments management
- 🌐 Bilingual support (English/Hebrew)
- 📄 PDF viewer for apartment floor plans
- 📱 Responsive design with Tailwind CSS
- 🐍 Python FastAPI backend
- 🗄️ PostgreSQL database
- 🔷 GraphQL API with Strawberry

## Architecture

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + GraphQL Client
- **Backend**: Python FastAPI + Strawberry GraphQL
- **Database**: PostgreSQL
- **Data Grid**: AG Grid

## Prerequisites

Before running this project locally, ensure you have:

- **Node.js** (v18 or higher)
- **npm** (v9 or higher)
- **Python** (v3.9 or higher)
- **PostgreSQL** (v12 or higher)

## Local Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd project
```

### 2. Database Setup

Create a PostgreSQL database:

```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE buildings_db;

# Exit psql
\q
```

Run the migration files to set up the schema:

```bash
# Run each migration file in supabase/migrations/ in order
psql -U postgres -d buildings_db -f supabase/migrations/20251108075335_add_dwg_file_to_apartments.sql
# Continue with other migration files...
```

Or manually execute the SQL from the migration files in your PostgreSQL client.

### 3. Backend Setup

Install Python dependencies:

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/buildings_db
FRONTEND_URL=http://localhost:5173
```

Replace `postgres:password` with your PostgreSQL username and password.

Start the backend server:

```bash
python main.py
```

The API will be available at `http://localhost:8000`

You can access:
- GraphQL Playground: `http://localhost:8000/graphql`
- API Root: `http://localhost:8000/`

### 4. Frontend Setup

Install frontend dependencies:

```bash
cd ..  # Back to project root
npm install
```

Create a `.env` file in the root directory:

```env
VITE_API_URL=http://localhost:8000
```

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### 5. Build for Production

Build the frontend:

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Project Structure

```
project/
├── backend/                # Python FastAPI backend
│   ├── main.py            # FastAPI application
│   ├── database.py        # Database connection
│   ├── models.py          # Pydantic models
│   ├── requirements.txt   # Python dependencies
│   └── .env.example       # Environment variables template
├── src/                   # React frontend
│   ├── components/        # React components
│   │   ├── AdminPDFManager.tsx
│   │   ├── ApartmentDetails.tsx
│   │   ├── ApartmentsList.tsx
│   │   ├── BuildingsList.tsx
│   │   ├── LanguageSwitcher.tsx
│   │   └── PDFViewer.tsx
│   ├── i18n/             # Internationalization
│   │   ├── i18n.ts
│   │   └── translations.ts
│   ├── lib/              # Utilities and configurations
│   │   └── api.ts        # API client
│   ├── App.tsx           # Main application component
│   ├── main.tsx          # Application entry point
│   └── index.css         # Global styles
├── supabase/
│   └── migrations/       # Database migration files
├── public/               # Static assets
└── package.json          # Project dependencies
```

## GraphQL API

The application uses GraphQL for data fetching and mutations. Access the GraphQL Playground at `http://localhost:8000/graphql` to explore the schema and test queries.

### Queries

```graphql
# Get all buildings
query {
  buildings {
    id
    name
    totalUnits
    apartmentArea
    totalBuildingArea
  }
}

# Get a specific building
query {
  building(id: "building-id") {
    id
    name
    totalUnits
  }
}

# Get apartments (optionally filtered by building)
query {
  apartments(buildingId: "building-id") {
    id
    apartmentNumber
    apartmentArea
    totalApartmentArea
  }
}

# Get a specific apartment
query {
  apartment(id: "apartment-id") {
    id
    apartmentNumber
    apartmentArea
  }
}
```

### Mutations

```graphql
# Update an apartment
mutation {
  updateApartment(
    id: "apartment-id"
    input: {
      apartmentArea: 100.5
      storageArea: 10.0
    }
  ) {
    id
    apartmentArea
    storageArea
  }
}

# Create a building
mutation {
  createBuilding(input: {
    name: "Building A"
    totalUnits: 10
    apartmentArea: 1000.0
    storageArea: 100.0
    pergolaArea: 50.0
    balconyArea: 200.0
    totalBuildingArea: 1350.0
  }) {
    id
    name
  }
}

# Delete a building
mutation {
  deleteBuilding(id: "building-id") {
    success
    message
  }
}
```

## Available Scripts

### Frontend

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

### Backend

- `python main.py` - Start FastAPI server
- `uvicorn main:app --reload` - Start with auto-reload

## Database Schema

### Buildings Table
- `id` (UUID, Primary Key)
- `name` (Text)
- `total_units` (Integer)
- `apartment_area` (Numeric)
- `storage_area` (Numeric)
- `pergola_area` (Numeric)
- `balcony_area` (Numeric)
- `total_building_area` (Numeric)
- `created_at` (Timestamp)

### Apartments Table
- `id` (UUID, Primary Key)
- `building_id` (UUID, Foreign Key)
- `apartment_number` (Text)
- `floor` (Integer)
- `apartment_area` (Numeric)
- `storage_area` (Numeric)
- `pergola_area` (Numeric)
- `balcony_area` (Numeric)
- `garden_area` (Numeric)
- `total_apartment_area` (Numeric)
- `pdf_file_url` (Text)
- `dwg_file_url` (Text)
- `created_at` (Timestamp)

## Technologies Used

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **AG Grid** - Data grid component
- **i18next** - Internationalization
- **React PDF** - PDF viewing
- **Lucide React** - Icons
- **graphql-request** - GraphQL client

### Backend
- **FastAPI** - Python web framework
- **Strawberry GraphQL** - GraphQL library for Python
- **PostgreSQL** - Database
- **psycopg2** - PostgreSQL adapter
- **Pydantic** - Data validation
- **Uvicorn** - ASGI server

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running: `pg_isready`
- Check your `.env` file has correct database credentials
- Ensure the database exists: `psql -U postgres -l`

### Backend Errors
- Check Python version: `python --version` (should be 3.9+)
- Verify all dependencies are installed: `pip list`
- Check the backend logs for detailed error messages

### Frontend Build Errors
- Clear `node_modules` and reinstall: `rm -rf node_modules package-lock.json && npm install`
- Check Node.js version: `node --version`
- Run type checking: `npm run typecheck`

### CORS Issues
- Ensure the backend CORS middleware includes your frontend URL
- Check that `FRONTEND_URL` in backend `.env` matches your frontend URL

## Production Deployment

### Backend Deployment

1. Set environment variables on your hosting platform
2. Install dependencies: `pip install -r requirements.txt`
3. Run with production ASGI server: `uvicorn main:app --host 0.0.0.0 --port 8000`

### Frontend Deployment

1. Update `VITE_API_URL` in `.env` to your production API URL
2. Build: `npm run build`
3. Deploy the `dist/` directory to your static hosting service

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

This project is licensed under the MIT License.
