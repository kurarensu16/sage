import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import PageHeader from '../layout/PageHeader';
import ClassRosterDialog from './ClassRosterDialog';
import {
  Users, Layers, Download, Lock, Plus, CheckCircle2, AlertTriangle,
  Loader2, Shuffle, Info, GraduationCap, RefreshCw, Trash2
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { notifyAdminActivity } from '../../lib/notificationDispatcher';
import { toUserMessage } from '../../lib/errorMessages';
import { semesterLabelFromCode, subjectMatchesTermSemester } from '../../lib/subjectCode';
import { cn } from '../../lib/utils';
import {
  fetchActiveTerm, fetchColleges, fetchLoadingCatalog, fetchLoadState,
  buildClaimedSlotKeys, buildLoadSummary, parseSectionName, YEAR_LEVEL_BY_DIGIT,
  acquireLock, touchLock, releaseLock,
  addDraft, finalizeDraft, reassignLoad, deleteDraft, updateDraftSchedule,
  updateClassSchedule, reassignClassFaculty, deleteClassRecord,
  exportLoadToExcel, fetchScheduleOccupancy, checkScheduleConflict,
  fetchAvailableRooms, CLASS_TYPES
} from '../../lib/facultyLoadingService';
import SchedulePanel from './SchedulePanel';
import LoadSummaryTable from './LoadSummaryTable';

// The Faculty Loading & Provisioning workspace.
//
// Rendered by two separate page files -- one Registrar, one Dean -- which each
// declare their own scope explicitly rather than this component sniffing the
// signed-in role. That was the point of the "two pages, not one shared
// component" decision: scope should be stated by the page, not inferred here.
// The UI itself is shared so the two cannot drift apart.
//
// Props:
//   canChooseCollege  Registrar picks any college; Dean is fixed to their own.
//   fixedDepartmentId Dean's college.
//   portalLabel       Breadcrumb text.

const HEARTBEAT_MS = 60000;
// Hand the college back after this long without input. Shorter than the server's
// 3-minute TTL on purpose: an explicit release frees a waiting colleague now,
// where letting the lock lapse makes them sit out the remainder.
const IDLE_RELEASE_MS = 120000;
// Start warning after this much inactivity, so the release is never a surprise:
// the countdown runs for the remaining 90 seconds and any input cancels it.
const IDLE_WARN_AFTER_MS = 30000;
// One second, because the watchdog also drives the visible countdown.
const IDLE_SWEEP_MS = 1000;

const mmss = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'wheel', 'touchstart', 'mousemove', 'scroll'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Class times are a short, known set, so they are chosen rather than typed. A
// native time input accepts 13:44 and any minute in between; min/max only warn
// on submit in most browsers, and nothing stops a mistyped hour reading as a
// real class. These three selects cannot express an invalid time at all.
//
// 12 sits at the end of the AM list and means noon, which is why it is labelled
// rather than left as a bare number -- "12 AM" would otherwise read as midnight.
const MINUTE_STEPS = ['00', '15', '30', '45'];
const AM_HOURS = [7, 8, 9, 10, 11, 12];
const PM_HOURS = [1, 2, 3, 4, 5, 6, 7, 8];

const to24 = (hour12, meridiem) => (meridiem === 'AM' ? hour12 : hour12 + 12);

const splitTime = (value) => {
  if (!value) return { hour12: '', minute: '00', meridiem: 'AM' };
  const [h, m] = String(value).split(':');
  const hour = Number(h);
  return hour <= 12
    ? { hour12: hour, minute: m, meridiem: 'AM' }
    : { hour12: hour - 12, minute: m, meridiem: 'PM' };
};

const hourLabel = (h, meridiem) =>
  (meridiem === 'AM' && h === 12 ? '12 NN' : `${h} ${meridiem}`);

const prettyTime = (value) => {
  if (!value) return '';
  const { hour12, minute, meridiem } = splitTime(value);
  return `${hour12}:${minute} ${meridiem === 'AM' && hour12 === 12 ? 'NN' : meridiem}`;
};

// A labelled field that opens a picker, rather than a row of bare selects. Six
// unlabelled dropdowns side by side gave no way to tell the start from the end.
// Common class lengths, offered once a start time exists.
//
// Picking an end used to be three more clicks -- period, hour, minute -- to
// express something that is almost always "ninety minutes after the start".
// These produce a valid end in one click, and an end produced this way cannot
// precede its start or miss a quarter hour.
const DURATIONS = [
  { label: '1h', minutes: 60 },
  { label: '1h30', minutes: 90 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 }
];

const addMinutes = (time, minutes) => {
  const [h, m] = String(time).split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (total > 20 * 60) return null;  // past the close of the teaching day
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

// `minTime` makes an invalid end unpickable rather than rejected after the
// fact: an hour entirely at or before the start is greyed out, and so are the
// quarters within the start's own hour that would land too early.
function TimeField({ label, value, onChange, minTime = null }) {
  const [open, setOpen] = useState(false);
  // Which way the panel opens. The schedule sits low on a long form, so a panel
  // anchored below the field ran off the bottom of the window and had to be
  // scrolled to -- while the field it belongs to scrolled out of sight. Adding
  // the duration row made it taller and the problem worse.
  //
  // Decided when it opens, from the room actually available, rather than fixed:
  // the same field is near the top of the viewport on a tall screen and at the
  // bottom on a short one.
  const [dropUp, setDropUp] = useState(false);
  const buttonRef = useRef(null);

  // Roughly what the panel needs: period, hours, minutes, plus the duration row
  // when there is one. Over-estimating is safe -- it only flips upward sooner.
  const panelHeight = minTime ? 360 : 300;

  const toggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      // Only flip when below genuinely cannot hold it AND above can do better.
      setDropUp(below < panelHeight && above > below);
    }
    setOpen(!open);
  };

  const { hour12, minute, meridiem } = splitTime(value);
  const hours = meridiem === 'AM' ? AM_HOURS : PM_HOURS;

  const minMinutes = minTime
    ? Number(String(minTime).split(':')[0]) * 60 + Number(String(minTime).split(':')[1])
    : null;
  const tooEarly = (h12, mins, mer) => {
    if (minMinutes === null) return false;
    return to24(Number(h12), mer) * 60 + Number(mins) <= minMinutes;
  };
  // An hour is offered only if at least one of its quarters is still valid.
  const hourDisabled = (h) =>
    minMinutes !== null && MINUTE_STEPS.every((m) => tooEarly(h, m, meridiem));

  const emit = (nextHour, nextMinute, nextMeridiem) => {
    const h24 = to24(Number(nextHour), nextMeridiem);
    // 8 PM closes the teaching day, so it is the one hour with no quarters.
    onChange(`${String(h24).padStart(2, '0')}:${h24 >= 20 ? '00' : nextMinute}`);
  };

  const pill = 'px-2 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
  const chosen = 'bg-sage-600 border-sage-600 text-white';
  const unchosen = 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50';

  return (
    <div className="relative">
      {/* The field names itself on its own first line, filled or empty. A label
          above plus a "Start time" watermark inside would say it twice while
          empty, and a watermark alone would stop saying it the moment a time
          was picked -- which is exactly when two adjacent fields need telling
          apart. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={cn(
          'w-36 px-3 py-1.5 bg-white border rounded-xl text-left transition-colors cursor-pointer',
          open ? 'border-sage-400' : 'border-slate-200 hover:border-slate-300'
        )}
      >
        <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        <span className={cn(
          'block text-xs sm:text-sm font-mono',
          value ? 'text-slate-900' : 'text-slate-300'
        )}>
          {value ? prettyTime(value) : '--:--'}
        </span>
      </button>

      {open && (
        <>
          {/* Backdrop rather than a document listener: it closes on any outside
              click without racing the button's own onClick. */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className={cn(
            'absolute z-30 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 space-y-2.5',
            // A cap plus its own scroll, so even a screen too short for either
            // direction shows a usable panel instead of a clipped one.
            'max-h-[min(22rem,70vh)] overflow-y-auto',
            dropUp ? 'bottom-full mb-1' : 'mt-1'
          )}>
            {/* One click for the common case. Only shown on a field that has a
                start to measure from, and a length that would run past 8 PM is
                simply not offered. */}
            {minTime && (
              <>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Length
                </p>
                <div className="grid grid-cols-4 gap-1">
                  {DURATIONS.map((d) => {
                    const end = addMinutes(minTime, d.minutes);
                    return (
                      <button
                        key={d.label}
                        type="button"
                        disabled={!end}
                        onClick={() => { onChange(end); setOpen(false); }}
                        className={cn(pill, value && value === end ? chosen : unchosen)}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400 pt-0.5 border-t border-slate-100">
                  or set it exactly
                </p>
              </>
            )}

            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Period
            </p>
            <div className="flex gap-1">
              {['AM', 'PM'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    const list = m === 'AM' ? AM_HOURS : PM_HOURS;
                    // Keep the hour if it exists on the other side of noon,
                    // otherwise snap to that half's first hour.
                    emit(list.includes(Number(hour12)) ? hour12 : list[0], minute, m);
                  }}
                  className={cn(pill, 'flex-1', meridiem === m ? chosen : unchosen)}
                >
                  {m}
                </button>
              ))}
            </div>

            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider pt-0.5">
              Hour
            </p>
            <div className="grid grid-cols-4 gap-1">
              {hours.map((h) => (
                <button
                  key={h}
                  type="button"
                  disabled={hourDisabled(h)}
                  onClick={() => emit(h, minute, meridiem)}
                  className={cn(pill, Number(hour12) === h ? chosen : unchosen)}
                >
                  {hourLabel(h, meridiem).replace(` ${meridiem}`, '')}
                </button>
              ))}
            </div>

            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider pt-1.5 border-t border-slate-100">
              Minutes
            </p>
            <div className="grid grid-cols-4 gap-1">
              {MINUTE_STEPS.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={
                    !hour12
                    || to24(Number(hour12), meridiem) >= 20
                    || tooEarly(hour12, m, meridiem)
                  }
                  onClick={() => { emit(hour12, m, meridiem); setOpen(false); }}
                  className={cn(pill, minute === m && hour12 ? chosen : unchosen)}
                >
                  :{m}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function FacultyLoadingWorkspace({
  canChooseCollege = false,
  fixedDepartmentId = null,
  portalLabel = 'Portal'
}) {
  const { user, profile } = useAuth();

  const [term, setTerm] = useState(null);
  const [colleges, setColleges] = useState([]);
  // The target college, used only when the selected college teaches across
  // colleges. General Education's own faculty teach other colleges' students,
  // so "whose students" becomes a question the picker has to ask.
  const [pickTargetCollege, setPickTargetCollege] = useState('');
  const [departmentId, setDepartmentId] = useState(fixedDepartmentId || '');
  const [catalog, setCatalog] = useState({ faculty: [], programs: [], sections: [], subjects: [] });
  const [loadState, setLoadState] = useState({ drafts: [], classes: [] });

  const [tab, setTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Lock
  // Three states, not two. The old shape defaulted to { acquired: false },
  // and the banner rendered on !acquired -- so "another user is editing" was
  // the DEFAULT, shown before the lock had been asked for and, worse, whenever
  // anything earlier in the effect threw. A catalog that failed to load
  // appeared as a colleague holding the college.
  //
  //   pending  — not asked yet, or the attempt failed; say nothing
  //   mine     — this session holds it; editing enabled
  //   theirs   — somebody else holds it; THIS is when the banner is true
  //   idle     — given back on purpose after inactivity, and taken again on the
  //              next input or when the tab is looked at. Distinct from
  //              'theirs' because nobody else is involved: saying a colleague
  //              has it would send someone looking for a person who is not there.
  const [lock, setLock] = useState({ status: 'pending', holderName: '' });
  const heartbeat = useRef(null);
  // Seeded when the lock is acquired, not at render: reading the clock during
  // render is impure, and before the college is held there is nothing to idle
  // out of. The sweep only runs while the status is 'mine', by which point
  // both acquire paths have stamped it.
  const lastActivity = useRef(0);
  const reclaiming = useRef(false);

  // Cascading picker
  const [pickFaculty, setPickFaculty] = useState('');
  const [pickProgram, setPickProgram] = useState('');
  const [pickYear, setPickYear] = useState('');
  const [pickSection, setPickSection] = useState('');
  const [pickSubject, setPickSubject] = useState('');
  // Off by default: the term decides what is offered. A subject taught in both
  // semesters, or a special offering, is the exception the registrar opts into.
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  // What the chosen faculty member and section are already booked for, and
  // whether the slot being typed clashes. Both advisory: add_faculty_load_draft
  // runs the authoritative check inside its own transaction.
  const [occupancy, setOccupancy] = useState([]);
  const [liveConflict, setLiveConflict] = useState(null);
  // A subject with both a lecture and a laboratory is TWO assignments: one
  // meeting pattern cannot hold two different days, times and rooms.
  const [pickClassType, setPickClassType] = useState('lecture');
  const [pickRoom, setPickRoom] = useState('');
  const [roomOptions, setRoomOptions] = useState([]);
  const [pickDays, setPickDays] = useState([]);
  const [pickStart, setPickStart] = useState('');
  const [pickEnd, setPickEnd] = useState('');

  // Dialogs
  // Finalizing is confirmed against a list, never a bare count. Three scopes
  // share one dialog: a single subject, everything for one faculty member, and
  // the whole college. { label, chips, drafts } or null.
  const [finalizing, setFinalizing] = useState(null);
  const [viewingLoad, setViewingLoad] = useState(null);
  // Milliseconds until the college is handed back, or null while there is
  // nothing to warn about. Drives the countdown banner.
  const [idleIn, setIdleIn] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [reassigning, setReassigning] = useState(null);
  const [reassignTo, setReassignTo] = useState('');
  const [confirmFinalized, setConfirmFinalized] = useState(false);
  const [rosterChip, setRosterChip] = useState(null);

  const collegeName = useMemo(
    () => colleges.find((c) => c.department_id === departmentId)?.name || '',
    [colleges, departmentId]
  );

  // Read from the row, never matched on the name -- a rename would silently
  // switch the behaviour off.
  const isCrossCollege = useMemo(
    () => Boolean(colleges.find((c) => c.department_id === departmentId)?.teaches_across_colleges),
    [colleges, departmentId]
  );

  // ── Load ──────────────────────────────────────────────────────────────────
  const refreshLoad = useCallback(async (deptId, activeTerm) => {
    if (!deptId || !activeTerm) return;
    setLoadState(await fetchLoadState(deptId, activeTerm));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [activeTerm, allColleges] = await Promise.all([fetchActiveTerm(), fetchColleges()]);
        setTerm(activeTerm);
        setColleges(allColleges);
        if (fixedDepartmentId) setDepartmentId(fixedDepartmentId);
      } catch (err) {
        setError(toUserMessage(err, 'Could not load the loading workspace.'));
      } finally {
        setLoading(false);
      }
    })();
  }, [fixedDepartmentId]);

  // Scope change: fetch catalog, take the lock, start the heartbeat.
  useEffect(() => {
    if (!departmentId || !term) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const [cat] = await Promise.all([
          fetchLoadingCatalog(departmentId, term, { crossCollege: isCrossCollege })
        ]);
        if (cancelled) return;
        setCatalog(cat);
        await refreshLoad(departmentId, term);

        const result = await acquireLock(departmentId);
        if (cancelled) return;
        lastActivity.current = Date.now();
        setLock({
          status: result?.acquired ? 'mine' : 'theirs',
          holderName: result?.holder_name || ''
        });
      } catch (err) {
        // Explicitly NOT "theirs": a failure here means we do not know who
        // holds the lock, and claiming a colleague does sends someone looking
        // for a person who is not there.
        if (!cancelled) {
          setLock({ status: 'pending', holderName: '' });
          setError(toUserMessage(err, 'Could not open this college for loading.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // isCrossCollege decides how wide the catalogue is, so a change to it has
    // to refetch -- it arrives with the colleges list, after the first render.
  }, [departmentId, term, isCrossCollege, refreshLoad]);

  // Heartbeat while this page holds the college. Stopping on unmount lets the
  // lock lapse within its TTL, which covers a closed tab or a crash that an
  // explicit release never would.
  useEffect(() => {
    if (!departmentId || lock.status !== 'mine') return;
    heartbeat.current = setInterval(async () => {
      const result = await touchLock(departmentId);
      if (!result?.held) setLock({ status: 'theirs', holderName: 'Another user' });
    }, HEARTBEAT_MS);
    return () => clearInterval(heartbeat.current);
  }, [departmentId, lock.status]);

  // Take the college back after an idle release. Everything is re-read rather
  // than trusted: whoever held it meanwhile may have assigned, finalized or
  // reassigned, and a stale catalog would offer sections that are now taken.
  const reclaim = useCallback(async () => {
    if (!departmentId || !term || reclaiming.current) return;
    reclaiming.current = true;
    try {
      const result = await acquireLock(departmentId);
      if (!result?.acquired) {
        setLock({ status: 'theirs', holderName: result?.holder_name || '' });
        return;
      }
      setCatalog(await fetchLoadingCatalog(departmentId, term));
      await refreshLoad(departmentId, term);
      lastActivity.current = Date.now();
      setLock({ status: 'mine', holderName: '' });
    } catch {
      // Staying 'idle' is the safe failure: editing stays disabled and the next
      // input tries again. Flipping to 'theirs' would name a colleague on the
      // strength of a request that never answered.
    } finally {
      reclaiming.current = false;
    }
  }, [departmentId, term, refreshLoad]);

  // Record input, and reclaim at the first sign of life after an idle release.
  // The timestamp lives in a ref so a mousemove never causes a render.
  useEffect(() => {
    if (!departmentId) return;
    const onActivity = () => {
      lastActivity.current = Date.now();
      if (lock.status === 'idle') reclaim();
    };
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
  }, [departmentId, lock.status, reclaim]);

  // Hand the college back once input stops. The heartbeat is stopped first, so
  // a beat cannot land between the decision and the release and re-take a lock
  // this page has just decided to give up.
  useEffect(() => {
    if (!departmentId || lock.status !== 'mine') {
      setIdleIn(null);
      return;
    }
    const sweep = setInterval(async () => {
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor >= IDLE_RELEASE_MS) {
        clearInterval(heartbeat.current);
        setIdleIn(null);
        await releaseLock(departmentId);
        setLock({ status: 'idle', holderName: '' });
        return;
      }
      // Below the warning threshold the countdown is not shown at all, so a
      // registrar reading the page for twenty seconds is not nagged.
      setIdleIn(idleFor >= IDLE_WARN_AFTER_MS ? IDLE_RELEASE_MS - idleFor : null);
    }, IDLE_SWEEP_MS);
    return () => clearInterval(sweep);
  }, [departmentId, lock.status]);

  // A hidden tab has its timers throttled, so the heartbeat can miss enough
  // beats to lapse a lock this page still believes it holds. Re-checking the
  // moment the tab is looked at again closes that window, which matters with one
  // window open per role, where this page spends most of its time hidden.
  useEffect(() => {
    if (!departmentId) return;
    const onVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      lastActivity.current = Date.now();
      if (lock.status === 'mine') {
        const result = await touchLock(departmentId);
        if (!result?.held) reclaim();
      } else if (lock.status === 'idle' || lock.status === 'theirs') {
        reclaim();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [departmentId, lock.status, reclaim]);

  useEffect(() => {
    return () => {
      if (departmentId) releaseLock(departmentId);
    };
  }, [departmentId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const claimed = useMemo(() => buildClaimedSlotKeys(loadState), [loadState]);
  const summary = useMemo(
    () => buildLoadSummary({ ...catalog, ...loadState }),
    [catalog, loadState]
  );
  const openDrafts = useMemo(
    () => loadState.drafts.filter((d) => d.status === 'draft'),
    [loadState.drafts]
  );

  // Year levels available for the chosen program, read from section names.
  const yearOptions = useMemo(() => {
    if (!pickProgram) return [];
    const program = catalog.programs.find((p) => p.program_id === pickProgram);
    const abbr = (program?.abbreviation || '').toUpperCase();
    const digits = new Set();
    for (const section of catalog.sections) {
      const parsed = parseSectionName(section.name);
      if (parsed.parsed && parsed.programAbbr === abbr) digits.add(parsed.yearDigit);
    }
    return [...digits].sort();
  }, [pickProgram, catalog]);

  // For an ordinary college the catalogue already holds only its own programs,
  // so this is every program it has. For General Education the catalogue spans
  // every college, so it narrows to the one being taught for.
  const programOptions = useMemo(() => {
    if (!isCrossCollege) return catalog.programs;
    if (!pickTargetCollege) return [];
    return catalog.programs.filter((p) => p.department_id === pickTargetCollege);
  }, [isCrossCollege, pickTargetCollege, catalog.programs]);

  const sectionOptions = useMemo(() => {
    if (!pickProgram || !pickYear) return [];
    const program = catalog.programs.find((p) => p.program_id === pickProgram);
    const abbr = (program?.abbreviation || '').toUpperCase();
    return catalog.sections.filter((s) => {
      // Sections belong to the target college, not the one doing the loading.
      if (isCrossCollege && pickTargetCollege && s.department_id !== pickTargetCollege) return false;
      const parsed = parseSectionName(s.name);
      return parsed.parsed && parsed.programAbbr === abbr && parsed.yearDigit === pickYear;
    });
  }, [pickProgram, pickYear, catalog, isCrossCollege, pickTargetCollege]);

  // The Class step: a subject already claimed for this section is left out
  // entirely rather than shown disabled, so a collision cannot be picked.
  //
  // Also scoped to the active term's semester. Sections here have always been
  // term-scoped; subjects were fetched by college alone, so a second-semester
  // subject could be loaded into a first-semester term with nothing objecting.
  // That is how DSA123 -- a 2nd-semester code -- came to be taught in
  // AY 2026-2027 1st Semester.
  //
  // The semester is not a column; it is the third digit of the subject code
  // (see src/lib/subjectCode.js). A code that cannot be parsed is always shown.
  const inTermSubjects = useMemo(
    () => catalog.subjects.filter((s) => subjectMatchesTermSemester(s.code, term?.semester)),
    [catalog.subjects, term?.semester]
  );
  const outOfTermCount = catalog.subjects.length - inTermSubjects.length;

  // Show what the chosen faculty member and section are already booked for, as
  // soon as they are chosen -- before any time is typed. The registrar then
  // schedules by looking instead of guessing and being refused.
  useEffect(() => {
    let cancelled = false;
    if (!pickFaculty && !pickSection) {
      setOccupancy([]);
      return undefined;
    }
    fetchScheduleOccupancy({ facultyId: pickFaculty, sectionId: pickSection, term })
      .then((rows) => { if (!cancelled) setOccupancy(rows); });
    return () => { cancelled = true; };
  }, [pickFaculty, pickSection, term]);

  // And check the specific slot as it is typed. Debounced, and only once every
  // part of a schedule exists -- before that there is nothing to check.
  //
  // Advisory only: add_faculty_load_draft runs the same check inside its
  // transaction under an advisory lock, and that is the answer that counts. A
  // snapshot taken while someone types cannot be authoritative.
  useEffect(() => {
    let cancelled = false;
    if (!pickFaculty || !pickSection || !pickDays.length || !pickStart || !pickEnd) {
      setLiveConflict(null);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      checkScheduleConflict({
        facultyId: pickFaculty, sectionId: pickSection,
        days: pickDays, startTime: pickStart, endTime: pickEnd, term
      }).then((hit) => { if (!cancelled) setLiveConflict(hit); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [pickFaculty, pickSection, pickDays, pickStart, pickEnd, term]);

  // Only rooms of the right kind that are actually free at the chosen time.
  // Offering a room that cannot be had is how two classes end up in one room.
  useEffect(() => {
    let cancelled = false;
    fetchAvailableRooms({
      roomType: pickClassType,
      days: pickDays,
      startTime: pickStart,
      endTime: pickEnd,
      term
    }).then((rows) => {
      if (cancelled) return;
      setRoomOptions(rows);
      // A room that was free a moment ago and is not any more must not stay
      // selected: the server would refuse it, after the registrar had moved on.
      setPickRoom((current) =>
        current && !rows.some((r) => r.room_id === current) ? '' : current
      );
    });
    return () => { cancelled = true; };
  }, [pickClassType, pickDays, pickStart, pickEnd, term]);

  const subjectOptions = useMemo(() => {
    if (!pickSection) return [];
    const pool = showAllSubjects ? catalog.subjects : inTermSubjects;
    return pool.filter((s) => !claimed.has(`${s.subject_id}|${pickSection}`));
  }, [pickSection, catalog.subjects, inTermSubjects, showAllSubjects, claimed]);

  const canEdit = lock.status === 'mine' && !!departmentId && !!term;

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!pickFaculty || !pickSection || !pickSubject) return;
    // The schedule is required, not optional. A blank one used to be accepted
    // and skipped conflict detection entirely, so a faculty member could be
    // booked into two classes at the same hour with nothing to catch it.
    if (!pickDays.length) {
      setError('Pick at least one meeting day.');
      return;
    }
    if (!pickStart || !pickEnd) {
      setError('Give both a start time and an end time.');
      return;
    }
    if (pickStart && pickEnd && pickEnd <= pickStart) {
      setError('The end time has to be after the start time.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await addDraft({
        departmentId,
        subjectId: pickSubject,
        sectionId: pickSection,
        facultyId: pickFaculty,
        term,
        days: pickDays,
        startTime: pickStart,
        endTime: pickEnd,
        classType: pickClassType,
        roomId: pickRoom || null
      });
      await refreshLoad(departmentId, term);
      // Several subjects for one faculty member and section, without walking
      // the whole picker again each time.
      //
      // Program, year and section used to be cleared too, so adding a four-
      // subject load meant four complete passes through seven steps. They are
      // kept now: the next subject is almost always for the same section, and
      // anything genuinely different is two clicks away.
      //
      // Subject is cleared, because adding the same one twice is the one thing
      // this screen must not make easy. Days are cleared for the same reason --
      // the next subject rarely meets at the identical slot, and an unchanged
      // day set plus unchanged times is exactly the duplicate the conflict
      // check would have to catch.
      //
      // Times, type and room are kept: a lecture block usually runs the same
      // hour in the same room on different days.
      setPickSubject('');
      setPickDays([]);
      setNotice('Assignment drafted. Add the next subject for this section, or change section. Nothing is visible to students until it is finalized.');
    } catch (err) {
      setError(toUserMessage(err, 'Could not add that assignment.'));
    } finally {
      setBusy(false);
    }
  };

  const runFinalize = async (drafts) => {
    setBusy(true);
    setError('');
    setNotice('');
    let done = 0;
    const failures = [];
    const unenrolled = [];
    for (const draft of drafts) {
      try {
        const outcome = await finalizeDraft(draft, catalog);
        done += 1;
        // The class exists but has nobody in it. Not a failure to finalize, so
        // it does not belong in `failures`, but it must not pass as a clean run.
        if (outcome?.enrollmentError) unenrolled.push(outcome.label);
      } catch (err) {
        failures.push(toUserMessage(err, 'One assignment could not be finalized.'));
      }
    }
    await refreshLoad(departmentId, term);
    if (done) {
      await logActivity(
        'Faculty Loading',
        `Finalized ${done} class(es) for ${collegeName} (${term?.school_year} ${term?.semester}).`,
        resolveActorName(profile, user)
      );
    }
    if (failures.length) setError(failures[0]);
    else if (unenrolled.length) {
      setError(
        `${done} class(es) are now open, but no students were enrolled in ${unenrolled.join(', ')}. ` +
        'Add the section from Enrollment Management.'
      );
    } else setNotice(`${done} class(es) are now open. Students can see them.`);
    setBusy(false);
    setFinalizing(null);
  };

  // Every finalize goes through the dialog, whatever its scope, so the list of
  // what is about to become visible to students is always read first.
  const draftChipsOf = (member) => member.chips.filter((c) => c.state === 'Draft');

  const askFinalizeOne = (chip, memberName) => setFinalizing({
    label: `${chip.label} — ${memberName}`,
    chips: [chip],
    drafts: [chip.draft]
  });

  const askFinalizeFaculty = (member) => {
    const chips = draftChipsOf(member);
    if (!chips.length) return;
    setFinalizing({ label: member.name, chips, drafts: chips.map((c) => c.draft) });
  };

  // Reassign resets its own dialog state, so both entry points go through here
  // rather than calling setReassigning directly and leaving a stale selection.
  const openReassign = (chip) => {
    setReassigning(chip);
    setReassignTo('');
    setConfirmFinalized(false);
  };

  // Drafts are acted on by their own id, live classes by class_record_id. The
  // chip carries both, so neither is inferred from the label.
  const handleEditSchedule = async (chip, schedule) => {
    setBusy(true);
    try {
      if (chip.state === 'Open') await updateClassSchedule(chip.classRecordId, schedule);
      else await updateDraftSchedule(chip.id, schedule);
      await refreshLoad(departmentId, term);
      setNotice(chip.state === 'Open'
        ? 'Class schedule updated. Students see the new time.'
        : 'Schedule updated.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDraft = async (chip) => {
    const live = chip.state === 'Open';
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (live) await deleteClassRecord(chip.classRecordId);
      else await deleteDraft(chip.id);
      await refreshLoad(departmentId, term);
      await logActivity(
        'Faculty Loading',
        `Removed ${live ? 'the class' : 'the draft assignment'} ${chip.label} in ${collegeName}.`,
        resolveActorName(profile, user)
      );
      setNotice(live
        ? 'Class removed, along with its enrolments. The assignment is a draft again.'
        : 'Assignment removed. It was never visible to students.');
    } catch (err) {
      setError(toUserMessage(err, 'Could not remove that assignment.'));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  const askFinalizeAll = () => {
    const chips = summary.flatMap(draftChipsOf);
    if (!chips.length) return;
    setFinalizing({
      label: `${collegeName || 'this college'} — all faculty`,
      chips,
      drafts: chips.map((c) => c.draft)
    });
  };

  const handleReassign = async () => {
    if (!reassigning || !reassignTo) return;
    setBusy(true);
    setError('');
    try {
      // Branch on whether a draft row exists, not on Draft/Open.
      // reassign_faculty_load already supersedes the draft AND repoints the
      // class it produced, which keeps the lineage; reassign_class_faculty is
      // only for classes that were provisioned outside this page and have no
      // draft behind them.
      const result = reassigning.draft
        ? await reassignLoad(reassigning.id, reassignTo)
        : await reassignClassFaculty(reassigning.classRecordId, reassignTo);
      const previous = catalog.faculty.find((f) => f.user_id === result?.previous_faculty_id);
      const next = catalog.faculty.find((f) => f.user_id === reassignTo);

      // Both parties are told: a faculty member should not discover they have
      // gained or lost a class by noticing their list changed.
      await notifyAdminActivity({
        type: 'system',
        title: 'Teaching load changed',
        message: `${reassigning.label} moved from ${previous?.last_name || 'a faculty member'} to ${next?.last_name || 'another faculty member'} in ${collegeName}.`,
        actorName: resolveActorName(profile, user)
      });
      await logActivity(
        'Faculty Loading',
        `Reassigned ${reassigning.label} to ${next?.last_name || 'another faculty member'}.`,
        resolveActorName(profile, user)
      );

      await refreshLoad(departmentId, term);
      setNotice('Reassigned. Enrollments and scores were not affected.');
      setReassigning(null);
      setReassignTo('');
      setConfirmFinalized(false);
    } catch (err) {
      setError(toUserMessage(err, 'Could not reassign that class.'));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () => {
    const ok = exportLoadToExcel({ collegeName, term, summary });
    if (!ok) setError('There is no load to export for this college yet.');
    else setNotice('Faculty load exported.');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader title="Faculty Loading & Provisioning" breadcrumb={portalLabel}>
        <button
          onClick={handleExport}
          disabled={loading || !departmentId}
          className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export</span>
        </button>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        {/* ── Scope ───────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2.5">
          {canChooseCollege ? (
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 cursor-pointer min-w-0 sm:min-w-[18rem]"
            >
              <option value="">Select a college…</option>
              {colleges.map((c) => (
                <option key={c.department_id} value={c.department_id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <GraduationCap className="h-4 w-4 text-sage-700 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                {collegeName || 'Your college'}
              </span>
            </div>
          )}

          <span className="text-[11px] sm:text-xs text-slate-500 sm:ml-auto">
            {term ? `${term.school_year} · ${term.semester}` : 'No active term'}
          </span>

          {departmentId && (
            <button
              onClick={() => refreshLoad(departmentId, term)}
              className="text-[11px] sm:text-xs text-sage-700 hover:text-sage-800 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          )}
        </div>

        {/* ── Lock banner ─────────────────────────────────────────────────── */}
        {departmentId && lock.status === 'mine' && idleIn !== null && !loading && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-center gap-2">
            <Lock className="h-4 w-4 flex-shrink-0" />
            <span>
              Editing pauses in <strong className="font-mono tabular-nums">{mmss(idleIn)}</strong> —
              {' '}{collegeName || 'this college'} is handed back so nobody is kept waiting.
              Move the mouse or press a key to stay.
            </span>
          </div>
        )}

        {departmentId && lock.status === 'idle' && !loading && (
          <div className="bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              Editing paused. {collegeName || 'This college'} was handed back after a
              couple of minutes without activity, so nobody else is kept waiting.
              Click anywhere to carry on — what you typed is still here.
            </span>
          </div>
        )}

        {departmentId && lock.status === 'theirs' && !loading && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>{lock.holderName || 'Another user'}</strong> is editing {collegeName || 'this college'} right
              now — view only. The summary below stays current; assigning, finalizing and
              reassigning resume once they finish.
            </span>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {!departmentId ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
            <Layers className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">Select a college to begin</p>
          </div>
        ) : (
          <>
            {/* ── Tabs ────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-1.5">
              {[
                { id: 'summary', label: 'Load Summary' },
                { id: 'assign', label: 'Assignment' }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer',
                    tab === t.id
                      ? 'bg-sage-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  )}
                >
                  {t.label}
                </button>
              ))}
              {openDrafts.length > 0 && canEdit && (
                <button
                  onClick={askFinalizeAll}
                  disabled={busy}
                  className="ml-auto px-3 py-1.5 text-xs font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Finalize all {openDrafts.length}
                </button>
              )}
              {openDrafts.length > 0 && (
                <span className={cn(
                  'text-[11px] sm:text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg',
                  !canEdit && 'ml-auto'
                )}>
                  {openDrafts.length} draft(s) not yet live
                </span>
              )}
            </div>

            {loading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : tab === 'summary' ? (
              <SummaryTab
                summary={summary}
                canEdit={canEdit}
                busy={busy}
                onFinalizeFaculty={askFinalizeFaculty}
                onViewLoad={setViewingLoad}
              />
            ) : (
              <AssignTab
                catalog={catalog}
                canEdit={canEdit}
                busy={busy}
                pick={{ pickFaculty, pickProgram, pickYear, pickSection, pickSubject, pickDays, pickStart, pickEnd }}
                set={{ setPickFaculty, setPickProgram, setPickYear, setPickSection, setPickSubject, setPickDays, setPickStart, setPickEnd }}
                yearOptions={yearOptions}
                sectionOptions={sectionOptions}
                subjectOptions={subjectOptions}
                termSemester={term?.semester}
                outOfTermCount={outOfTermCount}
                showAllSubjects={showAllSubjects}
                onToggleAllSubjects={setShowAllSubjects}
                occupancy={occupancy}
                liveConflict={liveConflict}
                pickClassType={pickClassType}
                setPickClassType={setPickClassType}
                pickRoom={pickRoom}
                setPickRoom={setPickRoom}
                roomOptions={roomOptions}
                colleges={colleges}
                departmentId={departmentId}
                isCrossCollege={isCrossCollege}
                pickTargetCollege={pickTargetCollege}
                setPickTargetCollege={setPickTargetCollege}
                programOptions={programOptions}
                onAdd={handleAdd}
                summary={summary}
              />
            )}
          </>
        )}
      </div>

      {viewingLoad && (
        <FacultyLoadDialog
          // Re-read from summary so the dialog reflects every refresh behind it;
          // the captured member object would go stale after the first save.
          member={summary.find((m) => m.facultyId === viewingLoad.facultyId) || viewingLoad}
          canEdit={canEdit}
          busy={busy}
          onClose={() => setViewingLoad(null)}
          onEditSchedule={handleEditSchedule}
          onDelete={setDeleting}
          onFinalizeOne={askFinalizeOne}
          onReassign={openReassign}
          onOpenRoster={setRosterChip}
        />
      )}

      {deleting && (
        <FinalizeDialog
          scopeLabel={`Remove ${deleting.label}`}
          chips={[deleting]}
          collegeName={collegeName}
          busy={busy}
          destructive
          onConfirm={() => handleDeleteDraft(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}

      {finalizing && (
        <FinalizeDialog
          scopeLabel={finalizing.label}
          chips={finalizing.chips}
          collegeName={collegeName}
          busy={busy}
          onConfirm={() => runFinalize(finalizing.drafts)}
          onCancel={() => setFinalizing(null)}
        />
      )}

      {rosterChip && (
        <ClassRosterDialog chip={rosterChip} onClose={() => setRosterChip(null)} />
      )}

      {reassigning && (
        <ReassignDialog
          chip={reassigning}
          faculty={catalog.faculty}
          value={reassignTo}
          onChange={setReassignTo}
          busy={busy}
          confirmFinalized={confirmFinalized}
          setConfirmFinalized={setConfirmFinalized}
          onCancel={() => { setReassigning(null); setReassignTo(''); setConfirmFinalized(false); }}
          onConfirm={handleReassign}
        />
      )}
    </>
  );
}

// ── Tab 1: Load Summary ──────────────────────────────────────────────────────
// Confirming against a list rather than a count. "Finalize 4 draft(s)?" cannot
// be checked by the person clicking it; four named subjects can.
function FinalizeDialog({ scopeLabel, chips, collegeName, busy, destructive = false, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full p-5 space-y-3 animate-in zoom-in-95 duration-200">
        <h3 className="text-base font-bold font-display text-slate-900">
          {destructive
            ? 'Remove this assignment?'
            : `Finalize ${chips.length} ${chips.length === 1 ? 'assignment' : 'assignments'}?`}
        </h3>
        <p className="text-xs text-slate-500">
          {destructive
            ? (chips[0]?.state === 'Open'
                ? `${scopeLabel} · ${collegeName}. This is a live class: its enrolments go with it and the assignment returns to being a draft. Refused if any scores or grades have been recorded. This cannot be undone.`
                : `${scopeLabel} · ${collegeName}. It is still a draft, so no student has ever seen it and nothing is lost but the row itself. This cannot be undone.`)
            : `${scopeLabel} · ${collegeName}. Each one becomes a live class that students can see. Up to now they have been invisible.`}
        </p>

        <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {chips.map((chip) => (
            <li key={chip.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
              <span className="font-medium text-slate-800 truncate">{chip.label}</span>
              <span className="font-mono text-slate-500 flex-shrink-0">
                {chip.schedule || 'no schedule'}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 rounded-xl cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-3.5 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Finalize
          </button>
        </div>
      </div>
    </div>
  );
}

// One faculty member's whole load. Drafts can be corrected, removed or
// finalized here; already-open classes are shown but inert, because retiming a
// class that students are enrolled in is a different act with people to tell.
function FacultyLoadDialog({
  member, canEdit, busy, onClose, onEditSchedule, onDelete, onFinalizeOne, onReassign, onOpenRoster
}) {
  const [editing, setEditing] = useState(null);
  const [days, setDays] = useState([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [err, setErr] = useState('');

  const beginEdit = (chip) => {
    setEditing(chip.id);
    setDays(chip.days || []);
    setStart(chip.startTime ? String(chip.startTime).slice(0, 5) : '');
    setEnd(chip.endTime ? String(chip.endTime).slice(0, 5) : '');
    setErr('');
  };

  const save = async (chip) => {
    setErr('');
    try {
      await onEditSchedule(chip, { days, startTime: start, endTime: end });
      setEditing(null);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-2xl w-full p-5 space-y-3 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold font-display text-slate-900 truncate">{member.name}</h3>
            <p className="text-[11px] text-slate-500 font-mono">{member.userNumber}</p>
          </div>
          <div className="text-right text-[11px] text-slate-500 flex-shrink-0">
            {member.days.length ? member.days.join(' · ') : 'No days yet'}
            <br />
            {member.classCount} {member.classCount === 1 ? 'class' : 'classes'} · {member.units} units
          </div>
        </div>

        {err && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2 text-xs">
            {err}
          </div>
        )}

        <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {member.chips.map((chip) => (
            <li key={chip.id} className="px-3 py-2.5 text-xs space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-md border',
                  chip.state === 'Draft'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-sage-50 border-sage-200 text-sage-800'
                )}>
                  {chip.state}
                </span>
                <span className="font-medium text-slate-800">{chip.label}</span>
                <span className="font-mono text-slate-500">{chip.schedule || 'no schedule'}</span>

                <span className="ml-auto flex items-center gap-1.5">
                  {chip.state === 'Open' && (
                    <button
                      onClick={() => onOpenRoster(chip)}
                      className="px-2 py-1 text-[11px] text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Roster
                    </button>
                  )}
                  {canEdit && editing !== chip.id && (
                    <>
                      <button
                        onClick={() => beginEdit(chip)}
                        disabled={busy}
                        className="px-2 py-1 text-[11px] text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onReassign(chip)}
                        disabled={busy}
                        className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer disabled:opacity-50"
                        title="Reassign to another faculty member"
                      >
                        <Shuffle className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(chip)}
                        disabled={busy}
                        className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer disabled:opacity-50"
                        title={chip.state === 'Open'
                          ? 'Remove this class — refused once it has scores or posted grades'
                          : 'Remove this assignment'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      {chip.state === 'Draft' && (
                        <button
                          onClick={() => onFinalizeOne(chip, member.name)}
                          disabled={busy}
                          className="px-2 py-1 text-[11px] font-semibold text-sage-700 border border-sage-200 bg-sage-50 rounded-lg hover:bg-sage-100 cursor-pointer disabled:opacity-50"
                        >
                          Finalize
                        </button>
                      )}
                    </>
                  )}
                </span>
              </div>

              {editing === chip.id && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {DAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
                        className={cn(
                          'px-2 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer',
                          days.includes(d)
                            ? 'bg-sage-600 border-sage-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-end gap-3 flex-wrap">
                    <TimeField label="Start time" value={start} onChange={setStart} />
                    <TimeField label="End time" value={end} onChange={setEnd} minTime={start} />
                    <button
                      onClick={() => save(chip)}
                      disabled={busy}
                      className="ml-auto px-2.5 py-1.5 text-[11px] font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditing(null); setErr(''); }}
                      className="px-2 py-1.5 text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 rounded-xl cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Finalize-all moved up into the tab row, and the per-subject actions moved
// into the Load dialog, so this renders the table and nothing else.
function SummaryTab({ summary, canEdit, busy, onFinalizeFaculty, onViewLoad }) {
  return (
    <>
      <div className="bg-sage-50 border border-sage-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-sage-900 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Unit totals are informational — no institutional cap exists in the system, so nothing is
          flagged as over-limit. <strong>Draft</strong> assignments are invisible to students;
          <strong> Open</strong> ones are live classes.
        </span>
      </div>

      {summary.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
          <Users className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
          <p className="text-sm font-medium text-slate-600">No faculty in this college</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
          {/* Column headers. Hidden on phones, where the same three values are
              restated under the name instead -- four columns do not fit a
              360px screen without truncating the one that matters, the name. */}
          <div className="hidden sm:flex items-center gap-3 bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span className="min-w-0 flex-[2]">Faculty</span>
            <span className="flex-1 text-center">Days in school</span>
            <span className="hidden lg:block flex-1 text-center">Status</span>
            <span className="w-16 text-center flex-shrink-0">Classes</span>
            <span className="w-16 text-center flex-shrink-0">Units</span>
            <span className="w-36 text-right flex-shrink-0">Load</span>
          </div>

          {summary.map((member) => (
            <div key={member.facultyId} className="p-3.5 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-[2]">
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{member.name}</h3>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-mono truncate">{member.userNumber}</p>
                  <p className="sm:hidden text-[10px] text-slate-500 mt-0.5">
                    {member.days.length ? member.days.join(' · ') : 'No days yet'}
                    {' — '}
                    {member.classCount} {member.classCount === 1 ? 'class' : 'classes'}
                    {member.draftCount > 0 && ` · ${member.draftCount} draft`}
                  </p>
                </div>
                <span className="hidden sm:block flex-1 text-center text-xs font-mono text-slate-600">
                  {member.days.length
                    ? member.days.join(' · ')
                    : <span className="font-sans text-slate-300">—</span>}
                </span>
                <span className="hidden lg:flex flex-1 items-center justify-center gap-1 flex-wrap">
                  {member.draftCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
                      {member.draftCount} draft
                    </span>
                  )}
                  {member.openCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-sage-50 border border-sage-200 text-sage-800">
                      {member.openCount} open
                    </span>
                  )}
                  {member.classCount === 0 && <span className="text-xs text-slate-300">—</span>}
                </span>
                <span className="hidden sm:block w-16 text-center flex-shrink-0 text-sm font-mono font-bold text-slate-900 tabular-nums">
                  {member.classCount}
                </span>
                <span className="w-16 text-center text-xs sm:text-sm font-mono font-bold text-slate-900 tabular-nums flex-shrink-0">
                  {member.units} <span className="font-sans font-normal text-slate-400 sm:hidden">units</span>
                </span>
                <span className="w-36 flex-shrink-0 flex items-center justify-end gap-1.5">
                  {canEdit && member.draftCount > 0 && (
                    <button
                      onClick={() => onFinalizeFaculty(member)}
                      disabled={busy}
                      className="px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-sage-700 border border-sage-200 bg-sage-50 hover:bg-sage-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Finalize {member.draftCount}
                    </button>
                  )}
                  {member.classCount > 0 && (
                    <button
                      onClick={() => onViewLoad(member)}
                      className="px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                    >
                      View
                    </button>
                  )}
                </span>
              </div>

            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Declared at module scope, not inside AssignTab. A component defined during
// render is a new type on every keystroke, so React unmounts and remounts the
// select inside it and the dropdown loses focus mid-interaction.
function Step({ n, label, children, enabled }) {
  return (
    <div className={cn('flex flex-col gap-1.5', !enabled && 'opacity-50 pointer-events-none')}>
      <label className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider">
        {n}. {label}
      </label>
      {children}
    </div>
  );
}

// ── Tab 2: Cascading picker ──────────────────────────────────────────────────
function AssignTab({
  catalog, canEdit, busy, pick, set, yearOptions, sectionOptions, subjectOptions,
  termSemester, outOfTermCount, showAllSubjects, onToggleAllSubjects,
  occupancy, liveConflict, pickClassType, setPickClassType,
  pickRoom, setPickRoom, roomOptions,
  colleges, departmentId, isCrossCollege,
  pickTargetCollege, setPickTargetCollege, programOptions, onAdd, summary
}) {
  const { pickFaculty, pickProgram, pickYear, pickSection, pickSubject, pickDays, pickStart, pickEnd } = pick;
  const { setPickFaculty, setPickProgram, setPickYear, setPickSection, setPickSubject, setPickDays, setPickStart, setPickEnd } = set;
  const toggleDay = (d) =>
    setPickDays(pickDays.includes(d) ? pickDays.filter((x) => x !== d) : [...pickDays, d]);
  const current = summary.find((m) => m.facultyId === pickFaculty);

  // Say what is still missing rather than leaving a grey button to be puzzled
  // over. Read in step order so the sentence matches the numbered fields.
  // Listed in the order the fields are actually asked, which differs between
  // the two modes -- a sentence that names them out of order sends the reader
  // up the form instead of down it.
  const missing = (
    isCrossCollege
      ? [
          !pickTargetCollege && 'the college being taught',
          !pickProgram && 'a program',
          !pickFaculty && 'a faculty member'
        ]
      : [!pickFaculty && 'a faculty member']
  ).concat([
    !pickSection && 'a section',
    !pickSubject && 'a subject',
    !pickDays.length && 'at least one day',
    (!pickStart || !pickEnd) && 'a start and end time',
    !pickRoom && 'a room'
  ]).filter(Boolean);

  const selectClass =
    'w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 cursor-pointer disabled:bg-slate-50';

  // The picker asks its questions in a different ORDER for a college that
  // teaches other colleges' students.
  //
  //   Ordinary college   faculty -> program -> year -> section -> subject
  //   General Education  COLLEGE -> program -> faculty -> year -> section -> subject
  //
  // General Education teaches everyone, so "whose students" has to be settled
  // before anything else means anything: the programs and sections on offer
  // belong to the target college, not to the one doing the loading. Its own
  // faculty are then chosen once the target is known.
  //
  // Each step is built once and placed by the order below, rather than written
  // twice with different numbers -- two copies would drift the first time one
  // of them was edited.
  const stepFaculty = (n) => (
    <Step key="faculty" n={n} label="Faculty" enabled={canEdit && (!isCrossCollege || !!pickProgram)}>
      <select
        value={pickFaculty}
        onChange={(e) => {
          setPickFaculty(e.target.value);
          // Clearing the downstream picks only applies to the ordinary order,
          // where program comes AFTER faculty. For General Education, program
          // and college were settled first and changing the instructor must not
          // throw them away.
          if (!isCrossCollege) {
            setPickProgram(''); setPickYear(''); setPickSection(''); setPickSubject('');
          }
        }}
        className={selectClass}
      >
        <option value="">Select faculty…</option>
        {catalog.faculty.map((f) => (
          <option key={f.user_id} value={f.user_id}>
            {f.last_name}, {f.first_name}
          </option>
        ))}
      </select>
    </Step>
  );

  const stepCollege = (n) => (
    <Step key="college" n={n} label="College" enabled={canEdit}>
      <select
        value={pickTargetCollege}
        onChange={(e) => {
          setPickTargetCollege(e.target.value);
          setPickProgram(''); setPickYear(''); setPickSection(''); setPickSubject('');
        }}
        className={selectClass}
      >
        <option value="">Select college…</option>
        {colleges
          .filter((c) => c.department_id !== departmentId)
          .map((c) => (
            <option key={c.department_id} value={c.department_id}>{c.name}</option>
          ))}
      </select>
    </Step>
  );

  const stepProgram = (n) => (
    <Step
      key="program"
      n={n}
      label="Program"
      enabled={canEdit && (isCrossCollege ? !!pickTargetCollege : !!pickFaculty)}
    >
      <select
        value={pickProgram}
        onChange={(e) => { setPickProgram(e.target.value); setPickYear(''); setPickSection(''); setPickSubject(''); }}
        className={selectClass}
      >
        <option value="">Select program…</option>
        {programOptions.map((p) => (
          <option key={p.program_id} value={p.program_id}>{p.abbreviation || p.name}</option>
        ))}
      </select>
    </Step>
  );

  const stepYear = (n) => (
    <Step
      key="year"
      n={n}
      label="Year Level"
      enabled={canEdit && !!pickProgram && (!isCrossCollege || !!pickFaculty)}
    >
      <select
        value={pickYear}
        onChange={(e) => { setPickYear(e.target.value); setPickSection(''); setPickSubject(''); }}
        className={selectClass}
      >
        <option value="">Select year…</option>
        {yearOptions.map((d) => (
          <option key={d} value={d}>{YEAR_LEVEL_BY_DIGIT[d] || `Year ${d}`}</option>
        ))}
      </select>
    </Step>
  );

  const stepSection = (n) => (
    <Step key="section" n={n} label="Section" enabled={canEdit && !!pickYear}>
      <select
        value={pickSection}
        onChange={(e) => { setPickSection(e.target.value); setPickSubject(''); }}
        className={selectClass}
      >
        <option value="">Select section…</option>
        {sectionOptions.map((s) => (
          <option key={s.section_id} value={s.section_id}>{s.name}</option>
        ))}
      </select>
    </Step>
  );

  const orderedSteps = isCrossCollege
    ? [stepCollege, stepProgram, stepFaculty, stepYear, stepSection]
    : [stepFaculty, stepProgram, stepYear, stepSection];

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {orderedSteps.map((step, index) => step(index + 1))}

          {/* Subject sits in the SAME grid as the steps before it, spanning two
              columns. In the General Education order that puts Section and
              Subject side by side on the second row; in the ordinary order it
              gives Subject the width its "CODE — Full Subject Name" options
              need. A row of its own left Section stranded alone above it. */}
          <div className="sm:col-span-2">
          <Step n={orderedSteps.length + 1} label="Subject" enabled={canEdit && !!pickSection}>
            <select
              value={pickSubject}
              onChange={(e) => setPickSubject(e.target.value)}
              className={selectClass}
            >
              <option value="">Select subject…</option>
              {subjectOptions.map((s) => {
                // The semester a subject belongs to is the third digit of its
                // code. Labelled only when it does not match the active term,
                // which can only happen with the override on -- so the label
                // marks the exception rather than repeating the obvious.
                const label = semesterLabelFromCode(s.code);
                const outOfTerm = !subjectMatchesTermSemester(s.code, termSemester);
                return (
                  <option key={s.subject_id} value={s.subject_id}>
                    {s.code} — {s.name}{outOfTerm && label ? ` (${label})` : ''}
                  </option>
                );
              })}
            </select>
            {outOfTermCount > 0 && (
              <label className="flex items-start gap-2 mt-2 text-[11px] text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllSubjects}
                  onChange={(e) => onToggleAllSubjects(e.target.checked)}
                  className="mt-0.5 cursor-pointer"
                />
                <span>
                  Show all subjects, including the {outOfTermCount} for another semester.
                  {' '}Normally only this term&rsquo;s subjects are offered.
                </span>
              </label>
            )}
          </Step>
          </div>
        </div>

        {/* Step 6: meeting pattern. REQUIRED -- conflict detection is driven
            entirely off these three values, so an assignment without them is an
            assignment nothing can check. One pattern per class: this cannot
            express a split lecture/lab timetable. */}
        <div className={cn('pt-1', !(canEdit && pickSubject) && 'opacity-50 pointer-events-none')}>
          <label className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
            {orderedSteps.length + 2}. Schedule <span className="font-normal normal-case text-rose-500">— required</span>
          </label>
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer',
                  pickDays.includes(d)
                    ? 'bg-sage-600 border-sage-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <TimeField label="Start time" value={pickStart} onChange={setPickStart} />
            <TimeField label="End time" value={pickEnd} onChange={setPickEnd} minTime={pickStart} />
            {(pickDays.length > 0 || pickStart || pickEnd) && (
              <button
                type="button"
                onClick={() => { setPickDays([]); setPickStart(''); setPickEnd(''); }}
                className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          {/* Kind and place. A subject with a laboratory is added twice --
              once as a lecture, once as a laboratory -- because one meeting
              pattern cannot hold two different days, times and rooms. */}
          <div className="flex flex-wrap items-end gap-3 mt-3">
            <div className="min-w-[9rem]">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Class type
              </label>
              <select
                value={pickClassType}
                onChange={(e) => setPickClassType(e.target.value)}
                disabled={!canEdit}
                className={selectClass}
              >
                {CLASS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[12rem] flex-1">
              {/* Required, like the schedule and for the same reason: a blank
                  room skips find_room_conflict() entirely, so accepting one
                  would let two classes share a room with nothing to catch it. */}
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Room <span className="font-normal normal-case tracking-normal text-rose-500">— required</span>
              </label>
              <select
                value={pickRoom}
                onChange={(e) => setPickRoom(e.target.value)}
                disabled={!canEdit}
                className={selectClass}
              >
                <option value="">Select room…</option>
                {roomOptions.map((r) => (
                  <option key={r.room_id} value={r.room_id}>{r.code}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            {/* Availability, not a catalogue: a room that is busy at this time
                is absent rather than shown and then refused.
                An empty list has two very different causes, and saying "none
                are free" when none EXIST sends the registrar hunting for a
                clash that was never there. */}
            {roomOptions.length === 0
              ? (!pickDays.length || !pickStart || !pickEnd
                  ? 'No rooms have been set up yet. Add them in Academic Setup.'
                  : `Every ${pickClassType === 'laboratory' ? 'laboratory' : 'lecture room'} is taken at that time — or none have been set up yet.`)
              : `${roomOptions.length} ${pickClassType === 'laboratory' ? 'laborator' + (roomOptions.length === 1 ? 'y' : 'ies') : 'lecture room' + (roomOptions.length === 1 ? '' : 's')} free at that time.`}
          </p>

          <p className="text-[10px] text-slate-400 mt-1.5">
            Days and both times are needed before an assignment can be added. The system then
            refuses a clash with any other class this faculty member, section or room already has —
            checked across every college, since General Education faculty teach outside their own.
          </p>

          {/* What is taken, and whether this slot clashes — shown while the
              schedule is being chosen rather than after Add refuses it. */}
          <div className="mt-3">
            <SchedulePanel
              occupancy={occupancy}
              conflict={liveConflict}
              hasFaculty={Boolean(pickFaculty)}
              hasSection={Boolean(pickSection)}
            />
          </div>
        </div>

        {/* Add belongs AFTER step 6, not beside step 5. With the button inside
            the 1-5 grid it sat above the last required field, so the natural
            reading order reached a disabled button before the schedule that
            disables it. */}
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <button
            onClick={onAdd}
            disabled={
              !canEdit || busy || !pickFaculty || !pickSection || !pickSubject
              // The schedule in step 6 counts toward "complete" now. handleAdd
              // still validates, so a stale render cannot slip a blank one past.
              || !pickDays.length || !pickStart || !pickEnd
              // A room is required: without one, find_room_conflict() returns
              // NULL and the room check is skipped altogether.
              || !pickRoom
              // A clash the panel is already showing. The server refuses it
              // regardless, under an advisory lock; disabling here just stops
              // the pointless round trip.
              || Boolean(liveConflict)
            }
            className="px-3.5 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
          {canEdit && missing.length > 0 && (
            <span className="text-[11px] sm:text-xs text-slate-500">
              Still needed: {missing.join(', ')}.
            </span>
          )}
        </div>

        {pickSection && subjectOptions.length === 0 && (
          <p className="text-[11px] sm:text-xs text-slate-500">
            Every subject for this section is already assigned this term. A class already taken is
            not offered here — use Reassign on the Load Summary to change who teaches it.
          </p>
        )}
      </div>

      {current && current.chips.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5">
          <h3 className="text-xs sm:text-sm font-semibold font-display text-slate-900 mb-2">
            {current.name} — {current.units} units so far
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {current.chips.map((chip) => (
              <span
                key={chip.id}
                className={cn(
                  'text-[10px] sm:text-xs border rounded-lg px-2 py-1',
                  chip.state === 'Draft'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                )}
              >
                {chip.label} <span className="opacity-60">{chip.state}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* The whole term, in timetable order. The chips above answer "what does
          this one person teach"; this answers "does the timetable work", which
          is not visible from any single faculty card. */}
      <LoadSummaryTable summary={summary} />
    </>
  );
}

// ── Reassign ─────────────────────────────────────────────────────────────────
function ReassignDialog({
  chip, faculty, value, onChange, busy, confirmFinalized, setConfirmFinalized, onCancel, onConfirm
}) {
  const isLive = chip.state === 'Open';
  const blocked = isLive && !confirmFinalized;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full p-5 space-y-3.5">
        <h3 className="text-base font-bold font-display text-slate-900">Reassign {chip.label}</h3>

        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 cursor-pointer"
        >
          <option value="">Select the replacement faculty…</option>
          {faculty.map((f) => (
            <option key={f.user_id} value={f.user_id}>{f.last_name}, {f.first_name}</option>
          ))}
        </select>

        {isLive ? (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[11px] sm:text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                This class is <strong>already live</strong> and students may be attending under the
                current faculty. Enrollments, scores and the join code are kept — only who teaches
                it changes. Both faculty members are notified.
              </span>
            </div>
            <label className="flex items-start gap-2 text-[11px] sm:text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmFinalized}
                onChange={(e) => setConfirmFinalized(e.target.checked)}
                className="mt-0.5 cursor-pointer"
              />
              I understand this changes a class that is already running.
            </label>
          </>
        ) : (
          <p className="text-[11px] sm:text-xs text-slate-500">
            This assignment is still a draft, so nothing is visible to students yet.
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={busy || !value || blocked}
            className="flex-1 px-3.5 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
            Reassign
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-3.5 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
