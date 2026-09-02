import { supabase } from './supabase';
import { showLocalNotification } from './notificationService';

export const NOTIFICATION_TITLES = {
  grade_posted: '📊 New Grade Posted',
  class_enrolled: '📚 Class Registration Success',
  eval_window_open: '📝 Faculty Evaluation Open',
  eval_closed: '🔒 Faculty Evaluation Closed',
  eval_deadline_reminder: '⏰ Evaluation Deadline Reminder',
  ews_alert: '⚠️ Early Warning System Alert',
  ai_recommendation: '🧠 AI Counseling Ready',
  class_assigned: '📋 New Class Assigned',
  term_rollover_reminder: '⏰ Grade Submission Reminder',
  override_approved: '✅ Grade Override Approved',
  override_rejected: '❌ Grade Override Rejected',
  risk_threshold: '⚠️ At-Risk Threshold Alert',
  grades_pending: '📑 Grade Sheet Pending Approval',
  override_request: '📝 Grade Override Pending',
  eval_compiled: '⭐ Evaluation Reports Compiled',
  compliance: '🛡️ Grading Compliance Alert',
  roster_import: '📊 Student Roster Processed',
  eval_window: '📅 Evaluation Window Status',
  assignment: '👥 Subject Assignment Update',
  security: '🔒 Administrative Security Alert',
  database_sync: '🔄 Database Sync Success',
  user_signup: '👤 New User Registered',
  system: 'ℹ️ SAGE System Notice'
};

// Global broadcast channel for cross-client real-time alerts
let realtimeAlertChannel = null;
function getRealtimeChannel() {
  if (!realtimeAlertChannel) {
    realtimeAlertChannel = supabase.channel('sage-realtime-alerts', {
      config: { broadcast: { self: false } }
    });
    realtimeAlertChannel.subscribe();
  }
  return realtimeAlertChannel;
}

/**
 * Insert notifications into Supabase database, trigger local native notification popup,
 * and broadcast to other active devices via Supabase Realtime Broadcast.
 * @param {Array<{ recipient_id: string, type: string, message: string }>} notificationList
 */
export async function dispatchNotifications(notificationList = []) {
  if (!notificationList || notificationList.length === 0) return;

  try {
    const formatted = notificationList
      .map(n => ({
        recipient_id: n.recipient_id || n.recipientId,
        type: n.type || 'system',
        message: n.message,
        is_read: false,
        created_at: new Date().toISOString()
      }))
      .filter(n => Boolean(n.recipient_id && n.message));

    if (formatted.length === 0) return;

    // 1. Insert into persistent database table
    const { error } = await supabase
      .from('notifications')
      .insert(formatted);

    if (error) {
      console.warn('Failed to insert notifications into database:', error);
    }

    // 2. Immediate Local Popup: If the current logged-in user on THIS device is a recipient,
    // trigger native notification immediately without awaiting remote websocket roundtrip!
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;
      if (currentUserId) {
        const myNotif = formatted.find(n => n.recipient_id === currentUserId);
        if (myNotif) {
          const title = NOTIFICATION_TITLES[myNotif.type] || 'SAGE Notification';
          showLocalNotification({
            title,
            body: myNotif.message,
            payload: myNotif
          });
        }
      }
    } catch (localErr) {
      console.warn('Local native notification dispatch error:', localErr);
    }

    // 3. Send Realtime Broadcast to notify other devices in real-time
    try {
      const channel = getRealtimeChannel();
      for (const notif of formatted) {
        channel.send({
          type: 'broadcast',
          event: 'notification',
          payload: notif
        });
      }
    } catch (broadcastErr) {
      console.warn('Realtime broadcast dispatch error:', broadcastErr);
    }
  } catch (err) {
    console.warn('Error dispatching notifications:', err);
  }
}

/**
 * Notify all students in a section, the assigned faculty, deans, and office actor when an evaluation window opens.
 */
export async function notifyEvaluationWindowOpen({
  sectionId,
  facultyId,
  subjectName = 'your class',
  sectionName = '',
  facultyName = '',
  actorId = null
}) {
  try {
    const notificationsToInsert = [];

    // 1. Fetch active students in the target section
    if (sectionId) {
      const { data: students } = await supabase
        .from('users')
        .select('user_id')
        .eq('role', 'student')
        .eq('status', 'active')
        .eq('section_id', sectionId);

      if (students && students.length > 0) {
        students.forEach(st => {
          notificationsToInsert.push({
            recipient_id: st.user_id,
            type: 'eval_window_open',
            message: `Faculty evaluation period is now open for ${subjectName || sectionName || 'your class'}. Please complete the survey for Prof. ${facultyName || 'your instructor'}.`
          });
        });
      }
    }

    // 2. Notify the faculty instructor
    if (facultyId) {
      notificationsToInsert.push({
        recipient_id: facultyId,
        type: 'eval_window_open',
        message: `Evaluation window open: Evaluation period for ${sectionName || 'your section'} (${subjectName || ''}) is now active. Please encourage your students to submit their evaluation surveys.`
      });
    }

    // 3. Notify College Deans
    const { data: deans } = await supabase
      .from('users')
      .select('user_id')
      .eq('role', 'dean')
      .eq('status', 'active');
    
    if (deans && deans.length > 0) {
      deans.forEach(d => {
        notificationsToInsert.push({
          recipient_id: d.user_id,
          type: 'eval_window_open',
          message: `Evaluation window published for section ${sectionName || ''} (Prof. ${facultyName || 'Instructor'}).`
        });
      });
    }

    // 4. Notify Office Staff Actor
    if (actorId) {
      notificationsToInsert.push({
        recipient_id: actorId,
        type: 'eval_window',
        message: `Evaluation window successfully published for section ${sectionName || ''} (Prof. ${facultyName || 'Instructor'}).`
      });
    }

    await dispatchNotifications(notificationsToInsert);
  } catch (err) {
    console.warn('Error in notifyEvaluationWindowOpen:', err);
  }
}

