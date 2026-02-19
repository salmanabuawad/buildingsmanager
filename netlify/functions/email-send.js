/**
 * Netlify serverless function: POST /api/email/send
 * Sends email with optional attachments. Requires Supabase Auth (Authorization: Bearer <access_token>).
 */

import nodemailer from 'nodemailer';
import { getUserFromAuthHeader } from './supabase-auth.js';

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

  const { user, error: authError } = await getUserFromAuthHeader(event.headers?.authorization);
  if (authError || !user) {
    return response(401, {
      success: false,
      error: authError?.message || 'Unauthorized. Sign in with Supabase Auth.',
    });
  }

  const body = parseBody(event);
  if (!body || !body.email_config || !body.to || !Array.isArray(body.to) || body.to.length === 0) {
    return response(400, { success: false, error: 'No recipients specified' });
  }

  const c = body.email_config;
  const to = body.to;
  const subject = body.subject || '';
  const text = body.body || '';
  const cc = body.cc || null;
  const bcc = body.bcc || null;
  const attachments = body.attachments || [];

  try {
    const secure = c.smtp_encryption === 'ssl';
    const transportOpts = {
      host: c.smtp_host,
      port: c.smtp_port || 587,
      secure,
      auth: (c.smtp_username && c.smtp_password)
        ? { user: c.smtp_username, pass: c.smtp_password }
        : undefined,
    };
    if (!secure && c.smtp_encryption === 'tls') {
      transportOpts.requireTLS = true;
    }

    const transporter = nodemailer.createTransport(transportOpts);

    const from = c.from_name
      ? `"${String(c.from_name).replace(/"/g, '\\"')}" <${c.from_email}>`
      : c.from_email;

    const mailOptions = {
      from,
      to: to.join(', '),
      cc: cc && cc.length ? cc.join(', ') : undefined,
      bcc: bcc && bcc.length ? bcc.join(', ') : undefined,
      replyTo: c.reply_to_email || undefined,
      subject,
      text,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'base64'),
        contentType: a.contentType || 'application/octet-stream',
      })),
    };

    await transporter.sendMail(mailOptions);

    return response(200, {
      success: true,
      message: `Email sent successfully to ${to.length} recipient(s)`,
    });
  } catch (err) {
    console.error('Email send error:', err);
    return response(500, {
      success: false,
      error: err.message || 'Failed to send email',
    });
  }
}
