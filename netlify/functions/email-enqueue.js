/**
 * Netlify serverless function: POST /api/email/enqueue
 * Adds email jobs to the queue (one Excel per recipient). Daemon sends them in the background.
 * Requires Supabase Auth (Authorization: Bearer <access_token>).
 */

import { createClient } from '@supabase/supabase-js';

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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return response(405, { success: false, error: 'Method not allowed' });
  }

  const authHeader = event.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return response(401, { success: false, error: 'Missing or invalid Authorization header' });
  }

  const body = parseBody(event);
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return response(400, { success: false, error: 'items array required and must not be empty' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return response(500, { success: false, error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const rows = items
    .filter((item) => item.to && String(item.to).includes('@'))
    .map((item) => ({
      to_email: String(item.to).trim(),
      recipient_name: item.recipientName != null ? String(item.recipientName) : null,
      subject: item.subject != null ? String(item.subject) : '',
      body: item.body != null ? String(item.body) : '',
      attachment_filename: item.attachmentFilename != null ? String(item.attachmentFilename) : null,
      attachment_content_base64: item.attachmentContentBase64 != null ? String(item.attachmentContentBase64) : null,
      status: 'pending',
    }));

  if (rows.length === 0) {
    return response(400, { success: false, error: 'No valid recipients (to email required)' });
  }

  const { data, error } = await supabase.from('email_queue').insert(rows).select('id');

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
