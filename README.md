# Buildings Manager

A modern web application for managing buildings and apartments, built with React, TypeScript, Vite frontend and Python FastAPI backend with PostgreSQL database.

## Features

- 📊 Interactive data grid for buildings and apartments management
- 🌐 Bilingual support (English/Hebrew)
- 📄 PDF viewer for apartment floor plans
- 📱 Responsive design with Tailwind CSS
- 🐍 Python FastAPI backend
- 🗄️ PostgreSQL database
- 🔐 RESTful API architecture

## Architecture

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Python FastAPI
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

You can view the API documentation at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

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

## API Endpoints

### Buildings

- `GET /api/buildings` - Get all buildings
- `GET /api/buildings/{id}` - Get a specific building
- `POST /api/buildings` - Create a new building
- `PUT /api/buildings/{id}` - Update a building
- `DELETE /api/buildings/{id}` - Delete a building

### Apartments

- `GET /api/apartments` - Get all apartments (optional `?building_id={id}`)
- `GET /api/apartments/{id}` - Get a specific apartment
- `POST /api/apartments` - Create a new apartment
- `PUT /api/apartments/{id}` - Update an apartment
- `DELETE /api/apartments/{id}` - Delete an apartment

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

### Backend
- **FastAPI** - Python web framework
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
