import { supabase } from './supabase';

// Email is only sent for these types (see 20261002090000_email_notification_delivery.sql
// and refer_student_evaluation_to_dean); other categories offer device alerts only.
export const EMAILED_TYPES = Object.freeze(['grade_posted', 'grade_changed', 'dean_referral']);

const SYSTEM = { key: 'system', label: 'System notices', description: 'General announcements from ASPIRE.', types: ['system'] };

// Categories list only the types each role actually receives from notificationDispatcher
// and the database; a switch never promises an alert the system does not send.
export const PREFERENCE_CATEGORIES = Object.freeze({
  student: [
    { key: 'grades', label: 'Grade postings and corrections', description: 'When an MR, TFR, or SG is posted or a posted grade is corrected.', types: ['grade_posted', 'grade_changed'] },
    { key: 'advising', label: 'Intervention plans and Dean notices', description: 'When an instructor publishes a plan or a Dean sends an academic notice.', types: ['academic_advising', 'academic_notice'] },
    { key: 'risk', label: 'Academic risk and AI insights', description: 'Early-warning alerts and new AI study diagnostics.', types: ['ews_alert', 'ai_recommendation'] },
    { key: 'enrollment', label: 'Class enrollment', description: 'When you are added to a class.', types: ['class_enrolled'] },
    SYSTEM
  ],
  faculty: [
    { key: 'corrections', label: 'Grade correction decisions', description: 'When the Dean approves or rejects your SG correction request.', types: ['override_approved', 'override_rejected'] },
    { key: 'dean', label: 'Dean notices on referred cases', description: 'When a Dean adds a recommendation to a case you referred.', types: ['academic_notice'] },
    { key: 'compliance', label: 'Administrative grade adjustments', description: 'When an administrator overrides a grade in your class.', types: ['compliance'] },
    { key: 'reminders', label: 'Grade submission reminders', description: 'When a term is activated and grade deadlines start.', types: ['term_rollover_reminder'] },
    SYSTEM
  ],
  dean: [
    { key: 'referrals', label: 'Escalated cases', description: 'When a faculty member refers an evaluation to you.', types: ['dean_referral'] },
    { key: 'corrections', label: 'Grade correction requests', description: 'Faculty SG correction requests and pending grade sheets.', types: ['override_request', 'grades_pending'] },
    { key: 'actions', label: 'Your risk actions', description: 'Confirmations of alerts and notices you send.', types: ['risk_threshold', 'academic_notice'] },
    { key: 'reminders', label: 'Grade submission reminders', description: 'When a term is activated and grade deadlines start.', types: ['term_rollover_reminder'] },
    SYSTEM
  ],
  admin: [
    { key: 'security', label: 'Security and account alerts', description: 'Account status changes and new registrations.', types: ['security', 'user_signup'] },
    { key: 'operations', label: 'Roster imports', description: 'When a roster import finishes.', types: ['roster_import'] },
    SYSTEM
  ]
});

export const getPreferenceCategories = role => PREFERENCE_CATEGORIES[role] || [SYSTEM];
export const categorySupportsEmail = category => category.types.some(type => EMAILED_TYPES.includes(type));

// type -> { push, email }; types without a row default to enabled, matching the server.
export async function loadNotificationPreferences(userId) {
  if (!userId) return {};
  const { data, error } = await supabase.from('notification_preferences')
    .select('notification_type,push,email').eq('user_id', userId);
  if (error) throw error;
  return Object.fromEntries((data || []).map(row => [row.notification_type, { push: row.push, email: row.email }]));
}

export function isChannelEnabled(preferences, type, channel) {
  return preferences?.[type]?.[channel] !== false;
}

export function isCategoryEnabled(preferences, category, channel) {
  const types = channel === 'email' ? category.types.filter(type => EMAILED_TYPES.includes(type)) : category.types;
  return types.every(type => isChannelEnabled(preferences, type, channel));
}

// Writes one row per type in the category; the in-app inbox is never muted.
export async function saveCategoryPreference(userId, preferences, category, channel, enabled) {
  const rows = category.types.map(type => ({
    user_id: userId,
    notification_type: type,
    in_app: true,
    push: channel === 'push' ? enabled : isChannelEnabled(preferences, type, 'push'),
    email: channel === 'email' ? enabled : isChannelEnabled(preferences, type, 'email')
  }));
  const { error } = await supabase.from('notification_preferences')
    .upsert(rows, { onConflict: 'user_id,notification_type' });
  if (error) throw error;
  const next = { ...preferences };
  rows.forEach(row => { next[row.notification_type] = { push: row.push, email: row.email }; });
  window.dispatchEvent(new CustomEvent('aspire:notification-preferences-changed', { detail: next }));
  return next;
}
