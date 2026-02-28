/**
 * Inspector task notifications by email.
 * Sends when: task assigned (create/update), task returned to inspector.
 * Uses email_template_inspection_task from system_configuration.
 * Placeholders: {{inspectorName}}, {{taskTitle}}, {{taskId}}, {{taskLink}}
 */

import { api } from './api';
import { emailService } from './emailService';

/** Build deep link URL to open a specific inspection task (works when app is on inspection-tasks tab). */
export function getTaskDeepLink(taskId: number): string {
  if (typeof window !== 'undefined') {
    const base = `${window.location.origin}${window.location.pathname || '/'}`.replace(/\/$/, '');
    return `${base}#inspection-tasks/${taskId}`;
  }
  return `#inspection-tasks/${taskId}`;
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
    const taskLink = getTaskDeepLink(taskId);
    const action = kind === 'assigned' ? 'הוקצתה אליך' : 'הוחזרה אליך לתיקון';
    const vars = {
      inspectorName: user.user_name || 'פקח',
      taskTitle,
      taskId: String(taskId),
      taskLink,
      action,
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
      subject = kind === 'assigned'
        ? `משימת ביקורת הוקצתה אליך: ${taskTitle}`
        : `משימה הוחזרה אליך: ${taskTitle}`;
      body = `שלום ${vars.inspectorName},\n\nמשימת ביקורת ${action}.\nכותרת: ${taskTitle}\nמזהה משימה: #${taskId}\n\nלפתיחת המשימה: ${taskLink}\n\nבברכה,\nמערכת ניהול נכסים`;
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
