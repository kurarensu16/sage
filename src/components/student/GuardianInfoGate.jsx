import { useState, useEffect } from 'react';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

const RELATIONSHIP_OPTIONS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Other'];

// Required guardian/parent contact field (product decision, 2026-10-03): students cannot use
// the portal until a primary guardian contact is on file. No consent checkbox — the team
// explicitly chose to treat this like a standard institutional emergency-contact requirement
// rather than an opt-in flow. Hard block: this renders as a non-dismissable modal over the
// entire portal (not a route) so it reappears every login until the record is complete, and
// nothing behind it is reachable while it's open.
export default function GuardianInfoGate() {
  const { profile, user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [satisfied, setSatisfied] = useState(true);
  const [fullName, setFullName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function checkGuardian() {
      if (!user?.id || profile?.role !== 'student') {
        if (!cancelled) {
          setChecking(false);
          setSatisfied(true);
        }
        return;
      }
      setChecking(true);
      const { data, error: fetchError } = await supabase
        .from('guardians')
        .select('full_name, relationship, email')
        .eq('student_id', user.id)
        .eq('is_primary', true)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError) {
        // Fail open on a read error (e.g. transient network issue) rather than locking a
        // student out of their own portal over a connectivity blip — the save path below
        // still validates everything server-side the next time this runs.
        console.warn('GuardianInfoGate: could not check guardian record:', fetchError);
        setChecking(false);
        setSatisfied(true);
        return;
      }

      const complete = Boolean(data?.full_name?.trim() && data?.relationship?.trim() && data?.email?.trim());
      setSatisfied(complete);
      setChecking(false);
    }

    checkGuardian();
    return () => { cancelled = true; };
  }, [user?.id, profile?.role]);

  if (checking || satisfied) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !relationship || !trimmedEmail) {
      setError('Guardian name, relationship, and email are all required.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setSaving(true);
    const { error: rpcError } = await supabase.rpc('upsert_primary_guardian', {
      p_full_name: trimmedName,
      p_relationship: relationship,
      p_email: trimmedEmail
    });
    setSaving(false);

    if (rpcError) {
      // Hide technical SQL/Schema errors from the user
      if (rpcError.message?.includes('schema cache') || rpcError.message?.includes('Could not find the function')) {
        setError('An unexpected issue occurred while saving your contact details. Please try again shortly.');
      } else {
        setError(rpcError.message || 'Could not save guardian information. Please try again.');
      }
      return;
    }
    setSatisfied(true);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-50 rounded-lg text-amber-600 border border-amber-100 flex-shrink-0">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">Guardian Contact Required</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              A parent or guardian contact is required on file before you can continue. This
              contact will receive academic updates whenever an official grade is posted.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Guardian Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Maria Santos"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
              disabled={saving}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Relationship to Student</label>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500 bg-white"
              disabled={saving}
            >
              <option value="">Select relationship</option>
              {RELATIONSHIP_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Guardian Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="guardian@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
              disabled={saving}
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sage-700 hover:bg-sage-800 text-white text-sm font-bold py-2.5 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving...' : 'Save and Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
