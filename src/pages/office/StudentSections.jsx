import React from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Settings2 } from 'lucide-react';

export default function StudentSections() {
  return (
    <>
      <PageHeader title="Student Sections Modifier" breadcrumb="College Office Portal" />
      <div className="p-8 overflow-y-auto flex-1">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
             <Settings2 className="h-6 w-6 text-sage-600" />
             <h3 className="text-lg font-bold text-slate-900">Modify Student Sections</h3>
          </div>
          <div className="p-8 text-center text-slate-500">
            Interface to update student sections or convert to Irregular status will be implemented here.
          </div>
        </div>
      </div>
    </>
  );
}
