/*
  # Recreate asset_types table with official data

  1. Changes
    - Drop existing asset_types table and recreate with proper structure
    - Use asset code as primary key (integer)
    - Import all official asset type data from CSV
    - Maintain proper column structure: code, description, tax_region, shared_area, has_elevator, min_size, max_size

  2. Data
    - 149 asset types covering codes from 199 to 999
    - Tax regions: 10, 20, 30, 32, 40
    - Includes residential (199-299), shared areas (299-417), and various special types (501-999)

  3. Security
    - Enable RLS on asset_types table
    - Allow public read access for asset type lookups
    - Restrict write access to authenticated users only
*/

-- Drop existing asset_types table and recreate
DROP TABLE IF EXISTS asset_types CASCADE;

CREATE TABLE IF NOT EXISTS asset_types (
  code integer PRIMARY KEY,
  description text NOT NULL,
  tax_region integer,
  shared_area boolean DEFAULT false,
  has_elevator boolean DEFAULT false,
  min_asset_size numeric,
  max_asset_size numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE asset_types ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to asset_types"
  ON asset_types
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow authenticated users to manage asset types
CREATE POLICY "Allow authenticated users to insert asset_types"
  ON asset_types
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update asset_types"
  ON asset_types
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete asset_types"
  ON asset_types
  FOR DELETE
  TO authenticated
  USING (true);

-- Insert all asset types from CSV
INSERT INTO asset_types (code, description, tax_region, shared_area, has_elevator, min_asset_size, max_asset_size) VALUES
(199, 'דמי תיעול ביוביות', 10, NULL, NULL, NULL, NULL),
(202, 'משרדים קומה 1 עם מעלית', 10, NULL, NULL, NULL, NULL),
(203, 'משרדים קומה 1 בלי מעלית', 10, NULL, NULL, NULL, NULL),
(210, 'משרדים שלא בנייני משרדים', 10, NULL, NULL, NULL, NULL),
(211, 'משרדים קומה 1', 10, NULL, true, 100, 9999),
(212, 'משרדים קומה 1', 10, NULL, true, 50, 99),
(213, 'משרדים קומה 1', 10, NULL, true, 0, 50),
(214, 'משרדים קומה 1', 10, NULL, false, 100, 9999),
(215, 'משרדים קומה 1', 10, NULL, false, 50, 99),
(216, 'חנויות ללא מעלית', 10, NULL, NULL, NULL, NULL),
(217, 'חנויות', 10, NULL, NULL, NULL, NULL),
(250, 'שטח משותף משרדי 1', 10, NULL, NULL, NULL, NULL),
(251, 'משרדים קומה 1', 10, true, NULL, NULL, NULL),
(221, 'משרדים קומה 2', 20, NULL, true, 100, 9999),
(222, 'משרדים קומה 2', 20, NULL, true, 50, 99),
(223, 'משרדים קומה 2', 20, NULL, true, 0, 50),
(224, 'משרדים קומה 2', 20, NULL, false, 100, 9999),
(225, 'משרדים קומה 2', 20, NULL, false, 50, 99),
(226, 'חנויות ללא מעלית', 20, NULL, NULL, NULL, NULL),
(227, 'חנויות', 20, NULL, NULL, NULL, NULL),
(252, 'שטח משותף משרדי 2', 20, NULL, NULL, NULL, NULL),
(253, 'משרדים קומה 2', 20, true, NULL, NULL, NULL),
(231, 'משרדים קומה 3', 30, NULL, true, 100, 9999),
(232, 'משרדים קומה 3', 30, NULL, true, 50, 99),
(233, 'משרדים קומה 3', 30, NULL, true, 0, 50),
(234, 'משרדים קומה 3', 30, NULL, false, 100, 9999),
(235, 'משרדים קומה 3', 30, NULL, false, 50, 99),
(236, 'חנויות ללא מעלית', 30, NULL, NULL, NULL, NULL),
(237, 'חנויות', 30, NULL, NULL, NULL, NULL),
(254, 'שטח משותף משרדי 3', 30, NULL, NULL, NULL, NULL),
(255, 'משרדים קומה 3', 30, true, NULL, NULL, NULL),
(241, 'משרדים קומה 32', 32, NULL, NULL, NULL, NULL),
(242, 'משרדים קומה 32', 32, NULL, NULL, NULL, NULL),
(243, 'משרדים קומה 32', 32, NULL, NULL, NULL, NULL),
(244, 'משרדים קומה 32', 32, NULL, NULL, NULL, NULL),
(245, 'משרדים קומה 32', 32, NULL, NULL, NULL, NULL),
(299, 'דמי תיעול מגורים', 40, NULL, NULL, NULL, NULL),
(300, 'דמי שצ''פ מגורים', 40, NULL, NULL, NULL, NULL),
(301, 'שטח נוסף 15,000 מ"ר', 40, NULL, NULL, NULL, NULL),
(302, 'שטח משותף סניטציה/מדרגות', 40, NULL, NULL, NULL, NULL),
(310, 'משרדים משותף מגורים לפי תקנון', 40, NULL, NULL, NULL, NULL),
(311, 'משרדים משותף מגורים קומה 1', 40, NULL, NULL, NULL, NULL),
(312, 'משרדים משותף מגורים קומה 1', 40, NULL, NULL, NULL, NULL),
(313, 'חניות מגורים קומה 1', 40, NULL, NULL, NULL, NULL),
(315, 'שטח נוסף נחנך', 40, NULL, NULL, NULL, NULL),
(316, 'עד שטח מס"ח ברמת 330 מעלית', 40, NULL, NULL, NULL, NULL),
(317, 'עד שטח מס"ח ברמת 330 חניה', 40, NULL, NULL, NULL, NULL),
(318, 'עד שטח מס"ח ברמת 330 משרדים', 40, NULL, NULL, NULL, NULL),
(321, 'משרדים משותף מגורים קומה 2', 40, NULL, NULL, NULL, NULL),
(322, 'משרדים משותף מגורים קומה 2', 40, NULL, NULL, NULL, NULL),
(323, 'חניות מגורים קומה 2', 40, NULL, NULL, NULL, NULL),
(325, 'חניות מגורים', 40, NULL, NULL, NULL, NULL),
(390, 'מחסני מגורים לחישוב במגורים', 40, NULL, NULL, NULL, NULL),
(397, 'מחסני מגורים במגרש מגורים', 40, NULL, NULL, NULL, NULL),
(398, 'דמי שצ''פ עבור 400 יחידות דיורבנוס', 40, NULL, NULL, NULL, NULL),
(399, 'מחסני במרתף לכל יחידת מגורים', 40, NULL, NULL, NULL, NULL),
(400, 'מחסני מגורים', 40, NULL, NULL, NULL, NULL),
(401, 'מחסני במרתף', 40, NULL, NULL, NULL, NULL),
(402, 'שטח מגורים ללא נחנך', 40, NULL, NULL, NULL, NULL),
(403, 'מחסני מגורים ללא נחנך', 40, NULL, NULL, NULL, NULL),
(404, 'חניות מקרה ללא נחנך', 40, NULL, NULL, NULL, NULL),
(405, 'שטח מגורים ללא נחנך', 40, NULL, NULL, NULL, NULL),
(406, 'מרפסות מגורים ללא ערך', 40, NULL, NULL, NULL, NULL),
(407, 'מחסני מגורים ללא נחנך', 40, NULL, NULL, NULL, NULL),
(408, 'מרפסת/ב ללא נחנך', 40, NULL, NULL, NULL, NULL),
(409, 'פרגולה/ים ללא נחנך', 40, NULL, NULL, NULL, NULL),
(410, 'מרפסות מגורים ללא ערך', 40, NULL, NULL, NULL, NULL),
(411, 'מחסני ערך - לפני נחנך', 40, NULL, NULL, NULL, NULL),
(412, 'שטח מגורים ללא נחנך', 40, NULL, NULL, NULL, NULL),
(413, 'שטח מגורים מעליה במרחב', 40, NULL, NULL, NULL, NULL),
(414, 'מחסני מגורים ערך', 40, NULL, NULL, NULL, NULL),
(415, 'דמי מגורים מגורים,רפואה/ספ אזור1', 40, NULL, NULL, NULL, NULL),
(416, 'דמי מגורים מגורים,רפואה/ספ אזור2', 40, NULL, NULL, NULL, NULL),
(417, 'מחסני מקרה ,ערך נוסף ע''ע', 40, NULL, NULL, NULL, NULL),
(501, 'מרפסות קומה 1', 40, NULL, NULL, NULL, NULL),
(502, 'מרפסות קומה 2', 40, NULL, NULL, NULL, NULL),
(503, 'מרפסות במגרש מגורים', 40, NULL, NULL, NULL, NULL),
(504, 'שטח מגורים מגורים', 40, NULL, NULL, NULL, NULL),
(505, 'שטח מגורים במרתף', 40, NULL, NULL, NULL, NULL),
(506, 'דמי ערך ל/מרפסות', 40, NULL, NULL, NULL, NULL),
(507, 'מרתפים לפי', 40, NULL, NULL, NULL, NULL),
(508, 'מרפסות מגורים', 40, NULL, NULL, NULL, NULL),
(509, 'מרפסות קומה 1', 40, NULL, NULL, NULL, NULL),
(510, 'מרפסות קומה 2', 40, NULL, NULL, NULL, NULL),
(511, 'שטח מגורים קומה 1', 40, NULL, NULL, NULL, NULL),
(512, 'שטח מגורים קומה 2', 40, NULL, NULL, NULL, NULL),
(513, 'פרגולה', 40, NULL, NULL, NULL, NULL),
(514, 'מס"ח', 40, NULL, NULL, NULL, NULL),
(515, 'דמי מגורים מגרש ערך רפואה/ספ אז1', 40, NULL, NULL, NULL, NULL),
(516, 'דמי מגורים מגרש ערך רפואה/ספ אז2', 40, NULL, NULL, NULL, NULL),
(520, 'מרתפ/ים', 40, NULL, NULL, NULL, NULL),
(521, 'מרתפים - מרתפ/ים', 40, NULL, NULL, NULL, NULL),
(522, 'שטח לפי,מגורים מקרה', 40, NULL, NULL, NULL, NULL),
(523, 'דמי ש/מרתפים', 40, NULL, NULL, NULL, NULL),
(552, 'דמי ערך ערך', 40, NULL, NULL, NULL, NULL),
(601, 'שטח המרתף', 40, NULL, NULL, NULL, NULL),
(602, 'מרתפים', 40, NULL, NULL, NULL, NULL),
(603, 'פ.מחסני מגורים', 40, NULL, NULL, NULL, NULL),
(661, 'מחסני במרתף - במרתף', 40, NULL, NULL, NULL, NULL),
(662, 'מחסני במרתף - מרתפים', 40, NULL, NULL, NULL, NULL),
(700, 'שטח לא ממוסה  מגורים', 40, NULL, NULL, NULL, NULL),
(701, 'פ.מחסני מגורים מגורים', 40, NULL, NULL, NULL, NULL),
(702, 'פ.מחסני דמי שצ''פ ערך', 40, NULL, NULL, NULL, NULL),
(703, 'פ. מחסני מגורים מרתפי במרתף', 40, NULL, NULL, NULL, NULL),
(704, 'פ. מחסני במרתף/מגורים/מחסני לפי', 40, NULL, NULL, NULL, NULL),
(705, 'שטח האנטימצה/ות מגורים קומה לפי', 40, NULL, NULL, NULL, NULL),
(800, 'דמי שצ''פ עבור 1000 י''', 40, NULL, NULL, NULL, NULL),
(801, 'מחסני במרתפי/ם מגורים', 40, NULL, NULL, NULL, NULL),
(802, 'דמי מגורים', 40, NULL, NULL, NULL, NULL),
(803, 'מחסני ערך', 40, NULL, NULL, NULL, NULL),
(804, 'פ.מחסני במרתפי ערך', 40, NULL, NULL, NULL, NULL),
(805, 'שטח מגורים', 40, NULL, NULL, NULL, NULL),
(806, 'שטח  במרתף', 40, NULL, NULL, NULL, NULL),
(807, 'ערך-מחסני במרתף', 40, NULL, NULL, NULL, NULL),
(808, 'דמי נחנך', 40, NULL, NULL, NULL, NULL),
(809, 'שטח ערך', 40, NULL, NULL, NULL, NULL),
(810, 'מחסני מקרה מגורים', 40, NULL, NULL, NULL, NULL),
(811, 'מחסני לא מגורים', 40, NULL, NULL, NULL, NULL),
(812, 'ערך-דמי במרתף', 40, NULL, NULL, NULL, NULL),
(813, 'מס"ח דמי מגורים פ.מחסני', 40, NULL, NULL, NULL, NULL),
(814, 'מחסני עבור 15000 ערך', 40, NULL, NULL, NULL, NULL),
(815, 'שטח האנטימצה/ות קומה מגורים', 40, NULL, NULL, NULL, NULL),
(816, 'מחסני מגורים לא נחנך', 40, NULL, NULL, NULL, NULL),
(818, 'דמי במרתף', 40, NULL, NULL, NULL, NULL),
(819, 'שטח דמי ערך', 40, NULL, NULL, NULL, NULL),
(820, 'שטח דמי ערך', 40, NULL, NULL, NULL, NULL),
(821, 'מרפסות קומה מגורים', 40, NULL, NULL, NULL, NULL),
(822, 'מחסני מגורים במרתפ/ים', 40, NULL, NULL, NULL, NULL),
(824, 'מחסני מגורים', 40, NULL, NULL, NULL, NULL),
(827, 'מרתפ/ים מגורים נחנך', 40, NULL, NULL, NULL, NULL),
(828, 'מרתפ/ים ללא שצ''פ נחנך', 40, NULL, NULL, NULL, NULL),
(881, 'דמי שצ''פ קומה 1 במרתף', 40, NULL, NULL, NULL, NULL),
(882, 'דמי שצ''פ קומה 2 במרתף', 40, NULL, NULL, NULL, NULL),
(883, 'דמי שצ''פ קומה 3 במרתף', 40, NULL, NULL, NULL, NULL),
(901, 'דמי שצ''פ עד 1000 מ"ר', 40, NULL, NULL, NULL, NULL),
(902, 'דמי שצ''פ מ-1,001 עד 2,000 מ"ר', 40, NULL, NULL, NULL, NULL),
(903, 'דמי שצ''פ מ-2,001 עד 4,000 מ"ר', 40, NULL, NULL, NULL, NULL),
(904, 'דמי שצ''פ  מ- 4,001 ועוד יותר', 40, NULL, NULL, NULL, NULL),
(905, 'דמי שצ''פ 5 מרתפים', 40, NULL, NULL, NULL, NULL),
(906, 'מחסני במרתפי/ם במרתף', 40, NULL, NULL, NULL, NULL),
(907, 'שטח במרתפי מגורים', 40, NULL, NULL, NULL, NULL),
(908, 'מרתפים מגורים', 40, NULL, NULL, NULL, NULL),
(909, 'שטח מגורים מגורים(מרתפי נחנך)', 40, NULL, NULL, NULL, NULL),
(910, 'פ. מחסני מגורים ללא נחנך', 40, NULL, NULL, NULL, NULL),
(911, 'עד שטח דמי ערך מס"ח מגורים', 40, NULL, NULL, NULL, NULL),
(912, 'שטח במרתפ/ים במרתף', 40, NULL, NULL, NULL, NULL),
(913, 'דמי שצ''פ קומה לא במרתפ/ים', 40, NULL, NULL, NULL, NULL),
(915, 'דמי שצ''פ דמי לא נחנך', 40, NULL, NULL, NULL, NULL),
(990, 'מרתפ/ים/מרתפ/ים', 40, NULL, NULL, NULL, NULL),
(995, 'דמי לא נחנך', 40, NULL, NULL, NULL, NULL),
(999, 'דמי ערך', 40, NULL, NULL, NULL, NULL);
