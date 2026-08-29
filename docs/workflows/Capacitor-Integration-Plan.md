# SAGE — Capacitor Integration Plan

> Goal: Wrap the existing SAGE Vite + React app into a native Android/iOS app using Capacitor.js,
> deployable to Google Play Store and Apple App Store — **without rewriting any existing code**.  
> Status: **Not Started**

---

## Overview

Capacitor works by building your web app (`npm run build` → `dist/`) and syncing it into a
native Android or iOS project shell. Your React, Tailwind, Supabase, and react-router code
remain identical. Only a thin configuration layer and a few compatibility fixes are needed.

```
src/ (React + Tailwind + Supabase)  ← untouched
        ↓  npm run build
      dist/
        ↓  npx cap sync
  android/   ←→  Android Studio → APK → Google Play
  ios/        ←→  Xcode → IPA → App Store
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js ≥ 18 | Already satisfied |
| Android Studio (Ladybug or later) | For Android builds |
| Xcode 15+ (macOS only) | For iOS builds |
| Apple Developer Account ($99/yr) | Required for App Store |
| Google Play Console Account ($25 one-time) | Required for Play Store |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Already in `.env.local` |

> **iOS builds require a Mac.** Android builds can be done on Windows.

---

## Phase 1 — Install & Configure Capacitor

### 1.1 Install dependencies

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
```

### 1.2 Initialize Capacitor

```bash
npx cap init SAGE ph.edu.dyci.sage --web-dir dist
```

This generates `capacitor.config.ts` in the project root.

### 1.3 Configure `capacitor.config.ts`

```ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ph.edu.dyci.sage',
  appName: 'SAGE',
  webDir: 'dist',
  server: {
    // Required for Supabase Auth (cookie-based sessions need https scheme)
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
```

### 1.4 Add npm scripts to `package.json`

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "cap:sync": "npm run build && npx cap sync",
  "cap:android": "npm run cap:sync && npx cap open android",
  "cap:ios": "npm run cap:sync && npx cap open ios"
}
```

### 1.5 Add native platforms

```bash
npx cap add android
npx cap add ios
```

---

## Phase 2 — Code Compatibility Fixes

### 2.1 Fix: `BrowserRouter` → `HashRouter`

**File:** `src/App.jsx` (line 1)

Capacitor serves the app from a `file://` origin on device. `BrowserRouter` relies on
the History API which doesn't work from `file://`. Switch to `HashRouter`:

```diff
- import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
+ import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

  // ...

- <BrowserRouter>
+ <HashRouter>
    {/* all routes unchanged */}
- </BrowserRouter>
+ </HashRouter>
```

> **Note:** This changes URLs from `/admin/dashboard` to `/#/admin/dashboard` in the browser.
> The web (PWA) version still works fine with `HashRouter`. No route paths change.

### 2.2 Fix: Supabase Auth Deep Links (Password Reset / Magic Links)

Supabase sends email links (password reset, invite) that open in the browser. On mobile,
these need to redirect back into the SAGE app via a custom URL scheme.

**Step 1 — Add redirect URL in Supabase Dashboard:**
- Go to: Authentication → URL Configuration → Redirect URLs
- Add: `ph.edu.dyci.sage://login-callback`

**Step 2 — Install the App plugin:**
```bash
npm install @capacitor/app
```

**Step 3 — Handle deep link in `src/lib/AuthContext.jsx`:**

```js
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// Inside AuthProvider useEffect:
if (Capacitor.isNativePlatform()) {
  App.addListener('appUrlOpen', ({ url }) => {
    // Supabase appends token to the URL after #
    const fragment = url.split('#')[1];
    if (fragment) {
      supabase.auth.getSessionFromUrl({ storeSession: true });
    }
  });
}
```

**Step 4 — Android: register the URL scheme in `android/app/src/main/AndroidManifest.xml`:**
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="ph.edu.dyci.sage" />
</intent-filter>
```

### 2.3 Risk: `html2pdf.js` and `xlsx` on Mobile WebView

Both libraries are used for report exports. iOS WebView (WKWebView) has sandboxing issues
with DOM-based PDF/file generation.

**Recommended approach — gate exports to web-only:**

```js
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

