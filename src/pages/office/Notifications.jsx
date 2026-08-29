import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Bell, 
  Check, 
  Trash2, 
  ShieldAlert, 
  FileSpreadsheet, 
  ClipboardCheck, 
  Users,
  Info,
  MailOpen,
  Calendar
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
          } else if (n.type === 'eval_window') {
            type = 'evaluation';
            title = 'Evaluation Window Status';
            icon = Calendar;
            iconColor = 'text-indigo-600 bg-indigo-50 border-indigo-200';
          } else if (n.type === 'assignment') {
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

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      if (user) {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('recipient_id', user.id);
      }
    } catch (err) {
      console.error('Failed to mark notifications read in DB:', err);
    }
  };

  const markAsRead = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try {
      if (user) {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('notification_id', id);
      }
    } catch (err) {
      console.error('Failed to update single notification status:', err);
    }
  };

  const deleteNotification = async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      if (user) {
        await supabase
          .from('notifications')
          .delete()
          .eq('notification_id', id);
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const clearAllNotifications = async () => {
    setNotifications([]);
    try {
      if (user) {
        await supabase
          .from('notifications')
          .delete()
          .eq('recipient_id', user.id);
      }
    } catch (err) {
      console.error('Failed to clear notifications in DB:', err);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === 'Unread') return !n.read;
    if (activeFilter === 'Compliance') return n.type === 'compliance';
    if (activeFilter === 'Roster') return n.type === 'roster';
    if (activeFilter === 'Evaluations') return n.type === 'evaluation';
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      <PageHeader title="Notification Center" breadcrumb="Office Portal" />
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 max-w-5xl mx-auto w-full space-y-4 sm:space-y-6">
        
        {/* Controls Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {['All', 'Unread', 'Compliance', 'Roster', 'Evaluations'].map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0",
                  activeFilter === filter
                    ? "bg-sage-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                {filter}
                {filter === 'Unread' && unreadCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-white text-sage-700 rounded-full text-[10px] font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            <button
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" /> Mark all read
            </button>
            <button
              onClick={clearAllNotifications}
              disabled={notifications.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear all
            </button>
          </div>
        </div>

        {/* Notifications List */}
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 h-24" />
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center space-y-3 shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <MailOpen className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Notifications</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You are completely caught up! No alerts match the selected filter.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {filteredNotifications.map((n) => {
              const IconComponent = n.icon || Bell;
              return (
                <div
                  key={n.id}
                  className={cn(
                    "bg-white border rounded-2xl p-3.5 sm:p-5 transition-all shadow-2xs flex items-start justify-between gap-3 sm:gap-4",
                    n.read ? "border-slate-200/90 opacity-80" : "border-sage-300 bg-sage-50/20"
                  )}
                >
                  <div className="flex items-start gap-3 sm:gap-3.5 min-w-0">
                    <div className={cn("p-2 sm:p-2.5 rounded-xl border flex-shrink-0 mt-0.5", n.iconColor)}>
                      <IconComponent className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={cn("text-xs sm:text-sm font-bold truncate", n.read ? "text-slate-700" : "text-slate-900")}>
                          {n.title}
                        </h4>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-sage-600 shrink-0" />
                        )}
                        <span className="text-[10px] text-slate-400 font-medium">· {n.time}</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                        {n.message}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!n.read && (
                      <button
                        onClick={() => markAsRead(n.id)}
                        title="Mark as read"
                        className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-sage-600 rounded-lg transition-colors cursor-pointer"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(n.id)}
                      title="Delete"
                      className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </>
  );
}
