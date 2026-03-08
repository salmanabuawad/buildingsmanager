/**
 * Email Service
 * Sends emails via backend API (/api/email/*). Uses users-table session or JWT.
 */

import { api } from './api';
import { getSession } from './usersTableAuth';
import { getApiBaseUrl } from './appConfig';

/** Backend base URL for email API (no trailing slash). Same as rest of app: config.js / VITE_API_BASE_URL, else same origin. */
function getEmailBackendUrl(): string {
  const base = getApiBaseUrl();
  return base || '';
}

/** Get headers for email API: JWT or users-table session (X-Users-Table-Session). */
async function getEmailApiHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await api.auth.getSession();
    if (session?.access_token && session.access_token !== 'local') {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${session.access_token}`;
      return headers;
    }
  } catch {
    /* use session or token below */
  }
  const backendToken = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
  if (backendToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${backendToken}`;
    return headers;
  }
  const usersSession = getSession();
  if (usersSession) {
    const payload = JSON.stringify({
      user_id: usersSession.user_id,
      user_name: usersSession.user_name,
      user_role: usersSession.user_role,
    });
    (headers as Record<string, string>)['X-Users-Table-Session'] = btoa(unescape(encodeURIComponent(payload)));
  }
  return headers;
}

/** Chunked base64 encode to avoid "Maximum call stack size exceeded" on large attachments. */
function toBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
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

      // Convert attachments to base64 if needed (chunked to avoid stack overflow on large files)
      const attachments = options.attachments?.map(async (att) => {
        let bytes: Uint8Array;
        if (att.content instanceof Blob) {
          bytes = new Uint8Array(await att.content.arrayBuffer());
        } else if (att.content instanceof ArrayBuffer) {
          bytes = new Uint8Array(att.content);
        } else if (att.content instanceof Uint8Array) {
          bytes = att.content;
        } else {
          return { filename: att.filename, content: att.content as string, contentType: att.contentType || 'application/octet-stream' };
        }
        return {
          filename: att.filename,
          content: toBase64(bytes),
          contentType: att.contentType || 'application/octet-stream'
        };
      }) || [];

      const resolvedAttachments = await Promise.all(attachments);

      // Call backend API to send email
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

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            error: (responseData as any).error || 'Unauthorized. Please sign in to send email.'
          };
        }
        if (response.status === 404) {
          return {
            success: false,
            error: 'Email API not found (404). See EMAIL_BACKEND_DEPLOYMENT.md.'
          };
        }
        return {
          success: false,
          error: (responseData as any).error || `HTTP ${response.status}: ${response.statusText}`
        };
      }

      if ((responseData as any)?.success === false && (responseData as any)?.error) {
        return { success: false, error: (responseData as any).error };
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
   * Send multiple export emails in parallel (batched by concurrency) with progress callback.
   * Use for operator/manager Excel emails so the UI can show "שולח מייל X מתוך Y".
   */
  async sendExportEmailsWithProgress(
    items: Array<{
      to: string;
      subject: string;
      body: string;
      attachmentFilename: string;
      attachmentBlob: Blob;
    }>,
    options: { concurrency?: number; onProgress?: (sent: number, total: number) => void } = {}
  ): Promise<{ sentCount: number }> {
    const { concurrency = 3, onProgress } = options;
    if (items.length === 0) {
      return { sentCount: 0 };
    }
    let sentCount = 0;
    const total = items.length;

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map((item) =>
          this.sendEmail({
            to: [item.to],
            subject: item.subject,
            body: item.body,
            attachments: [{
              filename: item.attachmentFilename,
              content: item.attachmentBlob,
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }],
          })
        )
      );
      sentCount += results.filter((r) => r.success).length;
      onProgress?.(sentCount, total);
    }
    return { sentCount };
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
      const testResponseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            error: (testResponseData as any).error || 'Unauthorized. Please sign in to send test email.'
          };
        }
        if (response.status === 404) {
          return {
            success: false,
            error: 'Email API not found (404). See EMAIL_BACKEND_DEPLOYMENT.md.'
          };
        }
        return {
          success: false,
          error: (testResponseData as any).error || (testResponseData as any).detail || `HTTP ${response.status}: ${response.statusText}`
        };
      }
      if ((testResponseData as any)?.success === false && (testResponseData as any)?.error) {
        return { success: false, error: (testResponseData as any).error };
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
   * Replace template placeholders: {{name}}, {{date}}, {{assetCount}}
   */
  private applyTemplate(template: string, name: string, dateStr: string, assetCount?: number): string {
    return template
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{date\}\}/g, dateStr)
      .replace(/\{\{assetCount\}\}/g, assetCount != null ? String(assetCount) : '');
  }

  /**
   * Send per-operator or per-manager ZIPs: one email per item.
   * Items can include optional assetCount for template placeholder {{assetCount}}.
   * When templateKind is 'operator' or 'manager', subject and body are loaded from DB (system_configuration).
   */
  async sendZipByOperators(
    items: Array<{
      operator: { id: number; name: string; email: string };
      zipBlob: Blob;
      zipFilename: string;
      assetCount?: number;
    }>,
    subject?: string,
    bodyTemplate?: (operatorName: string, assetCount?: number) => string,
    templateKind?: 'operator' | 'manager'
  ): Promise<{ success: boolean; error?: string; sentCount?: number }> {
    if (items.length === 0) {
      return { success: true, sentCount: 0 };
    }
    const emailConfig = await this.getEmailConfig();
    if (!emailConfig) {
      return {
        success: false,
        error: 'הגדרות אימייל לא נמצאו. יש להגדיר אימייל בהגדרות המערכת.'
      };
    }
    const dateStr = new Date().toLocaleDateString('he-IL');
    let dbTemplate: { subject: string; body: string } | null = null;
    if (templateKind) {
      try {
        dbTemplate = await api.systemConfiguration.getEmailTemplate(
          templateKind === 'operator' ? 'email_template_operator' : 'email_template_manager'
        );
      } catch (e) {
        console.warn('Failed to load email template from DB:', e);
      }
    }
    const defaultSubject = subject || `שליחת נתונים - ${dateStr}`;
    let sentCount = 0;
    let lastError: string | undefined;
    for (const { operator, zipBlob, zipFilename, assetCount } of items) {
      if (!operator.email || !operator.email.includes('@')) continue;
      let subj = defaultSubject;
      let body: string;
      if (dbTemplate) {
        subj = this.applyTemplate(dbTemplate.subject, operator.name, dateStr, assetCount);
        body = this.applyTemplate(dbTemplate.body, operator.name, dateStr, assetCount);
      } else if (bodyTemplate) {
        body = bodyTemplate(operator.name, assetCount);
      } else {
        body = `שלום ${operator.name},\n\nמצורפים קבצי הנתונים שלך.\n\nתאריך שליחה: ${dateStr}\n\nבברכה,\nמערכת ניהול נכסים`;
      }
      const result = await this.sendEmail({
        to: [operator.email],
        subject: subj,
        body,
        attachments: [{ filename: zipFilename, content: zipBlob, contentType: 'application/zip' }]
      });
      if (result.success) {
        sentCount++;
      } else {
        lastError = result.error;
        console.warn('[emailService] Send failed for', operator.email, result.error);
      }
    }
    if (sentCount === 0) {
      const error = lastError || 'לא נשלח אימייל — לכל הנמענים חסרה כתובת אימייל תקינה או שהשליחה נכשלה.';
      return { success: false, error, sentCount: 0 };
    }
    return { success: true, sentCount };
  }
}

export const emailService = new EmailService();
