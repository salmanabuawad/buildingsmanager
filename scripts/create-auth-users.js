/**
 * Script to create default Supabase Auth users
 * Run this script after running the migrations to create auth users
 * 
 * Usage:
 *   node scripts/create-auth-users.js
 * 
 * Or in browser console (after setting SUPABASE_URL and SUPABASE_ANON_KEY):
 *   Copy and paste the code below
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');

try {
  dotenv.config({ path: envPath });
} catch (e) {
  console.warn('Could not load .env file, using environment variables');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: Missing Supabase environment variables');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createAuthUsers() {
  console.log('Creating Supabase Auth users...\n');

  // Create admin user
  console.log('Creating admin user...');
  const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
    email: 'admin@buildingsmanager.local',
    password: 'admin',
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      user_name: 'admin'
    }
  });

  if (adminError) {
    if (adminError.message.includes('already registered')) {
      console.log('⚠️  Admin user already exists');
    } else {
      console.error('❌ Error creating admin user:', adminError.message);
    }
  } else {
    console.log('✅ Admin user created:', adminData.user?.email);
    
    // Link to users table
    if (adminData.user?.id) {
      const { error: linkError } = await supabase
        .from('users')
        .update({ auth_user_id: adminData.user.id })
        .eq('user_name', 'admin');
      
      if (linkError) {
        console.warn('⚠️  Could not link admin to users table:', linkError.message);
      } else {
        console.log('✅ Admin linked to users table');
      }
    }
  }

  // Create user (read-only)
  console.log('\nCreating user (read-only)...');
  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email: 'user@buildingsmanager.local',
    password: 'user',
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      user_name: 'user'
    }
  });

  if (userError) {
    if (userError.message.includes('already registered')) {
      console.log('⚠️  User already exists');
    } else {
      console.error('❌ Error creating user:', userError.message);
    }
  } else {
    console.log('✅ User created:', userData.user?.email);
    
    // Link to users table
    if (userData.user?.id) {
      const { error: linkError } = await supabase
        .from('users')
        .update({ auth_user_id: userData.user.id })
        .eq('user_name', 'user');
      
      if (linkError) {
        console.warn('⚠️  Could not link user to users table:', linkError.message);
      } else {
        console.log('✅ User linked to users table');
      }
    }
  }

  console.log('\n✅ Setup complete!');
  console.log('\nDefault credentials:');
  console.log('  Admin: admin@buildingsmanager.local / admin');
  console.log('  User:  user@buildingsmanager.local / user');
}

createAuthUsers().catch(console.error);
