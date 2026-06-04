import { supabase } from './supabase';

/**
 * Write an entry to the activity_logs (System Audit Ledger).
 * @param {string} action  - Short action label (e.g. "User Creation", "Grade Override")
 * @param {string} message - Descriptive sentence of what happened
 * @param {string} actor   - Full name or email of the person performing the action
 */
export async function logActivity(action, message, actor = 'System') {
  try {
    const { error } = await supabase.from('activity_logs').insert({
      action,
      message,
      actor,
    });
    if (error) {
      console.warn('[AuditLog] Failed to write activity log:', error.message);
    }
  } catch (err) {
    console.warn('[AuditLog] Unexpected error writing activity log:', err.message);
  }
}

/**
 * Resolve the display name for the currently logged-in admin from their profile.
 * Falls back to email, then "System Administrator".
 * @param {object|null} profile - The userProfile object from AuthContext
 * @param {object|null} user    - The session user object from AuthContext
 */
export function resolveActorName(profile, user) {
  if (profile?.first_name && profile?.last_name) {
    return `${profile.first_name} ${profile.last_name}`;
  }
  if (user?.email) return user.email;
  return 'System Administrator';
}
