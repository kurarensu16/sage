import { supabase } from './supabase';

// Learning resources a faculty member attaches to one activity.
//
// WHY THEY LIVE ON THE ACTIVITY
// The alternative considered was a global table keyed by topic tag, curated
// from a page of its own. Faculty already type the topic tag on the activity
// form, so the material is in hand at that moment; a separate page asks them to
// recall it weeks later, which is how that page ends up empty. Attaching to the
// activity also scopes better -- two sections of one subject may use different
// materials, and each student gets their own instructor's.
//
// WHAT THE TUTOR DOES WITH THEM
// Today: lists them, and tells the student what each covers using the note.
// The file itself is never read, which is what keeps this affordable on any
// model. When a provider that reads documents is adopted, an extract is stored
// once at attach time -- never re-read per student question.

export const RESOURCE_MAX = 3;
export const RESOURCE_KINDS = Object.freeze({ LINK: 'link', FILE: 'file' });

export const emptyResource = () => ({ resource_id: null, label: '', url: '', note: '' });

/**
 * Is this row good enough to save?
 *
 * http/https only, matching the database CHECK. Students click these, so a
 * `javascript:` or `data:` URL would be a scripting hole dressed as a reading
 * list. Refused here for a clear message, and again at the column because this
 * form is not the only possible writer.
 */
export function describeResource(row) {
  const label = (row?.label || '').trim();
  const url = (row?.url || '').trim();

  if (!label && !url) return { ok: true, empty: true, message: '' };
  if (!label) return { ok: false, empty: false, message: 'Give this resource a short name.' };
  if (!url) return { ok: false, empty: false, message: 'Add the link for this resource.' };
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, empty: false, message: 'The link must start with http:// or https://' };
  }
  return { ok: true, empty: false, message: '' };
}

/** Rows worth keeping, with blank ones dropped. */
export const usableResources = (rows = []) =>
  rows.filter((r) => !describeResource(r).empty);

export const firstResourceProblem = (rows = []) => {
  for (const row of rows) {
    const check = describeResource(row);
    if (!check.ok) return check.message;
  }
  return '';
};

export async function fetchActivityResources(activityId) {
  if (!activityId) return [];
  const { data, error } = await supabase
    .from('activity_resources')
    .select('resource_id, label, url, note, kind, sort_order')
    .eq('activity_id', activityId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []).map((r) => ({
    resource_id: r.resource_id,
    label: r.label || '',
    url: r.url || '',
    note: r.note || ''
  }));
}

/**
 * Save the list for one activity.
 *
 * Diffed by resource_id rather than cleared and re-inserted, so a row that did
 * not change keeps its id, its created_at and who added it. Clearing first
 * would also leave a window where an activity has no resources at all, which a
 * student could land in.
 */
export async function saveActivityResources(activityId, rows = []) {
  if (!activityId) return;

  const keep = usableResources(rows);
  const existing = await fetchActivityResources(activityId);

  const keptIds = new Set(keep.map((r) => r.resource_id).filter(Boolean));
  const removed = existing.filter((r) => !keptIds.has(r.resource_id));

  if (removed.length) {
    const { error } = await supabase
      .from('activity_resources')
      .delete()
      .in('resource_id', removed.map((r) => r.resource_id));
    if (error) throw error;
  }

  const { data: { user } } = await supabase.auth.getUser();

  const updates = keep
    .map((r, index) => ({ row: r, index }))
    .filter(({ row }) => row.resource_id);

  for (const { row, index } of updates) {
    const { error } = await supabase
      .from('activity_resources')
      .update({
        label: row.label.trim(),
        url: row.url.trim(),
        note: (row.note || '').trim() || null,
        sort_order: index
      })
      .eq('resource_id', row.resource_id);
    if (error) throw error;
  }

  const inserts = keep
    .map((r, index) => ({ row: r, index }))
    .filter(({ row }) => !row.resource_id)
    .map(({ row, index }) => ({
      activity_id: activityId,
      label: row.label.trim(),
      url: row.url.trim(),
      note: (row.note || '').trim() || null,
      kind: RESOURCE_KINDS.LINK,
      sort_order: index,
      added_by: user?.id || null
    }));

  if (inserts.length) {
    const { error } = await supabase.from('activity_resources').insert(inserts);
    if (error) throw error;
  }
}
