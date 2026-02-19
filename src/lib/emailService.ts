/**
 * Email Service
 * 
 * Service for sending emails via backend API. When published (e.g. Bolt/Netlify),
 * uses same-origin /api/email/* (Node serverless) protected by Supabase Auth.
 */

import { api } from './api';
import { supabase } from './supabase';

/** Backend base URL for email API (no trailing slash). Same origin when published so Netlify functions handle /api/email/*. */
function getEmailBackendUrl(): string {
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return ''; // same origin: /api/email/test and /api/email/send
  }
  return import.meta.env.PROD ? '' : 'http://localhost:8000';
}

/** Get headers for email API: Supabase Auth JWT so the serverless function can verify. */
async function getEmailApiHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch {
    // no Supabase session
  }
  return headers;
}

export interface EmailAttachment {
  filename: string;
  content: Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string[];
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
  cc?: string[];
  bcc?: string[];
}

export interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_encryption: 'tls' | 'ssl' | 'none';
  smtp_username: string;
  smtp_password: string;
  from_email: string;
  from_name?: string;
  reply_to_email?: string;
}

class EmailService {
  /**
   * Get email configuration from system_configuration
   */
  async getEmailConfig(): Promise<EmailConfig | null> {
    try {
      const config = await api.systemConfiguration.getEmailConfig();
      if (!config) return null;
      
      // Validate required fields
      if (!config.smtp_host || !config.smtp_port || !config.from_email) {
        console.error('Email config missing required fields');
        return null;
      }
      
      return {
        smtp_host: config.smtp_host,
        smtp_port: config.smtp_port,
        smtp_encryption: config.smtp_encryption || 'tls',
        smtp_username: config.smtp_username || '',
        smtp_password: config.smtp_password || '',
        from_email: config.from_email,
        from_name: config.from_name,
        reply_to_email: config.reply_to_email,
      };
    } catch (error) {
      console.error('Error loading email config:', error);
      return null;
    }
  }

  /**
   * Send email with attachments via backend API
   */
  async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
    try {
      const emailConfig = await this.getEmailConfig();
      if (!emailConfig) {
        return {
          success: false,
          error: 'Email configuration not found. Please configure email settings in System Configuration.'
        };
      }

      if (!options.to || options.to.length === 0) {
        return {
          success: false,
          error: 'No recipients specified'
        };
      }

      // Convert attachments to base64 if needed
      const attachments = options.attachments?.map(async (att) => {
        let content: string;
        if (att.content instanceof Blob) {
          const arrayBuffer = await att.content.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          content = base64;
        } else if (att.content instanceof ArrayBuffer) {
          const base64 = btoa(String.fromCharCode(...new Uint8Array(att.content)));
          content = base64;
        } else if (att.content instanceof Uint8Array) {
          const base64 = btoa(String.fromCharCode(...att.content));
          content = base64;
        } else {
          content = att.content as string;
        }

        return {
          filename: att.filename,
          content: content,
          contentType: att.contentType || 'application/octet-stream'
        };
      }) || [];

      const resolvedAttachments = await Promise.all(attachments);

      // Call backend API to send email (Netlify function requires Supabase Auth)
      const backendUrl = getEmailBackendUrl();
      const response = await fetch(`${backendUrl}/api/email/send`, {
        method: 'POST',
        headers: await getEmailApiHeaders(),
        body: JSON.stringify({
          email_config: emailConfig,
          to: options.to,
          subject: options.subject,
          body: options.body,
          attachments: resolvedAttachments,
          cc: options.cc,
          bcc: options.bcc,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            error: 'Unauthorized. Please sign in with Supabase Auth to send email.'
          };
        }
        if (response.status === 404) {
          return {
            success: false,
            error: 'Email API not found (404). See EMAIL_BACKEND_DEPLOYMENT.md.'
          };
        }
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}: ${response.statusText}`
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Error sending email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending email'
      };
    }
  }

  /**
   * Send a test email to verify SMTP configuration
   */
  async sendTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
    try {
      const emailConfig = await this.getEmailConfig();
      if (!emailConfig) {
        return {
          success: false,
          error: 'Email configuration not found. Please configure email settings in System Configuration.'
        };
      }
      if (!to || !to.includes('@')) {
        return { success: false, error: 'Valid recipient email required' };
      }
      const backendUrl = getEmailBackendUrl();
      const response = await fetch(`${backendUrl}/api/email/test`, {
        method: 'POST',
        headers: await getEmailApiHeaders(),
        body: JSON.stringify({
          email_config: emailConfig,
          test_to: to.trim()
        })
      });
      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            error: 'Unauthorized. Please sign in with Supabase Auth to send test email.'
          };
        }
        if (response.status === 404) {
          return {
            success: false,
            error: 'Email API not found (404). See EMAIL_BACKEND_DEPLOYMENT.md.'
          };
        }
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        return {
          success: false,
          error: err.detail || err.error || `HTTP ${response.status}: ${response.statusText}`
        };
      }
      return { success: true };
    } catch (error) {
      console.error('Error sending test email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending test email'
      };
    }
  }

  /**
   * Send per-operator ZIPs: one email per operator with their data.
   * Each item is { operator: { id, name, email }, zipBlob, zipFilename }.
   */
  async sendZipByOperators(
    items: Array<{ operator: { id: number; name: string; email: string }; zipBlob: Blob; zipFilename: string }>,
    subject?: string,
    bodyTemplate?: (operatorName: string, assetCount?: number) => string
  ): Promise<{ success: boolean; error?: string; sentCount?: number }> {
    if (items.length === 0) {
      return { success: true, sentCount: 0 };
    }
    const emailConfig = await this.getEmailConfig();
    if (!emailConfig) {
      return {
        success: false,
        error: 'Email configuration not found. Please configure email settings in System Configuration.'
      };
    }
    const defaultSubject = subject || `שליחת נתונים - ${new Date().toLocaleDateString('he-IL')}`;
    let sentCount = 0;
    for (const { operator, zipBlob, zipFilename } of items) {
      if (!operator.email || !operator.email.includes('@')) continue;
      const body = bodyTemplate
        ? bodyTemplate(operator.name)
        : `שלום ${operator.name},\n\nמצורפים קבצי הנתונים שלך.\n\nתאריך שליחה: ${new Date().toLocaleDateString('he-IL')}\n\nבברכה,\nמערכת ניהול נכסים`;
      const result = await this.sendEmail({
        to: [operator.email],
        subject: defaultSubject,
        body,
        attachments: [{ filename: zipFilename, content: zipBlob, contentType: 'application/zip' }]
      });
      if (result.success) sentCount++;
    }
    return { success: true, sentCount };
  }
}

export const emailService = new EmailService();