{!isNative && (
  <button onClick={exportPDF}>Export PDF</button>
)}
```

**Long-term:** Use `@capacitor/filesystem` + Supabase Edge Functions for server-side PDF
generation and native file download.

### 2.4 Vite Config

`vite.config.js` needs no changes. Capacitor reads from `dist/` after `npm run build`.
The `server.port: 5175` only affects the dev server.

---

## Phase 3 — Native Features (Optional Enhancements)

### 3.1 Push Notifications (Highest Priority)

```bash
npm install @capacitor/push-notifications
```

Integrate with Supabase Edge Functions → FCM (Firebase Cloud Messaging):

| Trigger | Recipient | Message |
|---|---|---|
| `posted_grades` row inserted | Student | "Your grades for [subject] have been posted" |
| `evaluation_windows` activated | Faculty | "A new evaluation window is now open" |
| `grade_unlock_requests` approved | Faculty | "Your unlock request was approved" |

### 3.2 Biometric Authentication

```bash
npm install capacitor-biometric-auth
```

Add a "Use Fingerprint / Face ID" toggle on the Login page as an alternative to
email + password. Stores credentials securely in the native keychain.

### 3.3 Status Bar & Splash Screen

```bash
npm install @capacitor/status-bar @capacitor/splash-screen
```

Match the SAGE dark theme:
```ts
StatusBar.setStyle({ style: Style.Dark });
StatusBar.setBackgroundColor({ color: '#0f172a' }); // sage-bg token
```

---

## Phase 4 — Build & Deploy

### 4.1 Android Build

```bash
npm run cap:android
# Opens Android Studio
# Build → Generate Signed Bundle/APK → Android App Bundle (.aab)
# Upload .aab to Google Play Console
```

### 4.2 iOS Build (requires Mac + Xcode)

```bash
npm run cap:ios
# Opens Xcode
# Product → Archive → Distribute App → App Store Connect
```

### 4.3 Version Parity

Keep version numbers in sync across:

| File | Field |
|---|---|
| `package.json` | `"version"` |
| `android/app/build.gradle` | `versionName`, `versionCode` |
| `ios/App/App.xcodeproj` | `MARKETING_VERSION` |

---

## Phase 5 — App Store Assets

| Asset | Size | Notes |
|---|---|---|
| App Icon | 1024×1024 px | No alpha channel for iOS |
| Android Adaptive Icon | 108×108 dp | Foreground + background layers |
| Play Store Feature Graphic | 1024×500 px | |
| Android Screenshots | Min 2 per device type | Phone + tablet |
| iOS Screenshots | Min 3 per screen size | 6.9", 6.5", 5.5" |
| Short Description | ≤80 chars | |
| Full Description | ≤4000 chars | |

---

## Known Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Supabase session not persisting on cold start | High | Use `androidScheme: 'https'` + test session restore |
| `html2pdf.js` crashes on iOS WKWebView | Medium | Gate export buttons behind `Capacitor.isNativePlatform()` |
| `HashRouter` breaks existing Supabase email redirect URLs | Medium | Update all Supabase Dashboard redirect URLs to use `/#/` prefix |
| App Store rejection (student grade data, FERPA) | Low | Add Privacy Policy URL + data disclosures in listing |
| Android back button conflicts with react-router | Low | Use `@capacitor/app` `backButton` listener → `history.back()` |

---

## Progress Tracker

- [ ] Phase 1: Install & configure Capacitor
- [ ] Phase 2.1: Switch `BrowserRouter` → `HashRouter` in `src/App.jsx`
- [ ] Phase 2.2: Supabase deep link handling in `AuthContext.jsx`
- [ ] Phase 2.3: Gate PDF/Excel exports on non-native platforms
- [ ] Phase 3.1: Push notifications via FCM + Supabase Edge Functions
- [ ] Phase 3.2: Biometric authentication on Login page
- [ ] Phase 3.3: Status bar + splash screen theming
- [ ] Phase 4.1: Android build + Play Store upload
- [ ] Phase 4.2: iOS build + App Store Connect upload
- [ ] Phase 5: Store listing assets + descriptions

---

*SAGE Capacitor Integration Plan — DYCI Capstone Project*
