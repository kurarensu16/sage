import { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Bell, 
  Trash2, 
  Award, 
  BrainCircuit, 
  MessageSquare, 
  Info,
  MailOpen,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  CheckSquare,
  Square,
  X
} from 'lucide-react';
import { cn, formatRelativeTime } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getCachedData, setCachedData } from '../../lib/dataCache';
import { CardListSkeleton } from '../../components/common/Skeleton';

export default function Notifications() {
  const { user, refreshUnreadCount } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [notifications, setNotifications] = useState([]);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function loadNotifications() {
      if (!user) return;
      const cacheKey = `student_notifs_${user.id}`;
      const cached = getCachedData(cacheKey, 120000); // 2 min TTL

      if (cached) {
        setNotifications(cached);
        setLoading(false);
      }

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

          if (n.type === 'grade_posted') {
            type = 'grade';
            title = 'New Grade Posted';
            icon = Award;
            iconColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
          } else if (n.type === 'eval_window_open') {
            type = 'eval';
            title = 'Faculty Evaluation Surveys Opened';
            icon = MessageSquare;
            iconColor = 'text-blue-600 bg-blue-50 border-blue-200';
          } else if (n.type === 'eval_closed') {
            type = 'eval';
            title = 'Faculty Evaluation Surveys Closed';
            icon = MessageSquare;
            iconColor = 'text-blue-600 bg-blue-50 border-blue-200';
          } else if (n.type === 'eval_deadline_reminder') {
            type = 'eval';
            title = 'Faculty Evaluation Deadline Reminder';
            icon = MessageSquare;
            iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
          } else if (n.type === 'ai_recommendation') {
            type = 'ai';
            title = 'AI Counseling Verdict Ready';
            icon = BrainCircuit;
            iconColor = 'text-purple-600 bg-purple-50 border-purple-200';
          } else if (n.type === 'class_enrolled') {
            type = 'system';
            title = 'Class Registration Success';
            icon = Info;
            iconColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
          } else if (n.type === 'ews_alert') {
            type = 'grade';
            title = 'Early Warning System Alert';
            icon = AlertTriangle;
            iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
          } else if (n.type === 'security') {
            type = 'system';
            title = 'Account Security Notice';
            icon = ShieldCheck;
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
        setCachedData(cacheKey, mapped);

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
      const updated = notifications.map(n => ({ ...n, read: true }));
      setNotifications(updated);
      setCachedData(`student_notifs_${user.id}`, updated);
      refreshUnreadCount?.();
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  const markAsRead = async (id) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('notification_id', id);

      if (error) throw error;
      const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n);
      setNotifications(updated);
      if (user) setCachedData(`student_notifs_${user.id}`, updated);
      refreshUnreadCount?.();
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleCardClick = (noti) => {
    // Toggle expand
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(noti.id)) {
        next.delete(noti.id);
      } else {
        next.add(noti.id);
      }
      return next;
    });

    // Automatically mark as read if unread
    if (!noti.read) {
      markAsRead(noti.id);
    }
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    return notifications.filter(n => {
      if (activeFilter === 'Unread') return !n.read;
      if (activeFilter === 'Academics') return n.type === 'grade' || n.type === 'ai';
      return true;
    });
  }, [notifications, activeFilter]);

  const isAllSelected = filtered.length > 0 && filtered.every(n => selectedIds.has(n.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(n => n.id)));
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0 || isDeleting) return;
    setIsDeleting(true);
    try {
      const idsToDelete = Array.from(selectedIds);
      const { error } = await supabase
        .from('notifications')
        .delete()
        .in('notification_id', idsToDelete);

      if (error) throw error;
      const remaining = notifications.filter(n => !selectedIds.has(n.id));
      setNotifications(remaining);
      setSelectedIds(new Set());
      if (user) setCachedData(`student_notifs_${user.id}`, remaining);
      refreshUnreadCount?.();
    } catch (err) {
      console.error('Error deleting selected notifications:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <CardListSkeleton count={5} />;
  }

  return (
    <>
      <PageHeader title="My Notifications" breadcrumb="Student Portal">
        <button 
          onClick={markAllRead}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 text-slate-700 hover:border-sage-300 rounded-lg sm:rounded-xl transition-colors bg-white shadow-2xs hover:bg-slate-50 cursor-pointer"
        >
          <MailOpen className="h-3.5 w-3.5 text-slate-500" /> Mark all as read
        </button>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6 md:space-y-8">
        
        {/* Filters & Bulk Selection Toolbar */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
            {['All', 'Unread', 'Academics'].map(filter => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  "px-3 py-1 sm:px-3.5 sm:py-1.5 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap cursor-pointer",
                  activeFilter === filter 
                    ? "bg-white text-sage-800 border-sage-400 ring-1 ring-sage-400 shadow-2xs font-bold" 
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-900"
                )}
              >
                {filter}
              </button>
            ))}
          </div>

          {filtered.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={toggleSelectAll}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
              >
                {isAllSelected ? (
                  <CheckSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sage-600" />
                ) : (
                  <Square className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400" />
                )}
                <span>{isAllSelected ? 'Deselect' : 'Select All'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Selected Action Floating Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-white text-slate-800 border border-slate-200/90 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-xl flex items-center justify-between gap-2 sm:gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2 min-w-0">
              <span className="bg-sage-100 text-sage-800 border border-sage-200 font-mono text-xs font-extrabold px-2 py-0.5 rounded-full flex-shrink-0">
                {selectedIds.size}
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                <span className="sm:hidden">selected</span>
                <span className="hidden sm:inline">{selectedIds.size === 1 ? 'notification selected' : 'notifications selected'}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                onClick={deleteSelected}
                disabled={isDeleting}
                className="px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg sm:rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isDeleting ? 'Deleting...' : `Delete (${selectedIds.size})`}
              </button>
            </div>
          </div>
        )}

        {/* Notifications list */}
        <div className="space-y-2.5 sm:space-y-4">
          {filtered.length > 0 ? (
            filtered.map((noti) => {
              const isExpanded = expandedIds.has(noti.id);
              const isSelected = selectedIds.has(noti.id);

              return (
                <div 
                  key={noti.id} 
                  onClick={() => handleCardClick(noti)}
                  className={cn(
                    "p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all flex items-start gap-2.5 sm:gap-3.5 cursor-pointer select-none",
                    isSelected 
                      ? "bg-sage-50/70 border-sage-400 ring-1 ring-sage-400 shadow-xs"
                      : noti.read 
                      ? "bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs" 
                      : "bg-sage-50/30 border-sage-200 hover:border-sage-300 shadow-2xs"
                  )}
                >
                  {/* Selection Checkbox */}
                  <button
                    type="button"
                    onClick={(e) => toggleSelect(noti.id, e)}
                    className="p-1 sm:p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors -ml-1 sm:ml-0 mt-0.5 flex-shrink-0 cursor-pointer"
                    title={isSelected ? "Deselect" : "Select"}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-sage-600" />
                    ) : (
                      <Square className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-slate-300 hover:text-slate-400" />
                    )}
                  </button>

                  {/* Icon Card */}
                  <div className={cn(
                    "p-2 sm:p-2.5 rounded-xl border w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 flex items-center justify-center mt-0.5",
                    noti.iconColor
                  )}>
                    <noti.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  
                  {/* Details block */}
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className={cn(
                            "text-xs sm:text-sm font-bold text-slate-900 leading-snug break-words",
                            !noti.read && "text-sage-950"
                          )}>
                            {noti.title}
                          </h4>
                          {!noti.read && (
                            <span className="w-2 h-2 bg-sage-600 rounded-full flex-shrink-0" title="Unread" />
                          )}
                        </div>
                        {/* Subtitle timestamp on mobile view */}
                        <span className="text-[10px] text-slate-400 font-medium sm:hidden block mt-0.5">
                          {noti.time}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap hidden sm:inline-block">
                          {noti.time}
                        </span>
                        <div className="p-0.5 text-slate-400">
                          <ChevronDown className={cn(
                            "h-4 w-4 transition-transform duration-200",
                            isExpanded ? "rotate-180 text-sage-600" : "text-slate-400"
                          )} />
                        </div>
                      </div>
                    </div>

                    {/* Truncated or Expanded Notification Message */}
                    <p className={cn(
                      "text-xs text-slate-600 leading-relaxed text-left break-words transition-all",
                      !isExpanded && "line-clamp-2"
                    )}>
                      {noti.message}
                    </p>

                    {/* Expand/Collapse Hint for long text */}
                    {noti.message && noti.message.length > 80 && (
                      <span className="text-[10px] font-bold text-sage-600 hover:text-sage-700 block pt-0.5">
                        {isExpanded ? 'Show less' : 'Tap to read full details'}
                      </span>
                    )}
                  </div>

                </div>
              );
            })
          ) : (
            <div className="text-center py-12 sm:py-16 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <Bell className="h-8 w-8 sm:h-10 sm:w-10 text-slate-300 mx-auto mb-2 sm:mb-3" />
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 font-display">All caught up!</h3>
              <p className="text-xs text-slate-400 mt-1">No student alerts found matching your filter selection.</p>
            </div>
          )}
        </div>

      </div>
    </>
  );
}

