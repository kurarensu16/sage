import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Bell, 
  Check, 
  Trash2, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
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
          let iconColor = 'text-slate-600 bg-slate-50 border-slate-200';

          if (n.type === 'override_approved') {
            type = 'critical';
            title = 'Grade Override Request Approved';
            icon = AlertTriangle;
            iconColor = 'text-amber-605 bg-amber-50 border-amber-250';
          } else if (n.type === 'override_rejected') {
            type = 'critical';
            title = 'Grade Override Request Rejected';
            icon = AlertTriangle;
            iconColor = 'text-rose-600 bg-rose-50 border-rose-200';
          } else if (n.type === 'term_rollover_reminder') {
            type = 'system';
            title = 'Grade Posting Reminder';
            icon = Clock;
            iconColor = 'text-blue-600 bg-blue-50 border-blue-200';
          } else if (n.type === 'class_assigned') {
            type = 'success';
            title = 'New Class Assigned';
            icon = CheckCircle;
            iconColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
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
    if (activeFilter === 'Alerts') return n.type === 'critical' || n.type === 'system';
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
      <PageHeader title="System Notifications" breadcrumb="Faculty Portal">
        <button 
          onClick={markAllRead}
          className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:border-sage-300 rounded-lg transition-colors bg-white flex items-center gap-2"
        >
          <MailOpen className="h-4 w-4" /> Mark all as read
        </button>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6">
        
        {/* Filters bar */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-5">
          {['All', 'Unread', 'Alerts'].map(filter => (
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

        {/* Notifications Listing */}
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
                  {/* Icon Block */}
                  <div className={cn(
                    "p-2.5 rounded-lg border flex-shrink-0 w-10 h-10 flex items-center justify-center",
                    noti.iconColor
                  )}>
                    <noti.icon className="h-5 w-5" />
                  </div>
                  
                  {/* Content details */}
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
                    <p className="text-xs text-slate-650 leading-relaxed max-w-2xl text-left">{noti.message}</p>
                    <span className="text-[10px] text-slate-400 font-medium block pt-1 text-left">{noti.time}</span>
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
              <p className="text-xs text-slate-400 mt-1">No system notifications found matching your selection.</p>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
