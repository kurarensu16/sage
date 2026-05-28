import React, { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Bell, 
  Check, 
  Trash2, 
  ShieldAlert, 
  Database, 
  UserPlus, 
  Info,
  MailOpen
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Notifications() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      type: 'security',
      title: 'New Administrative Audit Log Entry',
      message: 'A grade override action was executed by Admin for student Reyes, Mark T. (CS301) on the Grade Overrides panel.',
      time: '10 minutes ago',
      read: false,
      icon: ShieldAlert,
      iconColor: 'text-rose-600 bg-rose-50 border-rose-200'
    },
    {
      id: 2,
      type: 'database',
      title: 'Database Registry Auto-Sync Success',
      message: 'Registrar database sync completed successfully with zero conflicts. 12 class rosters updated.',
      time: '2 hours ago',
      read: false,
      icon: Database,
      iconColor: 'text-emerald-600 bg-emerald-50 border-emerald-200'
    },
    {
      id: 3,
      type: 'user',
      title: 'New Student Registration Registered',
      message: 'A new user (Sarah Jenkins, Student ID: 2023-10045) was registered and assigned to BSIT 3rd Year, Section BSIT-3A.',
      time: '1 day ago',
      read: true,
      icon: UserPlus,
      iconColor: 'text-blue-600 bg-blue-50 border-blue-200'
    },
    {
      id: 4,
      type: 'system',
      title: 'SAGE Platform Registry Core Update',
      message: 'System core components updated to version 2.4. Class registries auto-sync daily at 12:00 AM.',
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
    if (activeFilter === 'System') return n.type === 'security' || n.type === 'database';
    return true;
  });

  return (
    <>
      <PageHeader title="System Notifications" breadcrumb="Admin Portal">
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
          {['All', 'Unread', 'System'].map(filter => (
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
              <p className="text-xs text-slate-400 mt-1">No admin alerts found matching your filter selection.</p>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
