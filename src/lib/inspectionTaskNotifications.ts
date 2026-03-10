/**
 * Inspector task notifications by email.
 * Sends when: task assigned (create/update), task returned to inspector.
 * Uses email_template_inspection_task from system_configuration.
 * Placeholders: {{inspectorName}}, {{taskTitle}}, {{taskId}}, {{taskLink}}, {{action}}
 */

import { inspectionTasksApi } from './inspectionApi';
import { api } from './api';
import { emailService } from './emailService';

/** Build deep link URL to open a specific inspection task. With token: one-time login, no password. */
export function getTaskDeepLink(taskId: number, token?: string | null): string {
  const hash = token
    ? `#inspection-tasks/${taskId}?token=${encodeURIComponent(token)}`
    : `#inspection-tasks/${taskId}`;
  if (typeof window !== 'undefined') {
    const base = `${window.location.origin}${window.location.pathname || '/'}`.replace(/\/$/, '');
    return `${base}${hash}`;
  }
  return hash;
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
  }
  return result;
}

async function sendNotification(
  kind: 'assigned' | 'returned',
  assignedToUserId: number,
  taskId: number,
  taskTitle: string
): Promise<void> {
  try {
    const user = await api.users.getOne(assignedToUserId);
    if (!user?.user_email || !user.user_email.includes('@')) {
      console.warn('[inspectionTaskNotifications] No valid email for user', assignedToUserId);
      return;
    }
    let token: string | null = null;
    let otpCode: string | null = null;
    try {
      const res = await inspectionTasksApi.createAccessToken(taskId, assignedToUserId);
      token = res?.token ?? null;
    } catch (e) {
      console.warn('[inspectionTaskNotifications] Failed to create token:', e);
    }
    if (kind === 'assigned') {
      try {
        otpCode = await inspectionTasksApi.createOtp(assignedToUserId, taskId);
      } catch (e) {
        console.warn('[inspectionTaskNotifications] Failed to create OTP:', e);
      }
    }
    const taskLink = getTaskDeepLink(taskId, token);
    const action = kind === 'assigned' ? 'הוקצתה אליך' : 'הוחזרה אליך לתיקון';
    const vars = {
      inspectorName: (user as { full_name?: string | null }).full_name?.trim() || user.user_name || 'פקח',
      taskTitle,
      taskId: String(taskId),
      taskLink,
      action,
      otpCode: otpCode || '',
    };
    let subject: string;
    let body: string;
    try {
      const t = await api.systemConfiguration.getEmailTemplate('email_template_inspection_task');
      if (t?.subject && t?.body) {
        subject = applyTemplate(t.subject, vars);
        body = applyTemplate(t.body, vars);
      } else {
        throw new Error('no template');
      }
    } catch {
      subject =
        kind === 'assigned'
          ? `משימת ביקורת הוקצתה אליך: ${taskTitle}`
          : `משימה הוחזרה אליך: ${taskTitle}`;
      const otpSection = kind === 'assigned' && vars.otpCode
        ? `\nקוד התחברות חד-פעמי (תקף 30 דקות): ${vars.otpCode}\nניתן להזין את הקוד בעמוד ההתחברות במקום סיסמה.\n`
        : '';
      body = `שלום ${vars.inspectorName},\n\nמשימת ביקורת ${action}.\nכותרת: ${taskTitle}\nמזהה משימה: #${taskId}\n${otpSection}\nלפתיחת המשימה ישירות (ללא צורך בהתחברות): ${taskLink}\n\nהקישור הוא חד-פעמי ותקף ל־7 ימים.\n\nבברכה,\nמערכת ניהול נכסים`;
    }
    const result = await emailService.sendEmail({
      to: [user.user_email],
      subject,
      body,
    });
    if (!result.success) {
      console.warn('[inspectionTaskNotifications] Email failed:', result.error);
    }
  } catch (err) {
    console.warn('[inspectionTaskNotifications] Send failed:', err);
  }
}

/** Fire-and-forget: notify inspector when a task is assigned to them (create or update). */
export function notifyTaskAssigned(assignedToUserId: number, taskId: number, taskTitle: string): void {
  sendNotification('assigned', assignedToUserId, taskId, taskTitle).catch(() => {});
}

/** Fire-and-forget: notify inspector when a task is returned to them. */
export function notifyTaskReturned(assignedToUserId: number, taskId: number, taskTitle: string): void {
  sendNotification('returned', assignedToUserId, taskId, taskTitle).catch(() => {});
}
