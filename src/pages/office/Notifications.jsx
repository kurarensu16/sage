import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Bell, 
  Check, 
  Trash2, 
  ShieldAlert, 
  FileSpreadsheet, 
  Users,
  Info,
  MailOpen,
  Calendar,
  MessageSquare
} from 'lucide-react';
import { cn, formatRelativeTime } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

export default function Notifications() {
  const { user, refreshUnreadCount } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    async function loadNotifications() {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('recipient_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const mapped = (data || []).map(n => {
          let type = 'system';
          let title = 'Office Notification';
          let icon = Info;
          let iconColor = 'text-slate-600 bg-slate-50 border-slate-200';

          if (n.type === 'compliance') {
            type = 'compliance';
            title = 'Grading Compliance Alert';
            icon = ShieldAlert;
            iconColor = 'text-rose-600 bg-rose-50 border-rose-200';
          } else if (n.type === 'roster_import') {
            type = 'roster';
            title = 'Student Roster Processed';
            icon = FileSpreadsheet;
            iconColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
          } else if (n.type === 'eval_window' || n.type === 'eval_window_open' || n.type === 'eval_closed') {
            type = 'eval';
            title = 'Evaluation Window Status';
            icon = Calendar;
            iconColor = 'text-indigo-600 bg-indigo-50 border-indigo-200';
          } else if (n.type === 'assignment' || n.type === 'class_assigned') {
            type = 'assignment';
            title = 'Subject Assignment Update';
            icon = Users;
            iconColor = 'text-blue-600 bg-blue-50 border-blue-200';
          }

          return {
            id: n.notification_id,
            type,
            title,
            message: n.message,
            time: formatRelativeTime(n.created_at),
            read: n.is_read,
            icon,
            iconColor
          };
        });

        setNotifications(mapped);
      } catch (err) {
        console.error('Failed to load notifications from database:', err);
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    }

    loadNotifications();
  }, [user]);

  const markAllRead = async () => {
    if (!user || notifications.length === 0) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', user.id);

      if (error) throw error;
      setNotifications(notifications.map(n => ({ ...n, read: true })));
      refreshUnreadCount?.();
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const deleteNotification = async (id) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('notification_id', id);

      if (error) throw error;
      setNotifications(notifications.filter(n => n.id !== id));
      refreshUnreadCount?.();
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const toggleRead = async (id, currentReadState) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: !currentReadState })
        .eq('notification_id', id);

      if (error) throw error;
      setNotifications(notifications.map(n => n.id === id ? { ...n, read: !currentReadState } : n));
      refreshUnreadCount?.();
    } catch (err) {
      console.error('Failed to update notification read state:', err);
    }
  };

  const filtered = notifications.filter(n => {
    if (activeFilter === 'Unread') return !n.read;
    if (activeFilter === 'Evaluations') return n.type === 'eval';
    if (activeFilter === 'Assignments') return n.type === 'assignment';
    if (activeFilter === 'Compliance') return n.type === 'compliance';
    return true;
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-xs text-slate-500 font-medium font-sans">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="My Notifications" breadcrumb="College Office Portal">
        <button 
          onClick={markAllRead}
          className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold border border-slate-200 text-slate-700 hover:border-sage-300 rounded-xl transition-colors bg-white flex items-center justify-center gap-2 cursor-pointer shadow-xs"
        >
          <MailOpen className="h-4 w-4 text-slate-500" /> Mark all as read
        </button>
      </PageHeader>
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {/* Filters Tab Pills */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3.5 sm:pb-5 overflow-x-auto">
          {['All', 'Unread', 'Evaluations', 'Assignments', 'Compliance'].map(filter => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap cursor-pointer",
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
        <div className="space-y-3 sm:space-y-4">
          {filtered.length > 0 ? (
            filtered.map((noti) => (
              <div 
                key={noti.id} 
                className={cn(
                  "p-3.5 sm:p-5 rounded-xl border transition-all flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4 group",
                  noti.read 
                    ? "bg-white border-slate-200" 
                    : "bg-sage-50/20 border-sage-200 shadow-xs"
                )}
              >
                
                <div className="flex gap-3 sm:gap-4 items-start w-full">
                  {/* Icon Card */}
                  <div className={cn(
                    "p-2.5 rounded-lg border w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 flex items-center justify-center mt-0.5",
                    noti.iconColor
                  )}>
                    <noti.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  
                  {/* Details block */}
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className={cn(
                        "text-xs sm:text-sm font-bold text-slate-900 line-clamp-1",
                        !noti.read && "text-sage-950"
                      )}>{noti.title}</h4>
                      {!noti.read && (
                        <span className="w-2 h-2 bg-sage-600 rounded-full flex-shrink-0"></span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-2xl text-left break-words">{noti.message}</p>
                    <span className="text-[10px] text-slate-400 font-medium block pt-0.5 text-left">{noti.time}</span>
                  </div>
                </div>

                {/* Actions - Visible on touch, hover on desktop */}
                <div className="flex items-center gap-1 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto justify-end md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => toggleRead(noti.id, noti.read)}
                    className="p-2 sm:p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title={noti.read ? "Mark as unread" : "Mark as read"}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteNotification(noti.id)}
                    className="p-2 sm:p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete notification"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

              </div>
            ))
          ) : (
            <div className="text-center py-12 sm:py-16 bg-white border border-slate-200 rounded-xl p-4">
              <Bell className="h-8 w-8 sm:h-10 sm:w-10 text-slate-300 mx-auto mb-2 sm:mb-3" />
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">All caught up!</h3>
              <p className="text-xs text-slate-400 mt-1">No office alerts found matching your filter selection.</p>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
