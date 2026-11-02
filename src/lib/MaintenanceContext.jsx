/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';

// Maintenance mode state, shared by the layout guard, the banner, and the toast.
//
// Transport mirrors the proven pattern in AuthContext.jsx: a Realtime
// postgres_changes subscription plus a low-cost polling fallback, because
// Realtime can be momentarily unavailable and a maintenance flag that arrives
// late defeats the purpose. The table is registered with the supabase_realtime
// publication in 20261029052220; if that registration is missing the poller
// still carries the feature, just a few seconds slower.
//
// THE ONE SUBTLE RULE -- active session versus new login
//
//   The confirmed behaviour is a soft cutover: people already working keep
//   working and get a notice, while someone signing in during the window sees a
//   dedicated screen instead of a half-working portal. Those are different
//   outcomes for the same flag value, so the flag alone cannot decide.
//
//   What distinguishes them is WHEN the session learned about it:
//     * Maintenance was ALREADY on when this app instance first read the row
//       -> treat as a new arrival -> MaintenanceScreen (`blocking` = true).
//     * Maintenance flipped on while this instance was already running
//       -> treat as an active session -> toast + banner, never blocked.
//
//   `blocking` is therefore latched from the FIRST read and deliberately not
//   recomputed afterwards. Without the latch, a user working through the window
//   would be ejected the moment any unrelated re-render re-evaluated the flag.

const MaintenanceContext = createContext({
  maintenanceMode: false,
  maintenanceMessage: '',
  updatedAt: null,
  blocking: false,
  justStarted: false,
  acknowledgeStart: () => {},
  refresh: async () => {}
});

const POLL_MS = 4000;

export function MaintenanceProvider({ children }) {
  const { session, profile, loading } = useAuth();
  const role = profile?.role ?? null;

  const [state, setState] = useState({
    maintenanceMode: false,
    maintenanceMessage: '',
    updatedAt: null,
    // The window behind the state, for the admin page and the notice.
    reasonId: null,
    reasonLabel: null,
    note: '',
    startsAt: null,
    endsAt: null,
    auto: false,
    switchOn: false
  });
  // null until the first successful read, so `blocking` is not decided on a
  // guess while the row is still in flight.
  const [initialMode, setInitialMode] = useState(null);
  const [justStarted, setJustStarted] = useState(false);

  const previousMode = useRef(null);
  const latchedInitial = useRef(false);

  const applyRow = (row) => {
    if (!row) return;
    const next = {
      // `active`, not the raw switch: an automatic window closes the system
      // without the switch ever being flipped.
      maintenanceMode: !!row.active,
      maintenanceMessage: row.message || '',
      updatedAt: row.updated_at || null,
      reasonId: row.reason_id || null,
      reasonLabel: row.reason_label || null,
      note: row.note || '',
      startsAt: row.starts_at || null,
      endsAt: row.ends_at || null,
      auto: !!row.auto,
      switchOn: !!row.switch_on
    };
    setState(next);

    if (!latchedInitial.current) {
      latchedInitial.current = true;
      setInitialMode(next.maintenanceMode);
    } else if (previousMode.current === false && next.maintenanceMode === true) {
      // Only a false -> true transition raises the one-time notice. Turning
      // maintenance off stays silent, per the confirmed decision.
      setJustStarted(true);
    }

    previousMode.current = next.maintenanceMode;
  };

  // Read through the function, never the table. An automatic window becomes
  // active because the clock passed its start time, not because any row
  // changed, so only the server can answer "is it active right now".
  const read = async () => {
    const { data, error } = await supabase.rpc('aspire_maintenance_state');
    if (error) {
      // A failed read must not lock anyone out: an unreachable database is an
      // outage to be surfaced elsewhere, not a reason to assert maintenance.
      console.warn('Maintenance state read failed:', error.message);
      return;
    }
    applyRow(data);
  };

  useEffect(() => {
    if (loading || !session) return;

    read();
    const poll = setInterval(read, POLL_MS);

    const channel = supabase
      .channel('realtime-system-settings')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'system_settings' },
        // Re-read rather than applying the row: the payload carries the stored
        // columns, not the computed state, and the message is composed
        // server-side from the reason, the window and the note.
        () => read()
      )
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session]);

  // Reset the latch on sign-out so the next sign-in is evaluated fresh rather
  // than inheriting the previous session's verdict.
  useEffect(() => {
    if (!session) {
      latchedInitial.current = false;
      previousMode.current = null;
      setInitialMode(null);
      setJustStarted(false);
    }
  }, [session]);

  const isAdmin = role === 'admin';

  const value = {
    ...state,
    // Admin is exempt: whoever is performing the maintenance has to stay able to
    // reach the toggle that ends it.
    blocking: !isAdmin && initialMode === true && state.maintenanceMode === true,
    justStarted: justStarted && !isAdmin && state.maintenanceMode === true,
    acknowledgeStart: () => setJustStarted(false),
    refresh: read
  };

  return <MaintenanceContext.Provider value={value}>{children}</MaintenanceContext.Provider>;
}

export function useMaintenance() {
  return useContext(MaintenanceContext);
}
