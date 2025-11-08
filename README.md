# Buildings Manager

A modern web application for managing buildings and apartments with real-time updates, built with React, TypeScript, Vite, and Supabase.

## Features

- 📊 Interactive data grid for buildings and apartments management
- 🌐 Bilingual support (English/Hebrew)
- 📄 PDF viewer for apartment floor plans
- 📁 DWG file upload and management
- 🔄 Real-time updates using Supabase
- 📱 Responsive design with Tailwind CSS
- 🔐 Secure data storage with Row Level Security

## Prerequisites

Before running this project locally, ensure you have:

- **Node.js** (v18 or higher)
- **npm** (v9 or higher)
- A **Supabase account** and project

## Local Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd project
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**To get your Supabase credentials:**
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to Settings → API
4. Copy the Project URL and anon/public key

### 4. Set Up Database

The project includes migration files in `supabase/migrations/`. You have two options:

**Option A: Using Supabase CLI (Recommended)**

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

**Option B: Manual Setup**

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Run each migration file in order (sorted by timestamp)

### 5. Set Up Storage Bucket

1. Go to your Supabase Dashboard → Storage
2. Create a new bucket named `dwg-files`
3. Set it as a public bucket or configure appropriate policies

### 6. Run Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### 7. Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Project Structure

```
project/
├── src/
│   ├── components/         # React components
│   │   ├── AdminPDFManager.tsx
│   │   ├── ApartmentDetails.tsx
│   │   ├── ApartmentsList.tsx
│   │   ├── BuildingsList.tsx
│   │   ├── LanguageSwitcher.tsx
│   │   └── PDFViewer.tsx
│   ├── i18n/              # Internationalization
│   │   ├── i18n.ts
│   │   └── translations.ts
│   ├── lib/               # Utilities and configurations
│   │   └── supabase.ts
│   ├── App.tsx            # Main application component
│   ├── main.tsx           # Application entry point
│   └── index.css          # Global styles
├── supabase/
│   └── migrations/        # Database migration files
├── public/                # Static assets
└── package.json           # Project dependencies
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

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

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **AG Grid** - Data grid component
- **Supabase** - Backend and database
- **i18next** - Internationalization
- **React PDF** - PDF viewing
- **Lucide React** - Icons

## Troubleshooting

### Database Connection Issues
- Verify your `.env` file has correct Supabase credentials
- Check if your Supabase project is active
- Ensure RLS policies are properly configured

### Build Errors
- Clear `node_modules` and reinstall: `rm -rf node_modules package-lock.json && npm install`
- Check Node.js version: `node --version`
- Run type checking: `npm run typecheck`

### Real-time Updates Not Working
- Ensure Realtime is enabled in your Supabase project
- Check that tables have `REPLICA IDENTITY FULL` set
- Verify network connection

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

This project is licensed under the MIT License.
