// Supabase Edge Function: Create Default Users
// This function securely creates users using the service role key with auto-confirm
// It should be deployed to Supabase Edge Functions

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key (from environment)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const results: Array<{ user: string; success: boolean; message: string; auth_user_id?: string }> = [];

    // Create admin user
    try {
      const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.createUser({
        email: 'admin@buildingsmanager.local',
        password: 'admin123',
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          user_name: 'admin'
        }
      });

      if (adminError) {
        if (adminError.message.includes('already registered') || adminError.message.includes('already exists')) {
          // User already exists, try to get the existing user
          const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
          const existingAdmin = existingUsers?.users?.find(u => u.email === 'admin@buildingsmanager.local');
          
          if (existingAdmin) {
            results.push({
              user: 'admin',
              success: true,
              message: 'משתמש admin כבר קיים',
              auth_user_id: existingAdmin.id
            });
          } else {
            results.push({
              user: 'admin',
              success: false,
              message: `שגיאה: ${adminError.message}`
            });
          }
        } else {
          results.push({
            user: 'admin',
            success: false,
            message: `שגיאה: ${adminError.message}`
          });
        }
      } else if (adminData.user) {
        results.push({
          user: 'admin',
          success: true,
          message: '✅ משתמש admin נוצר בהצלחה',
          auth_user_id: adminData.user.id
        });

        // Link to users table
        const { error: linkError } = await supabaseAdmin
          .from('users')
          .update({ auth_user_id: adminData.user.id })
          .eq('user_name', 'admin');

        if (!linkError) {
          results[results.length - 1].message += ' ומקושר ל-users table';
        }
      }
    } catch (err) {
      results.push({
        user: 'admin',
        success: false,
        message: `שגיאה: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    }

    // Create user (read-only)
    try {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email: 'user@buildingsmanager.local',
        password: 'user123',
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          user_name: 'user'
        }
      });

      if (userError) {
        if (userError.message.includes('already registered') || userError.message.includes('already exists')) {
          // User already exists, try to get the existing user
          const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = existingUsers?.users?.find(u => u.email === 'user@buildingsmanager.local');
          
          if (existingUser) {
            results.push({
              user: 'user',
              success: true,
              message: 'משתמש user כבר קיים',
              auth_user_id: existingUser.id
            });
          } else {
            results.push({
              user: 'user',
              success: false,
              message: `שגיאה: ${userError.message}`
            });
          }
        } else {
          results.push({
            user: 'user',
            success: false,
            message: `שגיאה: ${userError.message}`
          });
        }
      } else if (userData.user) {
        results.push({
          user: 'user',
          success: true,
          message: '✅ משתמש user נוצר בהצלחה',
          auth_user_id: userData.user.id
        });

        // Link to users table
        const { error: linkError } = await supabaseAdmin
          .from('users')
          .update({ auth_user_id: userData.user.id })
          .eq('user_name', 'user');

        if (!linkError) {
          results[results.length - 1].message += ' ומקושר ל-users table';
        }
      }
    } catch (err) {
      results.push({
        user: 'user',
        success: false,
        message: `שגיאה: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    }

    const allSuccess = results.every(r => r.success);
    const messages = results.map(r => r.message).join('\n');

    return new Response(
      JSON.stringify({
        success: allSuccess,
        results: results,
        message: messages
      }),
      { status: allSuccess ? 200 : 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
