import React, { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Bell, 
  Check, 
  Trash2, 
  Award, 
  BrainCircuit, 
  MessageSquare, 
  Info,
  MailOpen
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Notifications() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      type: 'grade',
      title: 'New Midterm Grade Posted',
      message: 'Prof. Amanda Rivera has posted the official Midterm grades for IT101 (Introduction to Computing). Your computed grade is 1.25.',
      time: '1 hour ago',
      read: false,
      icon: Award,
      iconColor: 'text-emerald-600 bg-emerald-50 border-emerald-250'
    },
    {
      id: 2,
      type: 'eval',
      title: 'Faculty Evaluation Surveys Opened',
      message: 'The student evaluation survey window for First Semester AY 2025-2026 is now open. Submit evaluations for Prof. Rivera and Dr. Valdes.',
      time: '1 day ago',
      read: false,
      icon: MessageSquare,
      iconColor: 'text-blue-600 bg-blue-50 border-blue-200'
    },
    {
      id: 3,
      type: 'ai',
      title: 'AI Counseling Verdict Ready',
      message: 'Your monthly AI Counseling feedback report and risk assessment verdict have been calculated. Review recommended academic guidelines.',
      time: '3 days ago',
      read: true,
      icon: BrainCircuit,
      iconColor: 'text-purple-600 bg-purple-50 border-purple-200'
    },
    {
      id: 4,
      type: 'system',
      title: 'Platform Maintenance Alert',
      message: 'The SAGE portal will be temporarily unavailable on Sunday, June 1, from 2:00 AM to 5:00 AM for scheduled database registry maintenance.',
      time: '1 week ago',
      read: true,
      icon: Info,
      iconColor: 'text-slate-650 bg-slate-50 border-slate-205'
    }
  ]);

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  const toggleRead = (id) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: !n.read } : n));
  };

  const filtered = notifications.filter(n => {
    if (activeFilter === 'Unread') return !n.read;
    if (activeFilter === 'Academics') return n.type === 'grade' || n.type === 'ai';
    return true;
  });

  return (
    <>
      <PageHeader title="My Notifications" breadcrumb="Student Portal">
        <button 
          onClick={markAllRead}
          className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:border-sage-300 rounded-lg transition-colors bg-white flex items-center gap-2"
        >
          <MailOpen className="h-4 w-4" /> Mark all as read
        </button>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6">
        
        {/* Filters tab pills */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-5">
          {['All', 'Unread', 'Academics'].map(filter => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "px-4 py-1.5 text-xs font-semibold rounded-full border transition-colors",
                activeFilter === filter 
                  ? "bg-slate-900 text-white border-slate-900" 
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-900"
              )}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Notifications list */}
        <div className="space-y-4">
          {filtered.length > 0 ? (
            filtered.map((noti) => (
              <div 
                key={noti.id} 
                className={cn(
                  "p-5 rounded-xl border transition-all flex items-start justify-between gap-4 group",
                  noti.read 
                    ? "bg-white border-slate-200" 
                    : "bg-sage-50/20 border-sage-200 shadow-sm"
                )}
              >
                
                <div className="flex gap-4">
                  {/* Icon Card */}
                  <div className={cn(
                    "p-2.5 rounded-lg border w-10 h-10 flex-shrink-0 flex items-center justify-center",
                    noti.iconColor
                  )}>
                    <noti.icon className="h-5 w-5" />
                  </div>
                  
                  {/* Details block */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className={cn(
                        "text-sm font-bold text-slate-900",
                        !noti.read && "text-sage-950"
                      )}>{noti.title}</h4>
                      {!noti.read && (
                        <span className="w-2 h-2 bg-sage-600 rounded-full"></span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">{noti.message}</p>
                    <span className="text-[10px] text-slate-400 font-medium block pt-1">{noti.time}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => toggleRead(noti.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                    title={noti.read ? "Mark as unread" : "Mark as read"}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteNotification(noti.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                    title="Delete notification"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

              </div>
            ))
          ) : (
            <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
              <Bell className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-900">All caught up!</h3>
              <p className="text-xs text-slate-400 mt-1">No student alerts found matching your filter selection.</p>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
