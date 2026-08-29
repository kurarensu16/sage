/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';

const AuthContext = createContext({});

export const registerPushNotifications = async (userId) => {
  if (!Capacitor.isNativePlatform() || !userId) return;

  try {
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      try {
        await supabase.from('user_push_tokens').upsert({
          user_id: userId,
          token: token.value,
          platform: Capacitor.getPlatform(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'token' });
      } catch (tokenErr) {
        console.error('Failed to save push token to DB:', tokenErr);
      }
    });
  } catch (err) {
    console.error('Error during push notification setup:', err);
  }
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

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
      }
    });

    return () => {
      subscription.unsubscribe();
      if (appUrlListener) {
        appUrlListener.remove();
      }
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    setUserProfile(null);
    setSession(null);
    await supabase.auth.signOut();
    setLoading(false);
  };

  const value = {
    session,
    user: session?.user ?? null,
    profile: userProfile,
    role: userProfile?.role ?? null,
    loading,
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
