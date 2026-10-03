import React from 'react';
import { Info } from 'lucide-react';

export default function InfoModal({ isOpen, title, message, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full p-6 text-left flex flex-col space-y-4 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="w-10 h-10 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 flex-shrink-0">
            <Info className="h-5 w-5 stroke-[2.5]" />
          </div>
          <h3 className="text-lg font-bold font-display text-slate-900">{title}</h3>
        </div>

        {/* Text Details */}
        <div className="py-2">
          <div className="text-sm text-slate-600 leading-relaxed">{message}</div>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl shadow-sm transition-all duration-150 transform hover:scale-[1.02] active:scale-[0.98] outline-none cursor-pointer focus:ring-2 focus:ring-slate-300 focus:ring-offset-2"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
