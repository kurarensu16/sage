import React from 'react';
import { HelpCircle } from 'lucide-react';

export default function ConfirmModal({ isOpen, title = "Are you sure?", message, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full p-6 text-center flex flex-col items-center justify-center space-y-4 animate-in zoom-in-95 duration-200">
        
        {/* Help Circle Icon */}
        <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 animate-pulse">
          <HelpCircle className="h-10 w-10 stroke-[2.5]" />
        </div>

        {/* Text Details */}
        <div className="space-y-1">
          <h3 className="text-lg font-bold font-display text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500 leading-relaxed px-2">{message}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex w-full gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-all duration-150 outline-none cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-sage-600 hover:bg-sage-700 text-white font-medium rounded-xl shadow-sm transition-all duration-150 transform hover:scale-[1.02] active:scale-[0.98] outline-none cursor-pointer focus:ring-2 focus:ring-sage-500 focus:ring-offset-2"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
