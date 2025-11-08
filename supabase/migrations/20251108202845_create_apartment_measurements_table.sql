/*
  # Create apartment measurements history table

  1. New Tables
    - `apartment_measurements`
      - `id` (uuid, primary key) - Unique identifier for each measurement
      - `apartment_id` (uuid, foreign key) - References apartments table
      - `measurement_date` (date) - Date when the measurement was taken
      - `apartment_area` (numeric) - Apartment area measurement
      - `storage_area` (numeric) - Storage area measurement
      - `pergola_area` (numeric) - Pergola area measurement
      - `balcony_area` (numeric) - Balcony area measurement
      - `garden_area` (numeric) - Garden area measurement (optional)
      - `total_area` (numeric, generated) - Calculated total of all areas
      - `notes` (text) - Optional notes about the measurement
      - `created_at` (timestamptz) - Timestamp when record was created
      - `created_by` (text) - Optional field for who created the measurement

  2. Security
    - Enable RLS on `apartment_measurements` table
    - Add policy for public read access (since apartments are public)
    - Add policy for public insert/update access (to be restricted later if auth is added)

  3. Indexes
    - Index on apartment_id for faster queries
    - Index on measurement_date for date-based queries
*/

-- Create apartment_measurements table
CREATE TABLE IF NOT EXISTS apartment_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id uuid NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  measurement_date date NOT NULL DEFAULT CURRENT_DATE,
  apartment_area numeric DEFAULT 0,
  storage_area numeric DEFAULT 0,
  pergola_area numeric DEFAULT 0,
  balcony_area numeric DEFAULT 0,
  garden_area numeric DEFAULT 0,
  total_area numeric GENERATED ALWAYS AS (apartment_area + storage_area + pergola_area + balcony_area + COALESCE(garden_area, 0)) STORED,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by text
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_apartment_measurements_apartment_id 
  ON apartment_measurements(apartment_id);

CREATE INDEX IF NOT EXISTS idx_apartment_measurements_date 
  ON apartment_measurements(measurement_date DESC);

-- Enable Row Level Security
ALTER TABLE apartment_measurements ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read measurements
CREATE POLICY "Public read access to measurements"
  ON apartment_measurements FOR SELECT
  USING (true);

-- Policy: Anyone can insert measurements (to be restricted when auth is added)
CREATE POLICY "Public insert access to measurements"
  ON apartment_measurements FOR INSERT
  WITH CHECK (true);

-- Policy: Anyone can update measurements (to be restricted when auth is added)
CREATE POLICY "Public update access to measurements"
  ON apartment_measurements FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policy: Anyone can delete measurements (to be restricted when auth is added)
CREATE POLICY "Public delete access to measurements"
  ON apartment_measurements FOR DELETE
  USING (true);