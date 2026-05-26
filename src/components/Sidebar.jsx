import { BookOpen, LayoutDashboard, TableProperties, ClipboardList, Send, FileText, Bell, LogOut } from 'lucide-react';

export default function Sidebar() {
  return (
    <aside className="w-56 bg-slate-900 h-full flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-800">
            <h1 className="text-xl font-bold font-display text-white tracking-tight flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-sage-400" /> SAGE
            </h1>
            <p className="text-xs text-slate-400 mt-1">Faculty Portal</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            <a href="#" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 rounded-lg hover:bg-slate-800 hover:text-white transition-colors">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 rounded-lg hover:bg-slate-800 hover:text-white transition-colors">
                <TableProperties className="h-4 w-4" /> Class Records
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-2.5 text-sm text-white rounded-lg bg-slate-800 border-l-2 border-sage-400">
                <ClipboardList className="h-4 w-4" /> Score Input
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 rounded-lg hover:bg-slate-800 hover:text-white transition-colors">
                <Send className="h-4 w-4" /> Post Grades
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 rounded-lg hover:bg-slate-800 hover:text-white transition-colors">
                <FileText className="h-4 w-4" /> Evaluation Results
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 rounded-lg hover:bg-slate-800 hover:text-white transition-colors mt-8">
                <Bell className="h-4 w-4" /> Notifications
                <span className="ml-auto bg-sage-600 text-white text-xs font-mono px-2 py-0.5 rounded-full">3</span>
            </a>
        </nav>
        
        <div className="p-4 border-t border-slate-800">
            <div className="flex items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:text-white cursor-pointer transition-colors">
                <LogOut className="h-4 w-4" /> Sign Out
            </div>
        </div>
    </aside>
  );
}
