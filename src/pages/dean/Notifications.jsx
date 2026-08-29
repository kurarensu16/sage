import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Bell, 
  Check, 
  Trash2, 
  Star, 
  FileCheck, 
  AlertTriangle, 
  Info,
  MailOpen
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

const formatRelativeTime = (isoString) => {
  if (!isoString) return '';
  const diffMs = new Date() - new Date(isoString);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
};

export default function Notifications() {
  const { user } = useAuth();
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
          let title = 'System Notification';
          let icon = Info;
          let iconColor = 'text-slate-650 bg-slate-50 border-slate-205';

          if (n.type === 'grades_pending') {
            type = 'grades';
            title = 'New Grade Sheet Pending Approval';
            icon = FileCheck;
            iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
          } else if (n.type === 'eval_compiled') {
            type = 'eval';
            title = 'Faculty Evaluation Feedback Compiled';
            icon = Star;
            iconColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
          } else if (n.type === 'override_request') {
            type = 'risk';
            title = 'Grade Override Request Pending';
            icon = AlertTriangle;
            iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
          } else if (n.type === 'risk_threshold') {
            type = 'risk';
            title = 'At-Risk Student Threshold Alerts';
            icon = AlertTriangle;
            iconColor = 'text-rose-600 bg-rose-50 border-rose-200';
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
        console.error('Error loading notifications:', err);
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
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
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
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const toggleRead = async (id) => {
    const noti = notifications.find(n => n.id === id);
    if (!noti) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: !noti.read })
        .eq('notification_id', id);

      if (error) throw error;
      setNotifications(notifications.map(n => n.id === id ? { ...n, read: !n.read } : n));
    } catch (err) {
      console.error('Error toggling notification read state:', err);
    }
  };

  const filtered = notifications.filter(n => {
    if (activeFilter === 'Unread') return !n.read;
    if (activeFilter === 'Academic') return n.type === 'grades' || n.type === 'risk';
    return true;
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Dean Notifications" breadcrumb="Dean Portal">
        <button 
          onClick={markAllRead}
          className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold border border-slate-200 text-slate-700 hover:border-sage-300 rounded-xl transition-colors bg-white flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <MailOpen className="h-3.5 w-3.5 text-slate-500" /> 
          <span className="hidden sm:inline">Mark all as read</span>
          <span className="sm:hidden">Mark all read</span>
        </button>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-4 sm:space-y-6">
        
        {/* Filters tab pills */}
        <div className="flex items-center gap-1.5 border-b border-slate-200 pb-3 sm:pb-4 overflow-x-auto no-scrollbar">
          {['All', 'Unread', 'Academic'].map(filter => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-bold rounded-full border transition-all cursor-pointer whitespace-nowrap",
                activeFilter === filter 
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs" 
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
                  "p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4 group shadow-2xs",
                  noti.read 
                    ? "bg-white border-slate-200/90" 
                    : "bg-sage-50/20 border-sage-200"
                )}
              >
                
                <div className="flex gap-3 sm:gap-4 w-full min-w-0">
                  {/* Icon Card */}
                  <div className={cn(
                    "p-2.5 rounded-xl border w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 flex items-center justify-center",
                    noti.iconColor
                  )}>
                    <noti.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  
                  {/* Details block */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className={cn(
                        "text-xs sm:text-sm font-bold text-slate-900 truncate",
                        !noti.read && "text-sage-950"
                      )}>{noti.title}</h4>
                      {!noti.read && (
                        <span className="w-2 h-2 bg-sage-600 rounded-full flex-shrink-0"></span>
                      )}
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed text-left break-words">{noti.message}</p>
                    <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium block pt-0.5 text-left font-mono">{noti.time}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 self-end sm:self-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => toggleRead(noti.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title={noti.read ? "Mark as unread" : "Mark as read"}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteNotification(noti.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete notification"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

              </div>
            ))
          ) : (
            <div className="text-center py-12 sm:py-16 bg-white border border-slate-200/90 rounded-2xl shadow-2xs p-6">
              <Bell className="h-9 w-9 text-slate-300 mx-auto mb-2.5" />
              <h3 className="text-sm font-bold text-slate-900 font-display">All caught up!</h3>
              <p className="text-xs text-slate-400 mt-1">No notifications matching your filter selection.</p>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