/**
 * Notify students when term or final grades are released.
 */
export async function notifyGradesPosted({
  sectionId,
  subjectCode = '',
  termName = 'Final',
  facultyName = ''
}) {
  try {
    if (sectionId) {
      const { data: students } = await supabase
        .from('users')
        .select('user_id')
        .eq('role', 'student')
        .eq('status', 'active')
        .eq('section_id', sectionId);

      if (students && students.length > 0) {
        const list = students.map(st => ({
          recipient_id: st.user_id,
          type: 'grade_posted',
          message: `Your ${termName} grades for ${subjectCode || 'your class'} have been officially posted by Prof. ${facultyName || 'your instructor'}.`
        }));
        await dispatchNotifications(list);
      }
    }
  } catch (err) {
    console.warn('Error in notifyGradesPosted:', err);
  }
}

/**
 * Notify students, faculty, deans, and office staff when an evaluation window is closed.
 */
export async function notifyEvaluationWindowClosed({
  sectionId,
  facultyId,
  subjectName = 'your class',
  sectionName = '',
  facultyName = '',
  actorId = null
}) {
  try {
    const notificationsToInsert = [];

    // 1. Notify enrolled students in target section
    if (sectionId) {
      const { data: students } = await supabase
        .from('users')
        .select('user_id')
        .eq('role', 'student')
        .eq('status', 'active')
        .eq('section_id', sectionId);

      if (students && students.length > 0) {
        students.forEach(st => {
          notificationsToInsert.push({
            recipient_id: st.user_id,
            type: 'eval_closed',
            message: `The faculty evaluation survey period for ${subjectName || sectionName || 'your class'} (Prof. ${facultyName || 'Instructor'}) has officially closed. Thank you for your submission!`
          });
        });
      }
    }

    // 2. Notify assigned faculty
    if (facultyId) {
      notificationsToInsert.push({
        recipient_id: facultyId,
        type: 'eval_compiled',
        message: `Evaluation window closed: Surveys for section ${sectionName || 'your section'} are now closed. Student evaluation responses have been compiled.`
      });
    }

    // 3. Notify Deans
    const { data: deans } = await supabase
      .from('users')
      .select('user_id')
      .eq('role', 'dean')
      .eq('status', 'active');
    
    if (deans && deans.length > 0) {
      deans.forEach(d => {
        notificationsToInsert.push({
          recipient_id: d.user_id,
          type: 'eval_compiled',
          message: `Student evaluation window closed for section ${sectionName || ''} (Prof. ${facultyName || 'Instructor'}). Evaluation reports are compiled.`
        });
      });
    }

    // 4. Notify Office Staff Actor
    if (actorId) {
      notificationsToInsert.push({
        recipient_id: actorId,
        type: 'eval_window',
        message: `Evaluation window closed for section ${sectionName || ''} (Prof. ${facultyName || 'Instructor'}).`
      });
    }

    await dispatchNotifications(notificationsToInsert);
  } catch (err) {
    console.warn('Error in notifyEvaluationWindowClosed:', err);
  }
}

/**
 * Notify administrators and target user when accounts are disabled, enabled, or archived.
 */
export async function notifyUserStatusChange({
  targetUserName = 'User',
  targetUserEmail = '',
  targetRole = 'user',
  targetUserId = null,
  newStatus = 'inactive',
  actorName = 'Administrator'
}) {
  try {
    const notificationsToInsert = [];
    const statusAction = newStatus === 'inactive' ? 'disabled' : newStatus === 'active' ? 'enabled' : newStatus === 'archived' ? 'archived' : newStatus;

    // 1. Notify all Administrators (Security Notice)
    const { data: admins } = await supabase
      .from('users')
      .select('user_id')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      admins.forEach(adm => {
        notificationsToInsert.push({
          recipient_id: adm.user_id,
          type: 'security',
          message: `Security Notice: ${targetRole.toUpperCase()} account for ${targetUserName} (${targetUserEmail}) was ${statusAction} by ${actorName}.`
        });
      });
    }

    // 2. Notify the affected user
    if (targetUserId) {
      notificationsToInsert.push({
        recipient_id: targetUserId,
        type: 'security',
        message: newStatus === 'inactive'
          ? `Security Notice: Your SAGE institutional account has been temporarily disabled by ${actorName}. Please contact your administrator if you have questions.`
          : newStatus === 'archived'
          ? `Security Notice: Your SAGE institutional account has been archived by ${actorName}.`
          : `Security Notice: Your SAGE institutional account has been re-activated by ${actorName}.`
      });
    }

    await dispatchNotifications(notificationsToInsert);
  } catch (err) {
    console.warn('Error in notifyUserStatusChange:', err);
  }
}

/**
 * Notify all administrators regarding core administrative operations
 * (Subjects Database, Sections Database, Grade Computation Templates, Term Management, Overrides).
 */
export async function notifyAdminActivity({
  type = 'system', // 'system' | 'security' | 'database_sync'
  message = '',
  actorName = 'Administrator'
}) {
  try {
    if (!message) return;

    const { data: admins } = await supabase
      .from('users')
      .select('user_id')
      .eq('role', 'admin');

    if (!admins || admins.length === 0) return;

    const notificationsToInsert = admins.map(adm => ({
      recipient_id: adm.user_id,
      type,
      message
    }));

    await dispatchNotifications(notificationsToInsert);
  } catch (err) {
    console.warn('Error in notifyAdminActivity:', err);
  }
}



