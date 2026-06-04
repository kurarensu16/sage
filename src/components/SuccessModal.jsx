import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function SuccessModal({ isOpen, title = "Success!", message, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full p-6 text-center flex flex-col items-center justify-center space-y-4 animate-in zoom-in-95 duration-200">
        
        {/* Animated Check Icon */}
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 animate-bounce">
          <CheckCircle2 className="h-10 w-10 stroke-[2.5]" />
        </div>

        {/* Text Details */}
        <div className="space-y-1">
          <h3 className="text-lg font-bold font-display text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500 leading-relaxed px-2">{message}</p>
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-sage-600 hover:bg-sage-700 text-white font-medium rounded-xl shadow-sm transition-all duration-150 transform hover:scale-[1.02] active:scale-[0.98] outline-none cursor-pointer focus:ring-2 focus:ring-sage-500 focus:ring-offset-2"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
