#!/usr/bin/env node
/**
 * Email queue daemon: polls email_queue, sends one Excel per row, updates status.
 * Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node email-worker/daemon.js
 * Requires: email_config in system_configuration (SMTP settings).
 */

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const POLL_MS = 5000;
const BATCH_SIZE = 10;

function getEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env: ${name}`);
    process.exit(1);
  }
  return v;
}

async function getEmailConfig(supabase) {
  const { data, error } = await supabase
    .from('system_configuration')
    .select('value')
    .eq('name', 'email_config')
    .maybeSingle();
  if (error || !data?.value) return null;
  try {
    return JSON.parse(data.value);
  } catch {
    return null;
  }
}

function createTransporter(c) {
  const secure = c.smtp_encryption === 'ssl';
  const opts = {
    host: c.smtp_host,
    port: c.smtp_port || 587,
    secure,
    auth: (c.smtp_username && c.smtp_password)
      ? { user: c.smtp_username, pass: c.smtp_password }
      : undefined,
  };
  if (!secure && c.smtp_encryption === 'tls') opts.requireTLS = true;
  return nodemailer.createTransport(opts);
}

async function run() {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let emailConfig = null;

  for (;;) {
    try {
      if (!emailConfig) {
        emailConfig = await getEmailConfig(supabase);
        if (!emailConfig) {
          console.warn('Email config not found in system_configuration; skipping send. Will retry.');
          await sleep(POLL_MS);
          continue;
        }
      }

      const { data: rows, error: fetchErr } = await supabase
        .from('email_queue')
        .select('id, to_email, recipient_name, subject, body, attachment_filename, attachment_content_base64')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);

      if (fetchErr) {
        console.error('Fetch queue error:', fetchErr);
        await sleep(POLL_MS);
        continue;
      }

      if (!rows || rows.length === 0) {
        await sleep(POLL_MS);
        continue;
      }

      const transporter = createTransporter(emailConfig);
      const from = emailConfig.from_name
        ? `"${String(emailConfig.from_name).replace(/"/g, '\\"')}" <${emailConfig.from_email}>`
        : emailConfig.from_email;

      for (const row of rows) {
        await supabase
          .from('email_queue')
          .update({ status: 'sending' })
          .eq('id', row.id);

        const attachments = [];
        if (row.attachment_filename && row.attachment_content_base64) {
          attachments.push({
            filename: row.attachment_filename,
            content: Buffer.from(row.attachment_content_base64, 'base64'),
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });
        }

        try {
          await transporter.sendMail({
            from,
            to: row.to_email,
            replyTo: emailConfig.reply_to_email || undefined,
            subject: row.subject || '',
            text: row.body || '',
            attachments,
          });
          await supabase
            .from('email_queue')
            .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
            .eq('id', row.id);
          console.log(`Sent queue id=${row.id} to ${row.to_email}`);
        } catch (err) {
          console.error(`Send failed id=${row.id}:`, err.message);
          await supabase
            .from('email_queue')
            .update({
              status: 'failed',
              sent_at: null,
              error_message: err.message || String(err),
            })
            .eq('id', row.id);
        }
      }
    } catch (err) {
      console.error('Daemon iteration error:', err);
    }
    await sleep(POLL_MS);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

run();
