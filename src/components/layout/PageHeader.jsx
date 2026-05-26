import React from 'react';
import { ChevronRight } from 'lucide-react';

export default function PageHeader({ title, breadcrumb, children }) {
  return (
    <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between flex-shrink-0 z-10">
        <div>
            {breadcrumb && (
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                    <span className="hover:text-sage-600 cursor-pointer">{breadcrumb}</span>
                    <ChevronRight className="h-3 w-3" />
                    <span className="font-medium text-slate-900">{title}</span>
                </div>
            )}
            <h2 className="text-2xl font-bold tracking-tight font-display text-slate-900">{title}</h2>
        </div>
        
        {children && (
            <div className="flex items-center gap-3">
                {children}
            </div>
        )}
    </header>
  );
}
