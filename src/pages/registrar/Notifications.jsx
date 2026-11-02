import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import {
  Bell, Trash2, AlertTriangle, Info, MailOpen, FileCheck,
  CheckSquare, Square, Users
} from 'lucide-react';
import { cn, formatRelativeTime } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { dismissNotifications, markNotificationsRead } from '../../lib/notificationDispatcher';
import { useAuth } from '../../lib/AuthContext';
import { getCachedData, setCachedData } from '../../lib/dataCache';
import { CardListSkeleton } from '../../components/common/Skeleton';

// Registrar notifications.
//
// This route must exist: Topbar.jsx:87 links the bell to `/${role}/notifications`
// generically, so without it a registrar's bell would land on NotFound.
//
// Modelled on the other portals' notification pages rather than reusing Admin's,
// which carries admin-only delivery-queue monitoring, or Dean's, which carries
// dean_referral handling that has no registrar meaning. The shared helpers
// (markNotificationsRead / dismissNotifications) and cache convention are the
// same as every other portal, so behaviour stays consistent.

const FILTERS = ['All', 'Unread', 'Records', 'System'];

function decorate(row) {
  let group = 'system';
  let title = row.title || 'System Notification';
  let icon = Info;
  let iconColor = 'text-slate-600 bg-slate-50 border-slate-200';

  if (row.type === 'roster_import') {
    group = 'records';
    title = row.title || 'Roster Imported';
    icon = Users;
    iconColor = 'text-sage-700 bg-sage-50 border-sage-200';
  } else if (row.type === 'term_rollover_reminder') {
    group = 'system';
    title = row.title || 'Academic Term Notice';
    icon = FileCheck;
    iconColor = 'text-blue-600 bg-blue-50 border-blue-200';
  } else if (row.type === 'override_request') {
    group = 'records';
    title = row.title || 'Grade Correction Notice';
    icon = AlertTriangle;
    iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
  } else if (row.type === 'security') {
    group = 'system';
    title = row.title || 'Security Alert';
    icon = AlertTriangle;
    iconColor = 'text-rose-600 bg-rose-50 border-rose-200';
  }

  return {
    id: row.notification_id,
    group,
    title,
    message: row.message,
    time: formatRelativeTime(row.created_at),
    read: row.is_read,
    // Only follow links that stay inside this portal; a link pointing at
    // another portal's route would 403 against the registrar RoleGuard.
    link: typeof row.link === 'string' && row.link.startsWith('/registrar/') ? row.link : null,
    icon,
    iconColor
  };
}

export default function RegistrarNotifications() {
  const navigate = useNavigate();
  const { user, refreshUnreadCount } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [notifications, setNotifications] = useState([]);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const cacheKey = user ? `registrar_notifs_${user.id}` : null;

  useEffect(() => {
    async function load() {
      if (!user) return;
      const cached = getCachedData(cacheKey, 120000); // 2 min TTL, same as other portals
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

        const mapped = (data || []).map(decorate);
        setNotifications(mapped);
        setCachedData(cacheKey, mapped);
      } catch (err) {
        console.error('Error loading registrar notifications:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, cacheKey]);

  const markAllRead = async () => {
    if (!user || notifications.length === 0) return;
    try {
      await markNotificationsRead();
      const updated = notifications.map((n) => ({ ...n, read: true }));
      setNotifications(updated);
      setCachedData(cacheKey, updated);
      refreshUnreadCount?.();
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  const markAsRead = async (id) => {
    try {
      await markNotificationsRead([id]);
      const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
      setNotifications(updated);
      if (cacheKey) setCachedData(cacheKey, updated);
      refreshUnreadCount?.();
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleCardClick = (noti) => {
    if (noti.link) {
      if (!noti.read) markAsRead(noti.id);
      navigate(noti.link);
      return;
    }
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(noti.id)) next.delete(noti.id);
      else next.add(noti.id);
      return next;
    });
    if (!noti.read) markAsRead(noti.id);
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(
    () =>
      notifications.filter((n) => {
        if (activeFilter === 'Unread') return !n.read;
        if (activeFilter === 'Records') return n.group === 'records';
        if (activeFilter === 'System') return n.group === 'system';
        return true;
      }),
    [notifications, activeFilter]
  );

  const isAllSelected = filtered.length > 0 && filtered.every((n) => selectedIds.has(n.id));

  const toggleSelectAll = () => {
    if (isAllSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((n) => n.id)));
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0 || isDeleting) return;
    setIsDeleting(true);
    try {
      await dismissNotifications(Array.from(selectedIds));
      const remaining = notifications.filter((n) => !selectedIds.has(n.id));
      setNotifications(remaining);
      setSelectedIds(new Set());
      if (cacheKey) setCachedData(cacheKey, remaining);
      refreshUnreadCount?.();
    } catch (err) {
      console.error('Error deleting selected notifications:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) return <CardListSkeleton count={5} />;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      <PageHeader title="Notifications" breadcrumb="Registrar Portal">
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap"
          >
            <MailOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Mark all read</span>
            <span className="sm:hidden">Read all</span>
          </button>
        )}
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        {/* ── Filter tabs ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                activeFilter === tab
                  ? 'bg-sage-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              )}
            >
              {tab}
              {tab === 'Unread' && unreadCount > 0 && (
                <span className="ml-1.5 font-mono tabular-nums">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Bulk bar ────────────────────────────────────────────────────── */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
            >
              {isAllSelected ? (
                <CheckSquare className="h-4 w-4 text-sage-600" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Select all
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={deleteSelected}
                disabled={isDeleting}
                className="text-xs font-medium text-rose-600 hover:text-rose-700 flex items-center gap-1.5 ml-auto cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete {selectedIds.size}
              </button>
            )}
          </div>
        )}

        {/* ── List ────────────────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center justify-center text-center">
            <Bell className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">Nothing here</p>
            <p className="text-xs text-slate-400 mt-1">
              No registrar notifications match this filter.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((noti) => {
              const Icon = noti.icon;
              const expanded = expandedIds.has(noti.id);
              const selected = selectedIds.has(noti.id);
              return (
                <div
                  key={noti.id}
                  onClick={() => handleCardClick(noti)}
                  className={cn(
                    'bg-white rounded-2xl border shadow-2xs p-3.5 sm:p-4 flex items-start gap-3 cursor-pointer transition-colors',
                    noti.read ? 'border-slate-200/90' : 'border-sage-200 bg-sage-50/30',
                    selected && 'ring-2 ring-sage-300'
                  )}
                >
                  <button
                    onClick={(e) => toggleSelect(noti.id, e)}
                    className="mt-0.5 flex-shrink-0 cursor-pointer"
                    aria-label={selected ? 'Deselect' : 'Select'}
                  >
                    {selected ? (
                      <CheckSquare className="h-4 w-4 text-sage-600" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-300" />
                    )}
                  </button>

                  <div
                    className={cn(
                      'w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0',
                      noti.iconColor
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className={cn(
                          'text-xs sm:text-sm truncate',
                          noti.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'
                        )}
                      >
                        {noti.title}
                      </h3>
                      {!noti.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-sage-600 flex-shrink-0" />
                      )}
                    </div>
                    <p
                      className={cn(
                        'text-[11px] sm:text-xs text-slate-500 mt-0.5',
                        !expanded && 'line-clamp-2'
                      )}
                    >
                      {noti.message}
                    </p>
                    <span className="text-[10px] text-slate-400 mt-1 block">{noti.time}</span>
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
