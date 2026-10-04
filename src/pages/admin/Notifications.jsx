import { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Bell, 
  Trash2, 
  ShieldAlert, 
  Database, 
  UserPlus, 
  Info, 
  MailOpen, 
  CheckSquare, 
  Square, 
  Radio,
  Send,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Smartphone,
  Mail
} from 'lucide-react';
import { cn, formatRelativeTime } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { dismissNotifications, markNotificationsRead, requeueNotificationDelivery } from '../../lib/notificationDispatcher';
import { useAuth } from '../../lib/AuthContext';
import { getCachedData, setCachedData } from '../../lib/dataCache';
import { CardListSkeleton, TableSkeleton } from '../../components/common/Skeleton';

export default function Notifications() {
  const { user, refreshUnreadCount } = useAuth();
  const [activeTab, setActiveTab] = useState('inbox'); // 'inbox' | 'monitor'

  // Inbox state
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [notifications, setNotifications] = useState([]);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Monitor state
  const [loadingMonitor, setLoadingMonitor] = useState(false);
  const [monitorLogs, setMonitorLogs] = useState([]);
  const [monitorFilter, setMonitorFilter] = useState('all'); // 'all' | 'in_app' | 'email' | 'push' | 'failed'
  const [requeuingId, setRequeuingId] = useState(null);

  // 1. Load Admin's Personal Notifications
  useEffect(() => {
    async function loadNotifications() {
      if (!user) return;
      const cacheKey = `admin_notifs_${user.id}`;
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
          .is('dismissed_at', null)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const mapped = (data || []).map(n => {
          let type = 'system';
          let title = 'System Notification';
          let icon = Info;
          let iconColor = 'text-slate-600 bg-slate-50 border-slate-200';

          if (n.type === 'security') {
            type = 'security';
            title = 'Administrative Security Alert';
            icon = ShieldAlert;
            iconColor = 'text-rose-600 bg-rose-50 border-rose-200';
          } else if (n.type === 'database_sync') {
            type = 'database';
            title = 'Database Registry Auto-Sync Success';
            icon = Database;
            iconColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
          } else if (n.type === 'user_signup') {
            type = 'user';
            title = 'New User Registered';
            icon = UserPlus;
            iconColor = 'text-blue-600 bg-blue-50 border-blue-200';
          } else if (n.type === 'roster_import') {
            type = 'database';
            title = 'Student Roster Processed';
            icon = Database;
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
        setCachedData(cacheKey, mapped);

      } catch (err) {
        console.error('Error loading admin notifications:', err);
      } finally {
        setLoading(false);
      }
    }

    loadNotifications();
  }, [user]);

  // 2. Load System Delivery Monitor Data
  async function loadDeliveryMonitorData() {
    try {
      setLoadingMonitor(true);

      // Attempt to load from notification_deliveries first
      let deliveries = [];
      const { data: delivData, error: delivErr } = await supabase
        .from('notification_deliveries')
        .select(`
          delivery_id,
          notification_id,
          channel,
          recipient_id,
          target_address,
          status,
          attempts,
          last_attempt_at,
          sent_at,
          error_message,
          created_at,
          notifications:notification_id (type, title, message, severity)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!delivErr && delivData && delivData.length > 0) {
        deliveries = delivData.map(d => ({
          id: d.delivery_id,
          notificationId: d.notification_id,
          recipientId: d.recipient_id,
          channel: d.channel,
          target: d.target_address || '—',
          status: d.status,
          attempts: d.attempts,
          title: d.notifications?.title || d.notifications?.type || 'System Notification',
          message: d.notifications?.message || '—',
          severity: d.notifications?.severity || 'info',
          errorMessage: d.error_message,
          createdAt: d.created_at,
          time: formatRelativeTime(d.created_at)
        }));
      } else {
        // Fallback: Query notifications table directly
        const { data: notifs, error: notifErr } = await supabase
          .from('notifications')
          .select('notification_id, recipient_id, type, title, message, is_read, severity, created_at')
          .order('created_at', { ascending: false })
          .limit(100);

        if (notifErr) throw notifErr;

        deliveries = (notifs || []).map(n => ({
          id: n.notification_id,
          notificationId: n.notification_id,
          recipientId: n.recipient_id,
          channel: 'in_app',
          target: 'In-App Tray',
          status: n.is_read ? 'sent' : 'pending',
          attempts: 1,
          title: n.title || n.type || 'Notification',
          message: n.message,
          severity: n.severity || 'info',
          errorMessage: null,
          createdAt: n.created_at,
          time: formatRelativeTime(n.created_at)
        }));
      }

      setMonitorLogs(deliveries);
    } catch (err) {
      console.error('Error loading delivery monitor data:', err);
    } finally {
      setLoadingMonitor(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'monitor') {
      loadDeliveryMonitorData();
    }
  }, [activeTab]);

  // Handle requeue failed delivery
  const handleRequeue = async (logItem) => {
    try {
      setRequeuingId(logItem.id);
      await requeueNotificationDelivery(logItem.id);

      setMonitorLogs(prev => prev.map(item =>
        item.id === logItem.id ? { ...item, status: 'pending', attempts: 0, errorMessage: null } : item
      ));
    } catch (err) {
      console.error('Error requeuing delivery:', err);
    } finally {
      setRequeuingId(null);
    }
  };

  // Monitor statistics
  const monitorStats = useMemo(() => {
    const total = monitorLogs.length;
    const inApp = monitorLogs.filter(l => l.channel === 'in_app').length;
    const email = monitorLogs.filter(l => l.channel === 'email').length;
    const push = monitorLogs.filter(l => l.channel === 'push').length;
    const failed = monitorLogs.filter(l => l.status === 'failed').length;
    const sent = monitorLogs.filter(l => l.status === 'sent').length;

    return { total, inApp, email, push, failed, sent };
  }, [monitorLogs]);

  // Filtered monitor logs
  const filteredMonitorLogs = useMemo(() => {
    if (monitorFilter === 'all') return monitorLogs;
    if (monitorFilter === 'failed') return monitorLogs.filter(l => l.status === 'failed');
    return monitorLogs.filter(l => l.channel === monitorFilter);
  }, [monitorLogs, monitorFilter]);

  const markAllRead = async () => {
    if (!user || notifications.length === 0) return;
    try {
      await markNotificationsRead();
      const updated = notifications.map(n => ({ ...n, read: true }));
      setNotifications(updated);
      setCachedData(`admin_notifs_${user.id}`, updated);
      refreshUnreadCount?.();
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  const markAsRead = async (id) => {
    try {
      await markNotificationsRead([id]);
      const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n);
      setNotifications(updated);
      if (user) setCachedData(`admin_notifs_${user.id}`, updated);
      refreshUnreadCount?.();
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleCardClick = (noti) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(noti.id)) {
        next.delete(noti.id);
      } else {
        next.add(noti.id);
      }
      return next;
    });

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

  const selectAll = () => {
    if (selectedIds.size === filteredNotifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotifications.map(n => n.id)));
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const idsToDelete = Array.from(selectedIds);
      await dismissNotifications(idsToDelete);

      const remaining = notifications.filter(n => !selectedIds.has(n.id));
      setNotifications(remaining);
      setSelectedIds(new Set());
      if (user) setCachedData(`admin_notifs_${user.id}`, remaining);
      refreshUnreadCount?.();
    } catch (err) {
      console.error('Error deleting notifications:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Unread') return !n.read;
    return n.type === activeFilter.toLowerCase();
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      <div className="space-y-6 text-left max-w-7xl mx-auto">
        <PageHeader
          title="Notification Center"
          subtitle="Manage administrative alerts, system security events, and monitor multi-channel delivery queues"
        />

        {/* Top View Switcher */}
        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('inbox')}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer",
              activeTab === 'inbox' ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Bell className="w-4 h-4" />
            <span>Admin Inbox {unreadCount > 0 && `(${unreadCount})`}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('monitor')}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer",
              activeTab === 'monitor' ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Radio className="w-4 h-4 text-sage-600" />
            <span>Delivery Monitor</span>
          </button>
        </div>

        {/* ---------------- TAB 1: ADMIN INBOX ---------------- */}
        {activeTab === 'inbox' && (
          <div className="space-y-5">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={selectAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {selectedIds.size === filteredNotifications.length && filteredNotifications.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-sage-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>Select All</span>
                </button>

                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={deleteSelected}
                    disabled={isDeleting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold hover:bg-rose-100 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>Delete Selected ({selectedIds.size})</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={unreadCount === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <MailOpen className="w-4 h-4 text-sage-600" />
                  <span>Mark All Read</span>
                </button>
              </div>
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              {['All', 'Unread', 'Security', 'Database', 'User', 'System'].map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFilter(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl transition-colors cursor-pointer",
                    activeFilter === f
                      ? "bg-slate-900 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Notification Cards */}
            {loading ? (
              <CardListSkeleton count={4} />
            ) : filteredNotifications.length === 0 ? (
              <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                <Bell className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-900">All caught up!</h3>
                <p className="text-xs text-slate-400 mt-1">No alerts found matching your filter selection.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredNotifications.map(noti => {
                  const Icon = typeof noti.icon === 'function' || (noti.icon && noti.icon.$$typeof) ? noti.icon : Info;
                  const isExpanded = expandedIds.has(noti.id);
                  const isSelected = selectedIds.has(noti.id);

                  return (
                    <div
                      key={noti.id}
                      onClick={() => handleCardClick(noti)}
                      className={cn(
                        "p-4 rounded-2xl border transition-all cursor-pointer text-left bg-white",
                        noti.read ? "border-slate-200/80 hover:border-slate-300" : "border-sage-300 bg-sage-50/20 shadow-2xs",
                        isSelected && "ring-2 ring-sage-500 border-transparent"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={(e) => toggleSelect(noti.id, e)}
                          className="pt-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-sage-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </button>

                        <div className={cn("p-2 rounded-xl border flex-shrink-0", noti.iconColor)}>
                          <Icon className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className={cn("text-xs font-bold text-slate-900", !noti.read && "font-black text-sage-950")}>
                              {noti.title}
                            </h4>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {noti.time}
                            </span>
                          </div>

                          <p className={cn(
                            "text-xs text-slate-600 mt-1 leading-relaxed",
                            !isExpanded && "line-clamp-2"
                          )}>
                            {noti.message}
                          </p>

                          {noti.message && noti.message.length > 90 && (
                            <span className="text-[10px] font-bold text-sage-600 mt-1 block">
                              {isExpanded ? 'Show less' : 'Tap to read full details'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---------------- TAB 2: SYSTEM DELIVERY MONITOR ---------------- */}
        {activeTab === 'monitor' && (
          <div className="space-y-6">
            {/* Delivery KPI Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Total Dispatched</span>
                  <Send className="w-4 h-4 text-slate-400" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-900">
                  {monitorStats.total}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Audit log count</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>In-App Delivered</span>
                  <Bell className="w-4 h-4 text-blue-500" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-900">
                  {monitorStats.inApp}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Recipient trays</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Push Dispatched</span>
                  <Smartphone className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-emerald-600">
                  {monitorStats.push}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Native device tokens</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Email Channel</span>
                  <Mail className="w-4 h-4 text-purple-500" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-purple-600">
                  {monitorStats.email}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">SMTP queue</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between col-span-2 lg:col-span-1">
                <div className="flex items-center justify-between text-xs font-semibold text-rose-600">
                  <span>Failed Deliveries</span>
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-rose-600">
                  {monitorStats.failed}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Requeue available</p>
              </div>
            </div>

            {/* Monitor Log Table */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-sage-600" />
                  <span className="font-bold text-slate-900 text-xs sm:text-sm">
                    Multi-Channel Delivery Audit Trail
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Channel Filter Chips */}
                  <div className="flex items-center gap-1 text-xs">
                    {['all', 'in_app', 'email', 'push', 'failed'].map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setMonitorFilter(f)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                          monitorFilter === f
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                      >
                        {f === 'all' ? 'All' : f === 'in_app' ? 'In-App' : f === 'email' ? 'Email' : f === 'push' ? 'Push' : 'Failed'}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={loadDeliveryMonitorData}
                    disabled={loadingMonitor}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer"
                    title="Refresh Delivery Queue"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", loadingMonitor && "animate-spin")} />
                  </button>
                </div>
              </div>

              {loadingMonitor ? (
                <div className="p-6">
                  <TableSkeleton rows={6} cols={6} />
                </div>
              ) : filteredMonitorLogs.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <Send className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
                  <p className="text-sm font-semibold text-slate-600">No delivery logs recorded</p>
                  <p className="text-xs text-slate-400 mt-0.5">Notification dispatches will populate this real-time queue.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-4">Notification / Event</th>
                        <th className="py-3 px-4">Channel</th>
                        <th className="py-3 px-4">Recipient</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Timestamp</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {filteredMonitorLogs.map(item => {
                        const isFailed = item.status === 'failed';
                        const isSent = item.status === 'sent';
                        const isPending = item.status === 'pending';

                        const channelBadge =
                          item.channel === 'email' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          item.channel === 'push' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          'bg-blue-50 text-blue-700 border-blue-200';

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3.5 px-4 font-bold text-slate-900 max-w-[260px]">
                              <div className="truncate" title={item.title}>{item.title}</div>
                              <p className="text-[11px] text-slate-400 font-normal truncate mt-0.5" title={item.message}>
                                {item.message}
                              </p>
                            </td>

                            <td className="py-3.5 px-4">
                              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border", channelBadge)}>
                                {item.channel === 'email' && <Mail className="w-3 h-3" />}
                                {item.channel === 'push' && <Smartphone className="w-3 h-3" />}
                                {item.channel === 'in_app' && <Bell className="w-3 h-3" />}
                                <span className="uppercase">{item.channel}</span>
                              </span>
                            </td>

                            <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 max-w-[140px] truncate" title={item.recipientId}>
                              {item.recipientId}
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              {isSent && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Delivered
                                </span>
                              )}
                              {isPending && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <Clock className="w-3 h-3" />
                                  Pending
                                </span>
                              )}
                              {isFailed && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200" title={item.errorMessage}>
                                  <AlertCircle className="w-3 h-3" />
                                  Failed
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-right font-mono text-[11px] text-slate-400">
                              {item.time}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              {isFailed ? (
                                <button
                                  type="button"
                                  onClick={() => handleRequeue(item)}
                                  disabled={requeuingId === item.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 text-[11px] font-bold border border-rose-200 cursor-pointer disabled:opacity-50"
                                >
                                  <RefreshCw className={cn("w-3 h-3", requeuingId === item.id && "animate-spin")} />
                                  <span>Requeue</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-300 font-mono">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
