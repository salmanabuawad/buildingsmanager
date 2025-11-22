/**
 * Script to import asset_types from CSV file
 * 
 * Usage: node scripts/import_asset_types_csv.js <path_to_csv>
 * 
 * This script reads the CSV file, parses it with proper encoding,
 * and generates SQL INSERT statements or directly imports to Supabase
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const csv = require('csv-parser');

// Get CSV file path from command line or use default
const csvPath = process.argv[2] || path.join(__dirname, '../c:/Users/Owner/Downloads/asset_types_satureday.csv');

// Supabase configuration (you may need to set these as environment variables)
const supabaseUrl = process.env.SUPABASE_URL || 'your-supabase-url';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-supabase-key';

async function importCSV() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const rows = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath, { encoding: 'utf8' })
      .pipe(csv({
        skipEmptyLines: true,
        skipLinesWithError: true,
        headers: ['name', 'description', 'tax_region', 'elevator', 'single_double_family', 'penthouse', 'condo', 'townhouses', 'min_size', 'max_size', 'basement']
      }))
      .on('data', (row) => {
        // Clean and parse the data
        const cleanRow = {
          name: row.name?.trim() || null,
          description: row.description?.trim() || null,
          tax_region: row.tax_region ? parseInt(row.tax_region.trim()) : null,
          elevator: row.elevator?.trim() || null,
          single_double_family: row.single_double_family?.trim() || null,
          penthouse: row.penthouse?.trim() || null,
          condo: row.condo?.trim() || null,
          townhouses: row.townhouses?.trim() || null,
          min_size: row.min_size ? parseFloat(row.min_size.trim()) : null,
          max_size: row.max_size ? parseFloat(row.max_size.trim()) : null,
          basement: row.basement?.trim() || null
        };
        
        // Only add rows with at least name and tax_region
        if (cleanRow.name && cleanRow.tax_region) {
          rows.push(cleanRow);
        }
      })
      .on('end', async () => {
        console.log(`Parsed ${rows.length} rows from CSV`);
        
        try {
          // First, truncate the table
          console.log('Truncating asset_types table...');
          const { error: truncateError } = await supabase
            .from('asset_types')
            .delete()
            .neq('id', 0); // Delete all rows
          
          if (truncateError) {
            console.error('Error truncating table:', truncateError);
            // Try alternative: delete all
            await supabase.rpc('truncate_asset_types');
          }
          
          // Insert in batches
          const batchSize = 100;
          let inserted = 0;
          
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const { data, error } = await supabase
              .from('asset_types')
              .insert(batch)
              .select();
            
            if (error) {
              console.error(`Error inserting batch ${i / batchSize + 1}:`, error);
              reject(error);
              return;
            }
            
            inserted += batch.length;
            console.log(`Inserted ${inserted}/${rows.length} rows...`);
          }
          
          console.log(`Successfully imported ${inserted} asset types!`);
          resolve(inserted);
        } catch (error) {
          console.error('Error importing data:', error);
          reject(error);
        }
      })
      .on('error', (error) => {
        console.error('Error reading CSV:', error);
        reject(error);
      });
  });
}

// Run the import
if (require.main === module) {
  importCSV()
    .then((count) => {
      console.log(`Import completed. ${count} rows imported.`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Import failed:', error);
      process.exit(1);
    });
}

module.exports = { importCSV };

