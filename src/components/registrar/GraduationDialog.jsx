import { useState } from 'react';
import * as XLSX from 'xlsx';
import { GraduationCap, Upload, X, Check, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { useAuth } from '../../lib/AuthContext';

// Recording who graduated.
//
// A student who finishes 4th year has nowhere to climb, so the rollover leaves
// them a 4th year indefinitely. Only the Registrar knows which of them actually
// completed their requirements -- the rest are repeating a subject and are meant
// to stay. So this is a deliberate act, never an automatic one.
//
// THE RULES THIS SCREEN KEEPS
//
//   Match on ID NUMBER, never on name. Names change, carry extra spaces and get
//   typed three ways; user_number is stable and unique.
//
//   Resolve BEFORE writing, and show the result. The registrar confirms against
//   rows that exist rather than against what their spreadsheet claims.
//
//   An unmatched ID stops everything. Graduating 24 of 28 and reporting success
//   is the failure shape behind B-02, B-10 and B-14 -- it reads as "done" and
//   the four who were missed are discovered months later.
//
//   Flag anyone who is not a 4th year. Graduating a 1st year is almost certainly
//   a wrong column or a stale file, and it is trivially reversible only if
//   somebody notices.

export default function GraduationDialog({ isOpen, onClose, onDone }) {
  const { user, profile } = useAuth();
  const [rawText, setRawText] = useState('');
  const [matched, setMatched] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => {
    setRawText('');
    setMatched([]);
    setUnmatched([]);
    setError('');
    setResult(null);
  };

  const close = () => {
    reset();
    onClose?.();
  };

  // The first column of each line is the ID number. A header row is dropped by
  // looking for a cell with no digits at all, which is what "Student No" and
  // "ID Number" have in common and what a real ID number never does.
  const extractIdNumbers = (text) => {
    const seen = new Set();
    return String(text || '')
      .split(/\r?\n/)
      .map(line => String(line).split(',')[0].trim())
      .filter(Boolean)
      .filter(value => /\d/.test(value))
      .filter(value => {
        const key = value.toUpperCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const resolve = async (text) => {
    setError('');
    setResult(null);
    const ids = extractIdNumbers(text);
    if (ids.length === 0) {
      setMatched([]);
      setUnmatched([]);
      setError('No ID numbers were found. Put one student ID per line, or use the first column of a spreadsheet.');
      return;
    }

    try {
      const { data, error: queryError } = await supabase
        .from('users')
        .select('user_id, user_number, first_name, last_name, year_level, status')
        .eq('role', 'student')
        .in('user_number', ids);
      if (queryError) throw queryError;

      const byNumber = new Map(
        (data || []).map(row => [String(row.user_number).toUpperCase(), row])
      );
      const found = [];
      const missing = [];
      ids.forEach(id => {
        const row = byNumber.get(id.toUpperCase());
        if (row) found.push(row);
        else missing.push(id);
      });

      setMatched(found);
      setUnmatched(missing);
    } catch (err) {
      setError(err.message || 'Those ID numbers could not be checked.');
      setMatched([]);
      setUnmatched([]);
    }
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loaded) => {
      try {
        const workbook = XLSX.read(loaded.target.result, { type: 'binary' });
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
        setRawText(csv);
        resolve(csv);
      } catch {
        setError('That file could not be read. Use an Excel or CSV file.');
      }
    };
    reader.readAsBinaryString(file);
    // The input holds a live FileList; clearing it before the read would empty
    // the object the reader is pointing at.
    event.target.value = '';
  };

  const alreadyGraduated = matched.filter(row => row.year_level === 'Graduated');
  const notFinalYear = matched.filter(
    row => row.year_level !== '4th Year' && row.year_level !== 'Graduated'
  );
  const toGraduate = matched.filter(row => row.year_level !== 'Graduated');
  const canSubmit = unmatched.length === 0 && toGraduate.length > 0 && !working;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setWorking(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('registrar_mark_students_graduated', {
        p_user_ids: toGraduate.map(row => row.user_id)
      });
      if (rpcError) throw rpcError;

      await logActivity(
        'Student Graduation',
        `Recorded ${data?.graduated ?? toGraduate.length} student(s) as graduated.`,
        resolveActorName(profile, user)
      );
      setResult(data);
      setMatched([]);
      setUnmatched([]);
      setRawText('');
      onDone?.();
    } catch (err) {
      setError(err.message || 'The graduations could not be recorded.');
    } finally {
      setWorking(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-3.5 sm:p-6">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <GraduationCap className="h-5 w-5 text-sage-600 shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-slate-900 font-display truncate">
              Record Graduations
            </h2>
          </div>
          <button
            onClick={close}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {result ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-650 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-900 space-y-1">
                <p className="font-bold">
                  {result.graduated} student{result.graduated === 1 ? '' : 's'} recorded as graduated.
                </p>
                <p>
                  They keep every record and stay signed in. They no longer appear as 4th years, and each
                  has been notified.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 leading-relaxed">
                Paste one <strong>student ID number</strong> per line, or upload the spreadsheet with ID
                numbers in the first column. Students are matched on ID number, never on name. Anyone who
                still owes a subject should be left out — they stay a 4th year and keep their section.
              </div>

              <div className="flex flex-wrap gap-2">
                <label className="px-3 py-1.5 text-xs font-medium border border-slate-200 hover:border-sage-350 text-slate-700 bg-white hover:bg-slate-50 rounded-lg transition-all shadow-sm flex items-center gap-2 cursor-pointer">
                  <Upload className="h-3.5 w-3.5" /> Upload Excel or CSV
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
                </label>
              </div>

              <textarea
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                onBlur={() => resolve(rawText)}
                rows={5}
                placeholder={'2023-00123\n2023-00124\n2023-00125'}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sage-300"
              />
              <button
                onClick={() => resolve(rawText)}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Check these ID numbers
              </button>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2 text-xs text-rose-900">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {unmatched.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900 space-y-2">
                  <p>
                    <strong>{unmatched.length} ID number{unmatched.length === 1 ? '' : 's'} did not match a student.</strong>{' '}
                    Nothing will be recorded until every row matches, so that nobody is missed without
                    anyone noticing.
                  </p>
                  <div className="font-mono text-[10px] bg-white/70 border border-rose-200 rounded p-2 max-h-24 overflow-y-auto">
                    {unmatched.map(id => <div key={id}>{id}</div>)}
                  </div>
                </div>
              )}

              {notFinalYear.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-2">
                  <p>
                    <strong>{notFinalYear.length} of these are not 4th years.</strong> Check this is the
                    right list before recording it.
                  </p>
                  <div className="font-mono text-[10px] bg-white/70 border border-amber-200 rounded p-2 max-h-24 overflow-y-auto space-y-0.5">
                    {notFinalYear.map(row => (
                      <div key={row.user_id} className="flex justify-between gap-3">
                        <span className="truncate">{row.user_number} · {row.first_name} {row.last_name}</span>
                        <span className="shrink-0">{row.year_level || 'No year level'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {matched.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
                    {toGraduate.length} to record
                    {alreadyGraduated.length > 0 && (
                      <span className="font-medium text-slate-500">
                        {' '}· {alreadyGraduated.length} already graduated and will be skipped
                      </span>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {matched.map(row => (
                      <div key={row.user_id} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-slate-800">
                          <span className="font-mono text-slate-500">{row.user_number}</span>{' '}
                          {row.first_name} {row.last_name}
                        </span>
                        <span className={row.year_level === 'Graduated' ? 'text-slate-400 shrink-0' : 'text-slate-600 shrink-0'}>
                          {row.year_level === 'Graduated' ? 'Already graduated' : row.year_level || 'No year level'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={close}
            className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleConfirm}
              disabled={!canSubmit}
              className="px-4 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Check className="h-4 w-4" />
              {working ? 'Recording…' : `Record ${toGraduate.length || ''} Graduation${toGraduate.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
