const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://mmqnrwjjxewrgwczezzf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tcW5yd2pqeGV3cmd3Y3plenpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NDY5MzMsImV4cCI6MjA4NTAyMjkzM30.ov9r3vyMsRwhSaqQ_3wlPtGTjiK-Rn36BAgbT_zGu1E';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function extractDatabaseStructure() {
  const output = {
    tables: [],
    functions: [],
    triggers: [],
    constraints: [],
    seedData: {}
  };

  try {
    // Get all tables
    console.log('Fetching tables...');
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public');

    if (tablesError) {
      console.error('Error fetching tables:', tablesError);
    } else {
      console.log(`Found ${tables?.length || 0} tables`);
      
      // Get table structures and data
      for (const table of tables || []) {
        const tableName = table.table_name;
        
        // Skip system tables
        if (tableName.startsWith('_') || tableName === 'information_schema') {
          continue;
        }

        console.log(`Processing table: ${tableName}`);

        // Get table columns
        const { data: columns, error: columnsError } = await supabase.rpc('exec_sql', {
          query: `
            SELECT 
              column_name,
              data_type,
              is_nullable,
              column_default,
              character_maximum_length,
              numeric_precision,
              numeric_scale
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = '${tableName}'
            ORDER BY ordinal_position;
          `
        }).catch(() => ({ data: null, error: null }));

        // Try alternative method to get columns
        let tableColumns = [];
        if (columnsError || !columns) {
          // Try direct query
          try {
            const { data: sampleData } = await supabase
              .from(tableName)
              .select('*')
              .limit(1);
            
            if (sampleData && sampleData.length > 0) {
              tableColumns = Object.keys(sampleData[0]).map(key => ({
                column_name: key,
                data_type: typeof sampleData[0][key]
              }));
            }
          } catch (e) {
            console.warn(`Could not get columns for ${tableName}:`, e.message);
          }
        } else {
          tableColumns = columns;
        }

        // Get table data (seed)
        let tableData = [];
        try {
          const { data: data, error: dataError } = await supabase
            .from(tableName)
            .select('*')
            .limit(10000); // Limit to prevent memory issues

          if (!dataError && data) {
            tableData = data;
            console.log(`  Found ${data.length} rows in ${tableName}`);
          }
        } catch (e) {
          console.warn(`  Could not fetch data from ${tableName}:`, e.message);
        }

        output.tables.push({
          name: tableName,
          type: table.table_type,
          columns: tableColumns
        });

        if (tableData.length > 0) {
          output.seedData[tableName] = tableData;
        }
      }
    }

    // Get functions
    console.log('\nFetching functions...');
    const { data: functions, error: functionsError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          routine_name,
          routine_type,
          routine_definition
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        ORDER BY routine_name;
      `
    }).catch(() => {
      // Try alternative: query pg_proc directly
      return supabase.rpc('exec_sql', {
        query: `
          SELECT 
            p.proname as routine_name,
            CASE p.prokind
              WHEN 'f' THEN 'FUNCTION'
              WHEN 'p' THEN 'PROCEDURE'
              WHEN 'a' THEN 'AGGREGATE'
              WHEN 'w' THEN 'WINDOW'
              ELSE 'FUNCTION'
            END as routine_type,
            pg_get_functiondef(p.oid) as routine_definition
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'public'
          ORDER BY p.proname;
        `
      });
    });

    if (functionsError) {
      console.warn('Could not fetch functions:', functionsError.message);
    } else if (functions) {
      console.log(`Found ${functions.length} functions`);
      output.functions = functions;
    }

    // Get triggers
    console.log('\nFetching triggers...');
    const { data: triggers, error: triggersError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          trigger_name,
          event_manipulation,
          event_object_table,
          action_statement,
          action_timing
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
        ORDER BY trigger_name;
      `
    }).catch(() => ({ data: null, error: null }));

    if (triggersError) {
      console.warn('Could not fetch triggers:', triggersError.message);
    } else if (triggers) {
      console.log(`Found ${triggers.length} triggers`);
      output.triggers = triggers;
    }

    // Get constraints
    console.log('\nFetching constraints...');
    const { data: constraints, error: constraintsError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          constraint_name,
          table_name,
          constraint_type
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
        ORDER BY table_name, constraint_name;
      `
    }).catch(() => ({ data: null, error: null }));

    if (constraintsError) {
      console.warn('Could not fetch constraints:', constraintsError.message);
    } else if (constraints) {
      console.log(`Found ${constraints.length} constraints`);
      output.constraints = constraints;
    }

    // Save to file
    const outputDir = path.join(__dirname, 'db_structure');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save complete structure
    fs.writeFileSync(
      path.join(outputDir, 'complete_structure.json'),
      JSON.stringify(output, null, 2)
    );

    // Save seed data separately
    fs.writeFileSync(
      path.join(outputDir, 'seed_data.json'),
      JSON.stringify(output.seedData, null, 2)
    );

    // Generate SQL seed file
    let seedSQL = '-- Seed Data\n\n';
    for (const [tableName, data] of Object.entries(output.seedData)) {
      if (data.length === 0) continue;
      
      seedSQL += `-- Table: ${tableName}\n`;
      seedSQL += `INSERT INTO ${tableName} (${Object.keys(data[0]).join(', ')}) VALUES\n`;
      
      const values = data.map(row => {
        const rowValues = Object.values(row).map(val => {
          if (val === null) return 'NULL';
          if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
          if (typeof val === 'boolean') return val ? 'true' : 'false';
          if (val instanceof Date) return `'${val.toISOString()}'`;
          return String(val);
        });
        return `(${rowValues.join(', ')})`;
      });
      
      seedSQL += values.join(',\n') + ';\n\n';
    }

    fs.writeFileSync(
      path.join(outputDir, 'seed_data.sql'),
      seedSQL
    );

    console.log('\n✅ Database structure extracted successfully!');
    console.log(`📁 Output directory: ${outputDir}`);
    console.log(`   - complete_structure.json (full structure)`);
    console.log(`   - seed_data.json (data as JSON)`);
    console.log(`   - seed_data.sql (data as SQL)`);

  } catch (error) {
    console.error('Error extracting database structure:', error);
  }
}

// Run the extraction
extractDatabaseStructure();
