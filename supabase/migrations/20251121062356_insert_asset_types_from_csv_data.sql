/*
  # Import Asset Types from CSV Data
  
  1. Data Import
    - Insert all asset types from the provided CSV file
    - 12 columns matching the CSV structure exactly
*/

INSERT INTO asset_types (name, description, tax_region, elevator, asset_group, single_double_family, penthouse, condo, townhouses, min_size, max_size, shelter) VALUES
('199', 'נכס משולב מגורים', 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('202', 'מגורים אזור 1 קו החוף', 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('203', 'מגורים אזור 1 קו החוף', 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('210', 'מגורים נכס לא ראוי לשימוש', 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('211', 'מגורים אזור 1', 10, NULL, 'א', NULL, 'כן', NULL, NULL, NULL, NULL, NULL),
('211', 'מגורים אזור 1', 10, NULL, 'א', 'כן', NULL, NULL, NULL, 100, 9999, NULL),
('212', 'מגורים אזור 1', 10, 'כן', 'ב', NULL, NULL, 'כן', NULL, 110, 9999, NULL),
('212', 'מגורים אזור 1', 10, NULL, 'ב', NULL, NULL, NULL, 'כן', NULL, NULL, NULL),
('212', 'מגורים אזור 1', 10, NULL, 'ב', 'כן', NULL, NULL, NULL, 1, 100, NULL),
('213', 'מגורים אזור 1', 10, 'כן', 'ג', NULL, NULL, 'כן', NULL, 81, 110, NULL),
('213', 'מגורים אזור 1', 10, NULL, 'ג', NULL, NULL, 'כן', NULL, 111, 9999, NULL),
('214', 'מגורים אזור 1', 10, 'כן', 'ד', NULL, NULL, 'כן', NULL, 1, 80, NULL),
('214', 'מגורים אזור 1', 10, NULL, 'ד', NULL, NULL, 'כן', NULL, 1, 110, NULL),
('216', 'מרפסת ללא חיוב', 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('221', 'מגורים אזור 2', 20, NULL, 'א', NULL, 'כן', NULL, NULL, NULL, NULL, NULL),
('221', 'מגורים אזור 2', 20, NULL, 'א', 'כן', NULL, NULL, NULL, 100, 9999, NULL),
('222', 'מגורים אזור 2', 20, 'כן', 'ב', NULL, NULL, 'כן', NULL, 110, 9999, NULL),
('222', 'מגורים אזור 2', 20, NULL, 'ב', NULL, NULL, NULL, 'כן', NULL, NULL, NULL),
('222', 'מגורים אזור 2', 20, NULL, 'ב', 'כן', NULL, NULL, NULL, 1, 100, NULL),
('223', 'מגורים אזור 2', 20, 'כן', 'ג', NULL, NULL, 'כן', NULL, 81, 110, NULL),
('223', 'מגורים אזור 2', 20, NULL, 'ג', NULL, NULL, 'כן', NULL, 111, 9999, NULL),
('224', 'מגורים אזור 2', 20, 'כן', 'ד', NULL, NULL, 'כן', NULL, 1, 80, NULL),
('224', 'מגורים אזור 2', 20, NULL, 'ד', NULL, NULL, 'כן', NULL, 1, 110, NULL),
('226', 'מרפסת ללא חיוב', 20, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('231', 'מגורים אזור 3', 30, NULL, 'א', NULL, 'כן', NULL, NULL, NULL, NULL, NULL),
('231', 'מגורים אזור 3', 30, NULL, 'א', 'כן', NULL, NULL, NULL, 100, 9999, NULL),
('232', 'מגורים אזור 3', 30, 'כן', 'ב', NULL, NULL, 'כן', NULL, 110, 9999, NULL),
('232', 'מגורים אזור 3', 30, NULL, 'ב', NULL, NULL, NULL, 'כן', NULL, NULL, NULL),
('232', 'מגורים אזור 3', 30, NULL, 'ב', 'כן', NULL, NULL, NULL, 1, 100, NULL),
('233', 'מגורים אזור 3', 30, 'כן', 'ג', NULL, NULL, 'כן', NULL, 81, 110, NULL),
('233', 'מגורים אזור 3', 30, NULL, 'ג', NULL, NULL, 'כן', NULL, 111, 9999, NULL),
('234', 'מגורים אזור 3', 30, 'כן', 'ד', NULL, NULL, 'כן', NULL, 1, 80, NULL),
('234', 'מגורים אזור 3', 30, NULL, 'ד', NULL, NULL, 'כן', NULL, 1, 110, NULL),
('236', 'מרפסת ללא חיוב', 30, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
