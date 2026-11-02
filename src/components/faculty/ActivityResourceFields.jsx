import { Plus, Trash2, Link2, AlertTriangle } from 'lucide-react';
import {
  RESOURCE_MAX, emptyResource, describeResource
} from '../../lib/activityResourceService';

// Learning resources on an activity, used in both the create form and the
// activity settings modal in Score Input.
//
// One component in two places on purpose. The two forms already collect the
// same fields, and the create form is where faculty are told the description is
// "Required for AI Study Tutor" -- so that is where they are already thinking
// about what the tutor will use. Offering this only in settings would hide it
// behind a click many would never make, which is how a curation feature ends up
// permanently empty.
//
// Entirely optional. A missing resource never blocks saving an activity: the
// tutor falls back to suggesting search terms, and grading does not care.

export default function ActivityResourceFields({ value = [], onChange, disabled }) {
  const rows = value.length ? value : [];

  const update = (index, patch) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const add = () => onChange([...rows, emptyResource()]);
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between">
        <span>Learning Resources <span className="font-normal normal-case text-slate-400">(optional)</span></span>
        <span className="text-[11px] font-normal text-slate-500 lowercase">Shown to students by AI Study Advising</span>
      </label>

      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-400">
          Add a reading, video or page for this topic. If you add none, the tutor suggests
          search terms instead.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => {
            const check = describeResource(row);
            return (
              <div key={index} className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/50">
                <div className="flex items-start gap-2">
                  <Link2 className="h-3.5 w-3.5 text-slate-400 mt-2 flex-shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <input
                      type="text"
                      disabled={disabled}
                      value={row.label}
                      onChange={(e) => update(index, { label: e.target.value })}
                      placeholder="Name, e.g. 3NF handout"
                      maxLength={150}
                      className="block w-full px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-xs outline-none transition-all disabled:bg-slate-50"
                    />
                    <input
                      type="url"
                      disabled={disabled}
                      value={row.url}
                      onChange={(e) => update(index, { url: e.target.value })}
                      placeholder="https://..."
                      className="block w-full px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-xs outline-none transition-all disabled:bg-slate-50 font-mono"
                    />
                    <input
                      type="text"
                      disabled={disabled}
                      value={row.note}
                      onChange={(e) => update(index, { note: e.target.value })}
                      placeholder="What it covers, e.g. covers 1NF through 3NF"
                      maxLength={300}
                      className="block w-full px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-xs outline-none transition-all disabled:bg-slate-50"
                    />
                    {!check.ok && (
                      <p className="text-[11px] text-rose-600 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-px flex-shrink-0" />
                        {check.message}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={disabled}
                    aria-label="Remove this resource"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 cursor-pointer flex-shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rows.length < RESOURCE_MAX && (
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="self-start inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
        >
          <Plus className="h-3 w-3" />
          Add a resource
        </button>
      )}

      <p className="text-[10px] text-slate-400">
        Links only for now. Up to {RESOURCE_MAX}. File uploads arrive with the storage move.
      </p>
    </div>
  );
}
