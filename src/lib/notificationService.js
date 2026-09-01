import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Initialize local notification channels and permissions.
 */
export async function initLocalNotifications() {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    let permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display === 'prompt' || permStatus.display === 'prompt-with-rationale') {
      permStatus = await LocalNotifications.requestPermissions();
    }

    // Create high-priority notification channel for Android heads-up popups & lockscreen
    await LocalNotifications.createChannel({
      id: 'sage-alerts',
      name: 'SAGE Alerts',
      description: 'Urgent academic updates, grading alerts, and official notices from SAGE',
      importance: 5, // High importance -> Heads-up popup banner
      visibility: 1, // Public -> Visible on lock screen
      vibration: true,
      lights: true,
      lightColor: '#2563EB',
    });

    return permStatus.display === 'granted';
  } catch (err) {
    console.warn('Local notifications initialization skipped or handled:', err);
    return false;
  }
}

/**
 * Schedule or immediately display a native device notification banner.
 */
export async function showLocalNotification({
  title = 'SAGE Notification',
  body = '',
  id = Math.floor(Math.random() * 1000000),
  payload = null,
  delayMs = 0
}) {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            channelId: 'sage-alerts',
            schedule: delayMs > 0 ? { at: new Date(Date.now() + delayMs) } : undefined,
            extra: payload,
            smallIcon: 'ic_launcher',
            iconColor: '#2563EB',
          }
        ]
      });
      return true;
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      // Browser fallback when running on desktop web
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
        return true;
      } else if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          new Notification(title, { body });
          return true;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to display native notification:', err);
  }
  return false;
}

/**
 * Trigger a sample test notification customized for the user's role.
 */
export async function sendTestNotification(role = 'student', delayMs = 0) {
  const roleSamples = {
    student: {
      title: '📊 Grade Released',
      body: 'Your Midterm Grade for Capstone Project 1 (IT401) has been officially posted.',
    },
    faculty: {
      title: '📋 Grade Override Request Approved',
      body: 'The Dean\'s Office approved your grade override request for Sophia Bernardo.',
    },
    dean: {
      title: '🏛️ Grade Sheet Pending Approval',
      body: 'Prof. Amanda Rivera submitted final grade sheets for IT401 for your approval.',
    },
    office: {
      title: '🏢 Student Roster Processed',
      body: 'Batch synchronization completed for College of Computer Studies.',
    },
    admin: {
      title: '🛡️ SAGE Audit Log Alert',
      body: 'System notice: SAGE Platform Registry core auto-synchronized successfully.',
    }
  };

  const sample = roleSamples[role] || roleSamples.student;
  return await showLocalNotification({
    title: sample.title,
    body: sample.body,
    id: Date.now() % 1000000,
    payload: { role, isTest: true },
    delayMs
  });
}

