import { useEffect, useState } from 'react';
import { Bell, Inbox, Loader2, Mail } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  categorySupportsEmail, getPreferenceCategories, isCategoryEnabled,
  loadNotificationPreferences, saveCategoryPreference
} from '../../lib/notificationPreferences';

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "w-11 h-6 rounded-full p-0.5 transition-colors duration-200 ease-in-out cursor-pointer flex-shrink-0 relative focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-sage-600" : "bg-slate-300"
      )}
    >
      <span className={cn(
        "block w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ease-in-out",
        checked ? "translate-x-5" : "translate-x-0"
      )} />
    </button>
  );
}

export default function NotificationPreferences({ userId, role }) {
  const categories = getPreferenceCategories(role);
  const [preferences, setPreferences] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadNotificationPreferences(userId)
      .then(data => { if (!cancelled) setPreferences(data); })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load your notification preferences.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  async function change(category, channel, enabled) {
    const key = `${category.key}:${channel}`;
    setSaving(key);
    setError('');
    try {
      setPreferences(await saveCategoryPreference(userId, preferences, category, channel, enabled));
    } catch (err) {
      setError(err.message || 'Your change could not be saved. Try again.');
    } finally {
      setSaving('');
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-sm space-y-5">
      <div>
        <h3 className="text-base font-bold text-slate-900 font-display">Notification Preferences</h3>
        <p className="text-xs text-slate-500 mt-0.5">Choose how ASPIRE alerts you. Changes save automatically.</p>
      </div>

      <div className="p-3 rounded-xl border border-sage-200 bg-sage-50 flex items-start gap-2.5 text-xs text-sage-900">
        <Inbox className="h-4 w-4 text-sage-600 shrink-0 mt-0.5" />
        <span>Every notice is always kept in your in-app Notifications inbox. These settings only control device alerts and email.</span>
      </div>

      {error && <p role="alert" className="text-xs rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-3">{error}</p>}

      {loading ? (
        <div role="status" className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading preferences…</div>
      ) : (
        <div className="space-y-3">
          {categories.map(category => {
            const emailCapable = categorySupportsEmail(category);
            return (
              <div key={category.key} className="p-3.5 rounded-xl border border-slate-200/70 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">{category.label}</h4>
                  <p className="text-[11px] text-slate-500">{category.description}</p>
                </div>
                <div className="flex items-center gap-5 shrink-0">
                  <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                    <Bell className="h-3.5 w-3.5" />Device
                    <Toggle
                      label={`Device alerts for ${category.label}`}
                      checked={isCategoryEnabled(preferences, category, 'push')}
                      disabled={Boolean(saving)}
                      onChange={value => change(category, 'push', value)}
                    />
                  </label>
                  {emailCapable ? (
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                      <Mail className="h-3.5 w-3.5" />Email
                      <Toggle
                        label={`Email for ${category.label}`}
                        checked={isCategoryEnabled(preferences, category, 'email')}
                        disabled={Boolean(saving)}
                        onChange={value => change(category, 'email', value)}
                      />
                    </label>
                  ) : (
                    <span className="text-[11px] text-slate-400 w-24 text-right">No email for this type</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
