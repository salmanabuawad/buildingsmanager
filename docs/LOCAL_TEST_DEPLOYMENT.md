# Local Test Deployment (No Docker)

Complete local setup using PostgreSQL with default settings.

## Prerequisites

- PostgreSQL installed and running (localhost:5432)
- Default database `postgres`, user `postgres`
- Python 3.11+, Node.js

## 1. Configure backend

```powershell
cd backend
copy .env.local.example .env
# Edit .env if your PostgreSQL password differs (default: postgres)
```

## 2. Install dependencies

```powershell
cd backend
pip install -r requirements.txt

cd ..
npm install
```

## 3. Create tables

```powershell
cd backend
python -c "from app.database import engine, Base; from app import models; Base.metadata.create_all(bind=engine)"
```

## 4. Run

**Terminal 1 – backend:**
```powershell
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 – frontend:**
```powershell
$env:VITE_API_URL = "http://localhost:8000"
npm run dev
```

## 5. Access

- **Frontend:** http://localhost:5173
- **API:** http://localhost:8000
- **Docs:** http://localhost:8000/docs
- **Health:** http://localhost:8000/health

## Quick run

```powershell
.\scripts\run-local.ps1
```

This copies `.env` if missing, creates tables, and opens backend + frontend.
