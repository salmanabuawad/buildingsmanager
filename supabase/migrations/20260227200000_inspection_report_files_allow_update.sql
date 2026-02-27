-- Allow update on inspection_report_files (e.g. file_name) for inspector/admin rename
DROP POLICY IF EXISTS "Allow update inspection_report_files" ON inspection_report_files;
CREATE POLICY "Allow update inspection_report_files" ON inspection_report_files
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
