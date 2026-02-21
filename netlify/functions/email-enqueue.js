/**
 * Netlify serverless function: POST /api/email/enqueue
 * Adds email jobs to export_email_queue (one Excel per recipient). Daemon sends them in the background.
 * Auth: Supabase Auth (Authorization: Bearer) or users-table session (X-Users-Table-Session).
 */

import { createClient } from '@supabase/supabase-js';

const CORS_HEADERS = 'Content-Type, Authorization, X-Users-Table-Session';

function parseBody(event) {
  if (event.body && typeof event.body === 'string') {
    try {
      return JSON.parse(event.body);
    } catch {
      return null;
    }
  }
  return null;
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': CORS_HEADERS,
    },
    body: JSON.stringify(body),
  };
}

function decodeUsersTableSession(header) {
  if (!header || typeof header !== 'string') return null;
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf8');
    const obj = JSON.parse(decoded);
    if (typeof obj?.user_id !== 'number' && typeof obj?.user_id !== 'string') return null;
    const user_id = typeof obj.user_id === 'string' ? parseInt(obj.user_id, 10) : obj.user_id;
    if (Number.isNaN(user_id)) return null;
    return { user_id, user_name: String(obj.user_name || ''), user_role: obj.user_role };
  } catch {
    return null;
  }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': CORS_HEADERS }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return response(405, { success: false, error: 'Method not allowed' });
  }

  const authHeader = event.headers?.authorization;
  const usersSessionHeader = event.headers?.['x-users-table-session'];
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let supabase;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
  } else if (usersSessionHeader && (supabaseUrl && supabaseAnonKey)) {
    const session = decodeUsersTableSession(usersSessionHeader);
    if (!session) {
      return response(401, { success: false, error: 'Missing or invalid Authorization header' });
    }
    supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('user_id', session.user_id)
      .maybeSingle();
    if (userError || !userRow) {
      return response(401, { success: false, error: 'Missing or invalid Authorization header' });
    }
  } else {
    return response(401, { success: false, error: 'Missing or invalid Authorization header' });
  }

  const body = parseBody(event);
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return response(400, { success: false, error: 'items array required and must not be empty' });
  }

  const rows = items
    .filter((item) => item.to && String(item.to).includes('@'))
    .map((item) => ({
      to_email: String(item.to).trim(),
      to_name: item.recipientName != null ? String(item.recipientName) : '',
      subject: item.subject != null ? String(item.subject) : '',
      body_he: item.body != null ? String(item.body) : '',
      attachment_base64: item.attachmentContentBase64 != null ? String(item.attachmentContentBase64) : '',
      attachment_filename: item.attachmentFilename != null ? String(item.attachmentFilename) : 'export.xlsx',
      status: 'pending',
    }));

  if (rows.length === 0) {
    return response(400, { success: false, error: 'No valid recipients (to email required)' });
  }

  const { data, error } = await supabase.from('export_email_queue').insert(rows).select('id');

  if (error) {
    console.error('Email enqueue error:', error);
    return response(500, { success: false, error: error.message || 'Failed to enqueue' });
  }

  return response(200, {
    success: true,
    enqueued: data?.length ?? rows.length,
    message: `נוספו ${data?.length ?? rows.length} מיילים לתור`,
  });
}
