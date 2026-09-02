/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  // 4. Real-time notifications listener for native popups and live badge
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    initLocalNotifications();
    fetchUnreadCount(userId);

    // A. Realtime Broadcast channel (works instantly cross-device without Postgres WAL configuration)
    const broadcastChannel = supabase
      .channel('sage-realtime-alerts', { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'notification' }, (event) => {
        const notif = event.payload;
        if (notif && notif.recipient_id === userId) {
          setUnreadCount((prev) => prev + 1);
          const title = NOTIFICATION_TITLES[notif.type] || 'SAGE Notification';
          showLocalNotification({
            title,
            body: notif.message || 'You have a new update in SAGE.',
            payload: notif
          });
        }
      })
      .subscribe();

    // B. Postgres changes channel (database persistence listener)
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
        (payload) => {
          const n = payload.new;
          if (n) {
            setUnreadCount((prev) => prev + 1);
            const title = NOTIFICATION_TITLES[n.type] || 'SAGE Notification';
            showLocalNotification({
              title,
              body: n.message || 'You have a new update in SAGE.',
              payload: n
            });
          }
        }
      )
      .subscribe();

    return () => {
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

