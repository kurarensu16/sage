import { ChevronRight } from 'lucide-react';

export default function PageHeader({ title, breadcrumb, children }) {
  return (
    <header className="bg-white border-b border-slate-200 px-4 sm:px-6 md:px-8 py-3.5 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0 z-10">
        <div>
            {breadcrumb && (
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-500 mb-0.5 sm:mb-1 overflow-x-auto">
                    <span className="hover:text-sage-600 cursor-pointer whitespace-nowrap">{breadcrumb}</span>
                    <ChevronRight className="h-3 w-3 flex-shrink-0" />
                    <span className="font-medium text-slate-900 truncate">{title}</span>
                </div>
            )}
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight font-display text-slate-900">{title}</h2>
        </div>
        
        {children && (
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {children}
            </div>
        )}
    </header>
  );
}
