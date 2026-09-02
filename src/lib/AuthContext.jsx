/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { initLocalNotifications, showLocalNotification } from './notificationService';
import { NOTIFICATION_TITLES } from './notificationDispatcher';

const AuthContext = createContext({});

export const registerPushNotifications = async (userId) => {
  if (!Capacitor.isNativePlatform() || !userId) return;

  try {
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') return;

    // Listeners must be attached BEFORE calling PushNotifications.register()
    await PushNotifications.addListener('registration', async (token) => {
      try {
        await supabase.from('user_push_tokens').upsert({
          user_id: userId,
          token: token.value,
          platform: Capacitor.getPlatform(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'token' });
      } catch (tokenErr) {
        console.warn('Failed to save push token to DB:', tokenErr);
      }
    });

    await PushNotifications.addListener('registrationError', (error) => {
      console.warn('Push notification registration warning (FCM project setup pending):', error);
    });

    try {
      await PushNotifications.register();
    } catch (regErr) {
      console.warn('PushNotifications.register handled gracefully:', regErr);
    }
  } catch (err) {
    console.warn('Push notification initialization gracefully bypassed:', err);
  }
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const displayedNotificationIds = useRef(new Set());
  const initialLoadDone = useRef(false);

  const fetchUnreadCount = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .eq('is_read', false);
      if (!error && typeof count === 'number') {
        setUnreadCount(count);
      }
    } catch (err) {
      console.warn('Error fetching unread notification count:', err);
    }
  }, []);

  const fetchUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*, departments(name)')
        .eq('user_id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching user profile:', error);
      } else {
        if (data?.status === 'archived') {
          // Force sign out archived user session in background
          await supabase.auth.signOut();
          setUserProfile(null);
        } else {
          setUserProfile(data);
          registerPushNotifications(userId);
          initLocalNotifications();
          fetchUnreadCount(userId);
        }
      }
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Native deep-link auth parser (Supabase JS v2 compatible)
    let appUrlListener;
    if (Capacitor.isNativePlatform()) {
      const listenerPromise = CapApp.addListener('appUrlOpen', async ({ url }) => {
        try {
          // A. Parse implicit hash parameters (#access_token=...&refresh_token=...)
          const hashIndex = url.indexOf('#');
          if (hashIndex !== -1) {
            const hash = url.substring(hashIndex + 1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');

            if (accessToken && refreshToken) {
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              return;
            }
          }

          // B. Parse PKCE query code (?code=...)
          if (url.includes('code=')) {
            const urlObj = new URL(url);
            const code = urlObj.searchParams.get('code');
            if (code) {
              await supabase.auth.exchangeCodeForSession(code);
            }
          }
        } catch (deepLinkErr) {
          console.error('Error handling deep link auth in Capacitor:', deepLinkErr);
        }
      });

      listenerPromise.then((h) => {
        appUrlListener = h;
      });
    }

    // 2. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // 3. Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
        setLoading(false);
        setUnreadCount(0);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (appUrlListener) {
        appUrlListener.remove();
      }
    };
  }, []);

  // 4. Real-time notifications listener & active database sync for native popups and live badge
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    // Reset state for this userId so new sessions always get a fresh baseline
    displayedNotificationIds.current = new Set();
    initialLoadDone.current = false;

    initLocalNotifications();
    fetchUnreadCount(userId);

    // 1. Initial baseline: Record current existing notifications once to avoid re-alerting on app launch
    const initBaseline = async () => {
      try {
        const { data: existing } = await supabase
          .from('notifications')
          .select('notification_id')
          .eq('recipient_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);
        if (existing) {
          existing.forEach(n => displayedNotificationIds.current.add(n.notification_id));
        }
        initialLoadDone.current = true;
      } catch (e) {
        console.warn('Baseline notification check error:', e);
        initialLoadDone.current = true;
      }
    };
    initBaseline();

    // 2. Active Sync Engine: Regularly checks database for newly inserted unread notifications
    const syncUnreadNotifications = async () => {
      if (!initialLoadDone.current) return;
      try {
        const { data: unreadNotifs, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('recipient_id', userId)
          .eq('is_read', false)
          .order('created_at', { ascending: false })
          .limit(15);

        if (!error && unreadNotifs) {
          setUnreadCount(unreadNotifs.length);
          for (const n of unreadNotifs) {
            if (!displayedNotificationIds.current.has(n.notification_id)) {
              displayedNotificationIds.current.add(n.notification_id);
              const title = NOTIFICATION_TITLES[n.type] || 'SAGE Notification';
              await showLocalNotification({
                title,
                body: n.message || 'You have a new update in SAGE.',
                payload: n
              });
            }
          }
        }
      } catch (err) {
        console.warn('Active notification poller error:', err);
      }
    };

    // Poll every 3 seconds for instant on-device notification delivery
    const pollerInterval = setInterval(syncUnreadNotifications, 3000);

    // Sync immediately when app is brought to the foreground
    let appStateListener = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) syncUnreadNotifications();
      }).then(l => { appStateListener = l; });
    }

    // A. Realtime Broadcast channel (for sub-second cross-device push)
    const broadcastChannel = supabase
      .channel('sage-realtime-alerts', { config: { broadcast: { self: true } } })
      .on('broadcast', { event: 'notification' }, async (event) => {
        const notif = event.payload;
        if (notif && notif.recipient_id === userId) {
          if (!displayedNotificationIds.current.has(notif.notification_id)) {
            displayedNotificationIds.current.add(notif.notification_id);
            setUnreadCount((prev) => prev + 1);
            const title = NOTIFICATION_TITLES[notif.type] || 'SAGE Notification';
            await showLocalNotification({
              title,
              body: notif.message || 'You have a new update in SAGE.',
              payload: notif
            });
          }
        }
      })
      .subscribe();

    // B. Postgres changes channel (database persistence listener fallback)
    const dbChannel = supabase
      .channel(`realtime-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`
        },
        async (payload) => {
          const n = payload.new;
          if (n && !displayedNotificationIds.current.has(n.notification_id)) {
            displayedNotificationIds.current.add(n.notification_id);
            setUnreadCount((prev) => prev + 1);
            const title = NOTIFICATION_TITLES[n.type] || 'SAGE Notification';
            await showLocalNotification({
              title,
              body: n.message || 'You have a new update in SAGE.',
              payload: n
            });
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollerInterval);
      if (appStateListener) appStateListener.remove();
      supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(dbChannel);
    };
  }, [session?.user?.id, fetchUnreadCount]);

  const signOut = async () => {
    setLoading(true);
    setUserProfile(null);
    setSession(null);
    setUnreadCount(0);
    await supabase.auth.signOut();
    setLoading(false);
  };

  const value = {
    session,
    user: session?.user ?? null,
    profile: userProfile,
    role: userProfile?.role ?? null,
    loading,
    unreadCount,
    refreshUnreadCount: () => session?.user && fetchUnreadCount(session.user.id),
    signOut,
    refreshProfile: () => session?.user && fetchUserProfile(session.user.id),
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

