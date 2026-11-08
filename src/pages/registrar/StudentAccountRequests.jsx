import { useState, useEffect, useRef, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import * as XLSX from 'xlsx';
import {
  Upload, Download, Send, AlertTriangle, CheckCircle2, XCircle,
  Clock, Loader2, Info, FileSpreadsheet, ChevronDown
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toUserMessage } from '../../lib/errorMessages';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const PAGE_SIZE = 1000;

// Registrar -> Admin request flow for new student accounts.
//
// Replaces the old Import Students page. The Registrar owns WHICH students
// exist, taken from institutional records; the Admin owns accounts and
// provisions the real mailbox in Outlook, which the system cannot do and must
// not guess at. So this page never creates an account and never assigns an
// email -- it hands over a reviewed list and tracks what happened to it.
//
// Both sides are template-driven so neither is guessing at headers. This
// template deliberately has no Email and no Role column: neither is the
// Registrar's to decide.

const TEMPLATE_HEADERS = [
  'LastName', 'FirstName', 'MiddleName', 'IDNumber', 'College', 'Program', 'Section', 'YearLevel'
];

// One template per college, not one template covering all of them. A
// registrar typing a different college's program from memory is exactly how
// "Program does not exist" errors happen, so the template is scoped to a
// single college and carries that college's own programs as a reference --
// nothing to mistype when it can be copied instead.
//
// One example row per program, built from LIVE reference data rather than
// written here, so the example can never name a program or section that has
// since been renamed or retired. Every row shares the same obviously-fake
// name and the same IDNumber on purpose: if a registrar forgets to delete
// them before uploading, the duplicate IDNumber trips this page's own
// "appears more than once in this file" check instead of quietly creating
// fake student accounts.
function buildTemplateSample({ dept, programs, sections }) {
  const deptPrograms = programs
    .filter((p) => p.department_id === dept.department_id)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const section = sections.find((s) => s.department_id === dept.department_id) || null;

  const row = (program) => ({
    LastName: 'SAMPLE',
    FirstName: 'DELETE THIS ROW',
    MiddleName: '',
    IDNumber: 'SAMPLE-DELETE',
    College: dept.name,
    Program: program?.abbreviation || program?.name || '',
    Section: section?.name || '',
    YearLevel: '1st Year'
  });

  return deptPrograms.length ? deptPrograms.map(row) : [row(null)];
}

// Reference-only rows: every program the college actually has, for the
// registrar to copy into the Program column instead of guessing the spelling.
function buildProgramReference({ dept, programs }) {
  return programs
    .filter((p) => p.department_id === dept.department_id)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((p) => ({ Program: p.name, Abbreviation: p.abbreviation || '' }));
}

const STATUS_STYLE = {
  pending: { chip: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock, label: 'Pending' },
  created: { chip: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2, label: 'Created' },
  rejected: { chip: 'text-rose-700 bg-rose-50 border-rose-200', icon: XCircle, label: 'Rejected' }
};

export default function StudentAccountRequests() {
  const { user, profile } = useAuth();
  const fileRef = useRef(null);
  const templateMenuRef = useRef(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

  const [requests, setRequests] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [sections, setSections] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [statusTab, setStatusTab] = useState('pending');
  const [activeTerm, setActiveTerm] = useState(null);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);

  const fetchAllPaged = async (build) => {
    const out = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error: err } = await build(from, from + PAGE_SIZE - 1);
      if (err) throw err;
      const page = data || [];
      out.push(...page);
      if (page.length < PAGE_SIZE) return out;
    }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [deptRes, progRes, secRes] = await Promise.all([
        supabase.from('departments').select('department_id, name').order('name'),
        supabase.from('programs').select('program_id, name, abbreviation, department_id').order('name'),
        supabase.from('sections').select('section_id, name, department_id').order('name')
      ]);
      if (deptRes.error) throw deptRes.error;
      if (progRes.error) throw progRes.error;
      if (secRes.error) throw secRes.error;
      setDepartments(deptRes.data || []);
      setPrograms(progRes.data || []);
      setSections(secRes.data || []);

      const { data: termRow } = await supabase
        .from('academic_terms')
        .select('term_id, school_year, semester')
        .eq('is_active', true)
        .maybeSingle();
      setActiveTerm(termRow || null);

      const all = await fetchAllPaged((from, to) =>
        supabase
          .from('student_account_requests')
          .select('*')
          .order('submitted_at', { ascending: false })
          .range(from, to)
      );
      setRequests(all);
      setLoadedAt(Date.now());
    } catch (err) {
      setError(toUserMessage(err, 'Could not load the handover queue.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Closes the college picker on an outside click, same as any other dropdown.
  useEffect(() => {
    if (!templateMenuOpen) return;
    const onClick = (e) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target)) {
        setTemplateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [templateMenuOpen]);

  const downloadTemplate = (dept) => {
    const sample = buildTemplateSample({ dept, programs, sections });
    const reference = buildProgramReference({ dept, programs });

    const ws = XLSX.utils.json_to_sheet(sample, { header: TEMPLATE_HEADERS });
    const refWs = XLSX.utils.json_to_sheet(reference, { header: ['Program', 'Abbreviation'] });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Student Accounts');
    XLSX.utils.book_append_sheet(wb, refWs, 'Programs');

    const safeName = dept.name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    XLSX.writeFile(wb, `ASPIRE_New_Student_Accounts_Template_${safeName}.xlsx`);
    setTemplateMenuOpen(false);
  };

  const deptByName = useMemo(
    () => new Map(departments.map((d) => [d.name.trim().toUpperCase(), d])),
    [departments]
  );
  const sectionByName = useMemo(
    () => new Map(sections.map((s) => [(s.name || '').trim().toUpperCase(), s])),
    [sections]
  );
  const programByKey = useMemo(() => {
    const map = new Map();
    for (const p of programs) {
      if (p.abbreviation) map.set(p.abbreviation.trim().toUpperCase(), p);
      if (p.name) map.set(p.name.trim().toUpperCase(), p);
    }
    return map;
  }, [programs]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setError('');
    setNotice('');
    setRows([]);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const parsed = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      if (!parsed.length) {
        setError('That file has no rows.');
        return;
      }

      // ID numbers are unique institution-wide, so a row is checked against
      // every existing account, everything already queued, and the rest of this
      // same file. The server re-checks all three; this just reports them per
      // row instead of failing the whole batch on the first clash.
      const existingUsers = await fetchAllPaged((from, to) =>
        supabase.from('users').select('user_number').not('user_number', 'is', null).range(from, to)
      );
      const existingIds = new Set(
        existingUsers.map((u) => String(u.user_number).trim().toUpperCase())
      );
      const queuedIds = new Set(
        requests
          .filter((r) => r.status !== 'rejected' && r.user_number)
          .map((r) => String(r.user_number).trim().toUpperCase())
      );
      const seenIds = new Set();

      const evaluated = parsed.map((raw, idx) => {
        const get = (k) => String(raw[k] ?? '').trim();
        const lastName = get('LastName');
        const firstName = get('FirstName');
        const collegeName = get('College');
        const programName = get('Program');
        const sectionName = get('Section');
        const yearLevel = get('YearLevel');

        const dept = collegeName ? deptByName.get(collegeName.toUpperCase()) : null;
        const prog = programName ? programByKey.get(programName.toUpperCase()) : null;
        const section = sectionName ? sectionByName.get(sectionName.toUpperCase()) : null;

        const idNumber = get('IDNumber');
        let status = 'ready';
        let message = '';

        // Reference data is matched against the database by exact name, never
        // guessed. Admin's Import Users re-validates all of this on upload --
        // catching it here just saves a round trip.
        if (!lastName || !firstName) {
          status = 'error';
          message = 'LastName and FirstName are required.';
        } else if (!idNumber) {
          // Required, not optional: the ID number is the institution-wide unique
          // identifier across students and personnel, so it comes from the
          // official record rather than being generated.
          status = 'error';
          message = 'IDNumber is required.';
        } else if (existingIds.has(idNumber.toUpperCase())) {
          // "Existing", not "error": the row is correct, there is simply nothing
          // to do for it. Calling that an error makes a re-uploaded master list
          // look broken when it is behaving exactly as intended.
          status = 'existing';
          message = 'Already has an account — will be skipped.';
        } else if (queuedIds.has(idNumber.toUpperCase())) {
          status = 'existing';
          message = 'Already submitted and awaiting Admin — will be skipped.';
        } else if (seenIds.has(idNumber.toUpperCase())) {
          status = 'error';
          message = `ID number ${idNumber} appears more than once in this file.`;
        } else if (collegeName && !dept) {
          status = 'error';
          message = `College "${collegeName}" does not exist.`;
        } else if (programName && !prog) {
          status = 'error';
          message = `Program "${programName}" does not exist.`;
        } else if (sectionName && !section) {
          status = 'error';
          message = `Section "${sectionName}" does not exist.`;
        } else if (yearLevel && !YEAR_LEVELS.includes(yearLevel)) {
          status = 'error';
          message = `YearLevel must be one of: ${YEAR_LEVELS.join(', ')}.`;
        } else if (section && dept && section.department_id !== dept.department_id) {
          status = 'error';
          message = `Section "${sectionName}" does not belong to ${collegeName}.`;
        }

        if (idNumber) seenIds.add(idNumber.toUpperCase());

        return {
          line: idx + 2,
          display: `${lastName}, ${firstName}`.replace(/^, $/, '—'),
          collegeName, programName, sectionName, yearLevel,
          status, message,
          payload: {
            last_name: lastName,
            first_name: firstName,
            middle_name: get('MiddleName'),
            user_number: idNumber,
            year_level: yearLevel,
            department_id: dept?.department_id || '',
            program_id: prog?.program_id || '',
            section_id: section?.section_id || ''
          }
        };
      });

      setRows(evaluated);
    } catch (err) {
      setError(toUserMessage(err, 'Could not read that file.'));
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const counts = useMemo(
    () => ({
      ready: rows.filter((r) => r.status === 'ready').length,
      existing: rows.filter((r) => r.status === 'existing').length,
      error: rows.filter((r) => r.status === 'error').length
    }),
    [rows]
  );

  // Grouped by college so a master list covering several colleges can be checked
  // one college at a time, without forcing the registrar to split the file.
  const byCollege = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const key = row.collegeName || 'No college given';
      const entry = map.get(key) || { college: key, ready: 0, existing: 0, error: 0, rows: [] };
      entry[row.status] += 1;
      entry.rows.push(row);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => a.college.localeCompare(b.college));
  }, [rows]);

  const submit = async () => {
    const payload = rows.filter((r) => r.status === 'ready').map((r) => r.payload);
    if (!payload.length) return;
    setConfirming(false);
    setSubmitting(true);
    setError('');
    try {
      const { data, error: rpcErr } = await supabase.rpc('submit_student_account_requests', {
        p_rows: payload
      });
      if (rpcErr) throw rpcErr;

      const count = data?.submitted ?? payload.length;
      await logActivity(
        'Student Handover',
        `Submitted ${count} new student record(s) to Admin for account creation.`,
        resolveActorName(profile, user)
      );
      // The notice to Admin is sent by submit_student_account_requests itself,
      // in the same transaction as the records. It used to be sent from here
      // through notifyAdminActivity(), which had two problems: the `title` was
      // dropped (that function takes only type, message and actorName), and its
      // failure path is console.warn -- so a swallowed dispatch left this screen
      // reporting success while no Admin had been told, and the records sat in
      // pending with each side believing the other had them.

      setNotice(`${count} record(s) submitted. Admin will create the accounts.`);
      setRows([]);
      setStatusTab('pending');
      load();
    } catch (err) {
      setError(toUserMessage(err, 'Could not submit these records.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Archived by term -- except pending.
  //
  // A handover that was never completed is outstanding work, whatever term it
  // was submitted in. Hiding it behind a term filter at rollover is exactly how
  // three unposted Semestral Grades disappeared from the faculty class list
  // (B-22): the record was still there, still open, and nobody could see it.
  //
  // So created and rejected belong to the term they were resolved in, and
  // pending always shows with its term named.
  const inScope = useMemo(() => {
    if (!activeTerm?.term_id) return requests;
    return requests.filter(
      (r) => r.status === 'pending' || !r.term_id || r.term_id === activeTerm.term_id
    );
  }, [requests, activeTerm]);

  const tabCounts = useMemo(
    () => ({
      pending: inScope.filter((r) => r.status === 'pending').length,
      created: inScope.filter((r) => r.status === 'created').length,
      rejected: inScope.filter((r) => r.status === 'rejected').length
    }),
    [inScope]
  );

  const visible = inScope.filter((r) => r.status === statusTab);

  // Grouped by the handover they came from. Forty students submitted together
  // are one thing the Registrar recognises -- "the file I sent on Tuesday" --
  // not forty unrelated rows.
  const batches = useMemo(() => {
    const byBatch = new Map();
    visible.forEach((req) => {
      const key = req.batch_id || req.request_id;
      if (!byBatch.has(key)) {
        byBatch.set(key, { key, submittedAt: req.submitted_at, rows: [] });
      }
      const group = byBatch.get(key);
      group.rows.push(req);
      if (req.submitted_at < group.submittedAt) group.submittedAt = req.submitted_at;
    });
    return [...byBatch.values()].sort(
      (a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)
    );
  }, [visible]);

  // How long a handover has been waiting.
  //
  // Every notification in this flow fires because something happened. The
  // failure worth catching is the opposite -- the Administrator never opens the
  // page, the batch sits pending, and because nothing happened, nothing fires.
  // Silence is indistinguishable from "not done yet", so the age is shown
  // instead of waited for.
  //
  // Measured from when the data was fetched, not from the clock during render:
  // reading the clock while rendering is impure, and a value that changes on
  // every re-render is not something to lay out a page with.
  const ageInDays = (iso) => {
    if (!iso) return 0;
    return Math.floor((loadedAt - new Date(iso).getTime()) / 86400000);
  };

  const sectionName = (id) => sections.find((s) => s.section_id === id)?.name || '—';

  return (
    <>
      <PageHeader title="New Student Accounts" breadcrumb="Registrar Portal">
        <div className="relative" ref={templateMenuRef}>
          <button
            onClick={() => setTemplateMenuOpen((v) => !v)}
            disabled={departments.length === 0}
            className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Template</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {templateMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl border border-slate-200 shadow-lg z-20 py-1.5 max-h-80 overflow-y-auto">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Template for a college
              </p>
              {departments.map((dept) => (
                <button
                  key={dept.department_id}
                  onClick={() => downloadTemplate(dept)}
                  className="w-full text-left px-3 py-2 text-xs sm:text-sm text-slate-700 hover:bg-sage-50 hover:text-sage-900 transition-colors cursor-pointer truncate"
                >
                  {dept.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        <div className="bg-sage-50 border border-sage-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-sage-900 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Fill the template from your institutional records and upload it here. These records are
            sent to the Administrator, who creates each student's Outlook mailbox and then their
            system account. <strong>No email is entered on this page</strong> — that is the
            Administrator's step.
          </span>
        </div>

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

        {/* ── Upload ──────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5">
          <div className="flex items-start gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
                Upload the filled template
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Columns: <span className="font-mono">{TEMPLATE_HEADERS.join(', ')}</span>. College,
                program and section are matched against the database by exact name — download the
                template for each college from the button above. It has one example row per
                program in that college (plus a <strong>Programs</strong> sheet to copy exact
                spellings from); <strong>replace every SAMPLE row with a real student before
                uploading</strong>.{' '}
                <strong>IDNumber is required</strong> and must be unique across the whole
                institution — it is checked against existing accounts, the queue, and the rest of
                your file. A single upload may still combine several colleges.
              </p>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFile}
            disabled={parsing || submitting}
            className="block w-full text-xs text-slate-600 file:mr-3 file:px-3.5 file:py-2 file:rounded-xl file:border-0 file:text-xs file:font-medium file:bg-sage-600 file:text-white hover:file:bg-sage-700 file:cursor-pointer cursor-pointer disabled:opacity-50"
          />
          {parsing && (
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking rows…
            </p>
          )}
        </div>

        {/* ── Preview ─────────────────────────────────────────────────────── */}
        {rows.length > 0 && (
          <>
            {/* Same three-state language as Manage Users' import: Ready is new
                work, Existing is a correct row with nothing to do, Error needs
                fixing. Calling an already-known student an error would make a
                re-uploaded master list look broken. */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
              {[
                { key: 'ready', label: 'Ready', value: counts.ready, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                { key: 'existing', label: 'Existing', value: counts.existing, tone: 'text-slate-600 bg-slate-50 border-slate-200' },
                { key: 'error', label: 'Errors', value: counts.error, tone: 'text-rose-700 bg-rose-50 border-rose-200' }
              ].map((tile) => (
                <div key={tile.key} className={cn('rounded-2xl border p-3 sm:p-4 shadow-2xs', tile.tone)}>
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider block truncate opacity-80">
                    {tile.label}
                  </span>
                  <span className="text-base sm:text-2xl font-bold font-display leading-tight">
                    {tile.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setConfirming(true)}
                disabled={submitting || counts.ready === 0}
                className="px-3.5 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Review and send
              </button>
              <button
                onClick={() => setRows([])}
                disabled={submitting}
                className="px-3.5 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Discard
              </button>
              {counts.error > 0 && (
                <span className="text-[10px] sm:text-xs text-slate-400 ml-auto text-right">
                  Error rows are skipped. Fix and re-upload them.
                </span>
              )}
            </div>

            {/* Grouped by college rather than one flat list, so a master list
                spanning several colleges can be checked a college at a time. */}
            {byCollege.map((group) => (
              <div key={group.college} className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <div className="px-3.5 sm:px-5 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs sm:text-sm font-semibold font-display text-slate-900 min-w-0 truncate">
                    {group.college}
                  </h3>
                  <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                    {group.ready > 0 && (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                        {group.ready} ready
                      </span>
                    )}
                    {group.existing > 0 && (
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                        {group.existing} existing
                      </span>
                    )}
                    {group.error > 0 && (
                      <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                        {group.error} error
                      </span>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.rows.map((row) => (
                    <div key={row.line} className="p-3 sm:p-3.5 flex items-center gap-3">
                      <span className="font-mono text-[10px] text-slate-400 w-8 flex-shrink-0 tabular-nums">
                        {row.line}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">{row.display}</p>
                        <p className="text-[10px] sm:text-xs text-slate-500 truncate">
                          {[row.programName, row.sectionName, row.yearLevel].filter(Boolean).join(' · ')}
                          {row.message && (
                            <span className={cn('ml-1.5', row.status === 'error' ? 'text-rose-600' : 'text-slate-400')}>
                              — {row.message}
                            </span>
                          )}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-lg border flex-shrink-0',
                          row.status === 'ready'
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : row.status === 'existing'
                              ? 'text-slate-600 bg-slate-50 border-slate-200'
                              : 'text-rose-700 bg-rose-50 border-rose-200'
                        )}
                      >
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── Status tracking ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['pending', 'created', 'rejected'].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusTab(tab)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap capitalize cursor-pointer',
                statusTab === tab
                  ? 'bg-sage-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              )}
            >
              {tab}
              <span className="ml-1.5 font-mono tabular-nums opacity-70">{tabCounts[tab]}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-xs text-slate-400">Loading submitted records…</p>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
            <Upload className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">Nothing {statusTab}</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {batches.map((batch) => {
              const days = ageInDays(batch.submittedAt);
              // Three working days is when a handover stops looking like "not
              // yet" and starts looking like "forgotten". Nobody is pushed a
              // reminder -- that needs a scheduler this system does not have --
              // so the age is on the screen where it can be acted on.
              const stale = statusTab === 'pending' && days >= 3;
              return (
                <div key={batch.key} className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
                  <div className={cn(
                    'px-3.5 sm:px-4 py-2.5 border-b flex flex-wrap items-center gap-x-3 gap-y-1 justify-between',
                    stale ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'
                  )}>
                    <div className="min-w-0">
                      <p className="text-[11px] sm:text-xs font-bold text-slate-800">
                        {new Date(batch.submittedAt).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' · '}
                        {batch.rows.length} student{batch.rows.length === 1 ? '' : 's'}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Sent {new Date(batch.submittedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    {statusTab === 'pending' && (
                      <span className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap',
                        stale ? 'bg-white text-amber-800 border-amber-300' : 'bg-white text-slate-500 border-slate-200'
                      )}>
                        {days === 0 ? 'Waiting since today' : `Waiting ${days} day${days === 1 ? '' : 's'}`}
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {batch.rows.map((req) => {
                      const style = STATUS_STYLE[req.status] || STATUS_STYLE.pending;
                      const Icon = style.icon;
                      return (
                        <div key={req.request_id} className="p-3.5 sm:p-4 flex items-start gap-3">
                          <div className={cn('w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0', style.chip)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                              {req.last_name}, {req.first_name} {req.middle_name || ''}
                            </h3>
                            <p className="text-[10px] sm:text-xs text-slate-500 truncate">
                              <span className="font-mono">{sectionName(req.section_id)}</span>
                              {req.year_level && ` · ${req.year_level}`}
                              {req.user_number && ` · ${req.user_number}`}
                            </p>
                            {req.status === 'rejected' && req.rejection_reason && (
                              <p className="text-[10px] sm:text-xs text-rose-700 mt-1">
                                Returned: {req.rejection_reason}
                              </p>
                            )}
                            {/* A failed import attempt. The record is still
                                pending -- this is not a rejection -- so it says
                                what stopped it rather than leaving the row
                                looking untouched. */}
                            {req.status === 'pending' && req.last_error && (
                              <p className="text-[10px] sm:text-xs text-amber-800 mt-1">
                                Import did not complete: {req.last_error}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Explicit confirmation before anything leaves the registrar, stating the
          per-college split rather than one total. A batch that silently went to
          the wrong college would be tedious to unpick afterwards. */}
      {confirming && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full p-5 space-y-3.5">
            <h3 className="text-base font-bold font-display text-slate-900">
              Send {counts.ready} student record(s) to Admin?
            </h3>

            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {byCollege
                .filter((g) => g.ready > 0)
                .map((g) => (
                  <div key={g.college} className="px-3 py-2 flex items-center gap-2">
                    <span className="text-xs text-slate-700 min-w-0 flex-1 truncate">{g.college}</span>
                    <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums flex-shrink-0">
                      {g.ready}
                    </span>
                  </div>
                ))}
            </div>

            {(counts.existing > 0 || counts.error > 0) && (
              <p className="text-[11px] text-slate-500">
                {counts.existing > 0 && <>{counts.existing} existing row(s) will be skipped. </>}
                {counts.error > 0 && <>{counts.error} error row(s) will not be sent.</>}
              </p>
            )}

            <p className="text-[11px] text-slate-400">
              Admin creates each mailbox in Outlook, then the accounts. You can track progress on
              this page.
            </p>

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 px-3.5 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? 'Sending…' : `Send ${counts.ready}`}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className="flex-1 px-3.5 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
