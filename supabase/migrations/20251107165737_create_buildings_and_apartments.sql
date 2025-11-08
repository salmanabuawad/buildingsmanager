/*
  # Real Estate Management Schema

  1. New Tables
    - `buildings`
      - `id` (uuid, primary key) - Unique identifier for each building
      - `name` (text) - Building name
      - `address` (text) - Building address
      - `city` (text) - City location
      - `total_floors` (integer) - Number of floors in the building
      - `year_built` (integer) - Year the building was constructed
      - `created_at` (timestamptz) - Record creation timestamp

    - `apartments`
      - `id` (uuid, primary key) - Unique identifier for each apartment
      - `building_id` (uuid, foreign key) - References buildings table
      - `apartment_number` (text) - Apartment unit number
      - `floor` (integer) - Floor number
      - `bedrooms` (integer) - Number of bedrooms
      - `bathrooms` (integer) - Number of bathrooms
      - `area_sqft` (integer) - Area in square feet
      - `rent_price` (numeric) - Monthly rent price
      - `is_available` (boolean) - Availability status
      - `created_at` (timestamptz) - Record creation timestamp

  2. Security
    - Enable RLS on both tables
    - Add policies for public read access (as this is a property listing app)
*/

CREATE TABLE IF NOT EXISTS buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  total_floors integer DEFAULT 1,
  year_built integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS apartments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  apartment_number text NOT NULL,
  floor integer NOT NULL,
  bedrooms integer DEFAULT 1,
  bathrooms integer DEFAULT 1,
  area_sqft integer NOT NULL,
  rent_price numeric(10, 2) NOT NULL,
  is_available boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(building_id, apartment_number)
);

ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to buildings"
  ON buildings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to apartments"
  ON apartments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_apartments_building_id ON apartments(building_id);
CREATE INDEX IF NOT EXISTS idx_apartments_available ON apartments(is_available);