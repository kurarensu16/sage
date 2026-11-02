import { supabase } from './supabase';

// Scheduled maintenance windows.
//
// Migration: 20261029230608_scheduled_maintenance_windows.sql
//
// Everything that decides whether the system is closed lives in SQL:
// is_maintenance_active() is the single answer, and the message users read is
// composed by aspire_compose_maintenance_message(). Nothing here re-derives
// either, because a second definition would eventually disagree with the first.

export const REASON_CATEGORIES = Object.freeze([
  { id: 'routine', label: 'Routine operations' },
  { id: 'academic', label: 'Academic calendar' },
  { id: 'unplanned', label: 'Unplanned' }
]);

export async function fetchMaintenanceReasons() {
  const { data, error } = await supabase
    .from('maintenance_reasons')
    .select('id, label, category, message_template, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    label: r.label,
    category: r.category,
    template: r.message_template
  }));
}

// Sentences the admin can add with one click instead of typing. Presets with a
// reason_id are offered only alongside that reason; NULL means always.
export async function fetchNotePresets() {
  const { data, error } = await supabase
    .from('maintenance_note_presets')
    .select('id, note_text, reason_id, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data || []).map((p) => ({
    id: p.id,
    text: p.note_text,
    reasonId: p.reason_id || null
  }));
}

// Toggling a preset edits the note in place rather than replacing it, so a
// typed sentence and a clicked one can coexist and either can be removed
// without losing the other.
export function toggleNoteSnippet(note, snippet) {
  const current = (note || '').trim();
  if (!current) return snippet;
  if (current.includes(snippet)) {
    return current
      .replace(snippet, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return `${current} ${snippet}`.trim();
}

export async function fetchMaintenanceState() {
  const { data, error } = await supabase.rpc('aspire_maintenance_state');
  if (error) throw error;
  return normalizeState(data);
}

// The preview the admin approves is produced by the same function that renders
// the real thing, so what they sign off on is what users see.
export async function previewMaintenanceMessage({ reasonId, endsAt, note }) {
  const { data, error } = await supabase.rpc('aspire_compose_maintenance_message', {
    p_reason_id: reasonId || null,
    p_ends_at: endsAt || null,
    p_note: note || null
  });
  if (error) throw error;
  return data || '';
}

export async function setMaintenanceWindow({
  switchOn,
  reasonId,
  auto = false,
  startsAt = null,
  endsAt = null,
  note = null
}) {
  const { data, error } = await supabase.rpc('set_maintenance_window', {
    p_switch_on: !!switchOn,
    p_reason_id: reasonId || null,
    p_auto: !!auto,
    p_starts_at: startsAt || null,
    p_ends_at: endsAt || null,
    p_note: note || null
  });
  if (error) throw error;
  return normalizeState(data);
}

function normalizeState(data) {
  return {
    active: !!data?.active,
    message: data?.message || '',
    reasonId: data?.reason_id || null,
    reasonLabel: data?.reason_label || null,
    note: data?.note || '',
    startsAt: data?.starts_at || null,
    endsAt: data?.ends_at || null,
    auto: !!data?.auto,
    switchOn: !!data?.switch_on,
    updatedAt: data?.updated_at || null
  };
}

// --- datetime-local <-> ISO ------------------------------------------------
//
// A datetime-local input has no timezone: it means "this wall-clock time, here".
// new Date(value) interprets it in the browser's zone, which is the Philippines
// on the machines this runs on, and toISOString() then converts to UTC for
// storage. Round-tripping has to subtract the offset back out, or every saved
// window would shift by eight hours each time the form was reopened.

export function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function fromLocalInputValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatWindow(startsAt, endsAt) {
  if (!startsAt && !endsAt) return '';
  const fmt = (iso) =>
    new Date(iso).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
  if (startsAt && endsAt) return `${fmt(startsAt)} — ${fmt(endsAt)}`;
  return fmt(startsAt || endsAt);
}
