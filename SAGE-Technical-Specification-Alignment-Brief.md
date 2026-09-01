# SAGE Technical Specification & Alignment Brief
## Mobile Architecture, Push Notification Scope & Defense Hardening

**Document Reference**: SAGE-TECH-RFC-2026-001  
**Project Title**: Smart Academic Grading & Evaluation System (SAGE)  
**Target Institution**: Dr. Yanga's Colleges, Inc. (DYCI)  
**Package Identifier**: `ph.edu.dyci.sage` (v1.0.0)  
**Distribution**: SAGE Software Engineering Team (Frontend, Mobile, Backend) & Capstone Research Group  
**Date Created**: August 31, 2026  

---

## 1. Executive Summary & Purpose

This technical specification establishes the implementation baseline for the mobile and cross-platform architecture of SAGE. Following the successful compilation and initial hardware verification of **SAGE Mobile v1.0.0 APK (`ph.edu.dyci.sage`)**, this document formally establishes:

1. **Push Notification Architecture & Multi-Role Scope**: Formally documenting the implemented Multi-Role Enterprise notification model powered by a hybrid Supabase Realtime + `@capacitor/local-notifications` and FCM device token pipeline.
2. **Academic Defense Safeguards**: Implementing specific technical controls in routing, file exports, and adaptive app distribution to neutralize critical scrutiny vectors during the upcoming Capstone Thesis Defense.
3. **Engineering Deliverables Return Protocol**: Defining the exact files, build artifacts, and configuration tokens returned to the Capstone documentation lead upon milestone completion.

---

## 2. Push Notification Architecture & Multi-Role Scope

The SAGE platform implements a **Multi-Role Enterprise Push Notification Architecture** utilizing a hybrid event delivery pipeline combining Supabase Realtime WebSockets, native heads-up/lockscreen notifications via `@capacitor/local-notifications`, and FCM device token management via `@capacitor/push-notifications`.

```
                    SAGE MULTI-ROLE HYBRID NOTIFICATION PIPELINE
                                         │
 ┌───────────────────────────────────────┴───────────────────────────────────────┐
 │ 1. EVENT TRIGGER LAYER (`src/lib/notificationDispatcher.js`)                  │
 │    • Dispatches role-tailored payloads to Supabase `public.notifications`     │
 └───────────────────────────────────────┬───────────────────────────────────────┘
                                         ▼
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │ 2. REALTIME TRANSPORT LAYER (`src/lib/AuthContext.jsx`)                       │
 │    • Supabase Realtime WebSocket channel (`realtime-notifications-${userId}`) │
 │    • Live sync on `postgres_changes` (INSERT) filtered by recipient_id        │
 └───────────────────────────────────────┬───────────────────────────────────────┘
                                         ▼
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │ 3. NATIVE DEVICE DELIVERY LAYER (`src/lib/notificationService.js`)            │
 │    • Android High-Importance Channel (`sage-alerts`) with vibration & LED     │
 │    • `@capacitor/local-notifications` instant heads-up / lockscreen banner    │
 │    • In-app unread counter badge & sound alerts                               │
 └───────────────────────────────────────┬───────────────────────────────────────┘
                                         ▼
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │ 4. DEVICE TOKEN MANAGEMENT (`public.user_push_tokens`)                        │
 │    • Normalized multi-device tokens captured via `@capacitor/push-notifications`│
 └───────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Notification Triggers & Payloads by Role

1. **Students**:
   * **Milestone Grade Release**: Dispatched when faculty commits term/final grades (`posted_grades`).  
     *Payload*: `"Your [Term] grades for [Subject Code] have been officially posted by Prof. [Faculty Name]."`
   * **Evaluation Window Activation**: Dispatched when an active survey window opens (`evaluation_windows`).  
     *Payload*: `"Faculty evaluation period is now open for [Subject Code]. Please complete the survey for Prof. [Faculty Name]."`
   * **Evaluation Window Closure**: Dispatched upon survey timeline completion.  
     *Payload*: `"The faculty evaluation survey period for [Subject Code] has officially closed."`
   * **Failure Due to Absences (FDA) Early Warning**: Dispatched when recorded absences reach 4 or more (`attendance_records` count $\ge 4$).  
     *Payload*: `"Attendance Advisory: You have accumulated 4+ absences in [Subject Code]."`
   * **Grade Correction Resolution**: Dispatched upon Dean override approval (`remark_override_requests`).  
     *Payload*: `"A grade correction request for [Subject Code] has been approved."`

2. **Faculty**:
   * **Evaluation Window Active**: Dispatched when evaluation opens for assigned section to encourage survey completion.
   * **Evaluation Reports Compiled**: Dispatched when evaluation window closes and ratings are aggregated.
   * **Remark Override Status**: Dispatched when Dean approves or rejects a submitted grade correction request.
   * **Class Assignment**: Dispatched when new subject loads are assigned to faculty profile.

3. **College Deans**:
   * **Grade Change Requests Pending**: Dispatched when faculty submits a student remark override request requiring review.
   * **Faculty Evaluation Compilation**: Dispatched when department evaluation windows close for performance inspection.

4. **College Office**:
   * **Evaluation Window Publication**: Confirmation of published evaluation timelines.
   * **Department Roster Synchronization**: Dispatched upon batch student registration and section import completion.

5. **System Administrators**:
   * **Security Notices**: Dispatched when institutional user accounts are disabled, enabled, or archived.
   * **Administrative Activity**: Real-time alerts for subject, section, grading template, and term management changes.

---

## 3. Defense Panel Scrutiny Vectors & Technical Safeguards

To ensure the system withstands rigorous academic defense questioning, the codebase implements and verifies the following four architectural safeguards:

```
                            PANELIST SCRUTINY VECTORS & CONTROLS
                                             │
   ┌──────────────────────┬──────────────────┴──────────────────┬──────────────────────┐
   ▼                      ▼                                     ▼                      ▼
1. DISTRIBUTION        2. PLATFORM DIVERSITY                 3. ROUTING INTEGRITY   4. RUNTIME STABILITY
Institutional          OS-Aware Safari PWA                   Native Deep-Linking    Role-Separated Export
Sideloading Gateway    Fallback for iOS                      & HTTPS Scheme         Sandboxing
```

### 3.1 Distribution Scrutiny: "Absence of Public App Store Listings"
* **Panel Inquiry**: *"Why is the application not published on the Google Play Store or Apple App Store?"*
* **Engineering Solution & Codebase Verification**: 
  * SAGE implements a **Device-Aware Adaptive Distribution Gateway** via `src/lib/usePwaInstall.js` and `src/components/layout/SmartInstallModal.jsx`.
  * **Android Clients**: When accessed from Android browsers, the portal automatically presents a direct **"Download Android App (.APK)"** trigger pulling `sage-latest.apk` from the public Supabase Storage bucket (`https://ettnwknyhdhehoclrwwh.supabase.co/storage/v1/object/public/app-releases/sage-latest.apk`) alongside a 3-step *"Install Unknown Apps"* security permission walkthrough.
  * **Desktop Clients**: Triggers standard native browser PWA installation (`beforeinstallprompt`).
  * **Standalone App Suppression**: Install prompts automatically hide when running in standalone mode (`display-mode: standalone` or `Capacitor.isNativePlatform()`).
* **Official Defense Justification**: SAGE is a closed institutional enterprise platform for Dr. Yanga's Colleges, Inc. Direct institutional sideloading eliminates recurring commercial store developer fees ($99/year Apple, $25 Google) and protects internal campus authentication endpoints from public search indexing and scraping.

---

### 3.2 Platform Diversity Scrutiny: "iOS Compatibility Without macOS Build Pipelines"
* **Panel Inquiry**: *"How are iOS (iPhone/iPad) users accommodated if native binary compilation was executed on Windows?"*
* **Engineering Solution & Codebase Verification**:
  * Platform detection layer in `src/lib/usePwaInstall.js` inspects both `navigator.userAgent` and `navigator.maxTouchPoints > 1` (guaranteeing iPadOS in desktop browsing mode is properly identified as an Apple tablet, not a macOS laptop).
  * iOS devices are automatically routed to the Apple-certified **PWA 'Add to Home Screen'** visual onboarding guide (Step 1: Open Safari ➔ Step 2: Tap Share `[⎋]` ➔ Step 3: Tap *"Add to Home Screen"*).
  * Incompatible `.apk` binaries are strictly withheld from non-Android clients.
* **Official Defense Justification**: SAGE provides **100% cross-platform device coverage** by pairing a compiled native Android APK with an Apple-standard standalone PWA container for iOS.

---

### 3.3 Routing Integrity Scrutiny: "Deep Linking & Single-Page History in Native Containers"
* **Panel Inquiry**: *"How are authentication redirects and password reset callbacks handled within the hybrid container?"*
* **Engineering Solution & Codebase Verification**:
  1. **Custom Intent Filter**: `android/app/src/main/AndroidManifest.xml` registers an intent-filter for scheme `ph.edu.dyci.sage` (lines 25–30).
  2. **Session Interception**: `src/lib/AuthContext.jsx` registers `CapApp.addListener('appUrlOpen')` (lines 105–136) to capture authentication redirects, PKCE query codes (`?code=...`), and password recovery hash fragments (`#access_token=...`), restoring user session state without spawning an external browser tab.
  3. **HTTPS Scheme Routing**: `capacitor.config.json` configures `server.androidScheme = "https"` and `hostname = "localhost"`, allowing standard React Router (`BrowserRouter` in `src/App.jsx`) navigation without `file://` protocol history conflicts.
* **Official Defense Justification**: Deep-link interception preserves single-page session state securely within the hybrid container, preventing credential or token leakage to third-party mobile browsers.

---

### 3.4 Runtime Stability Scrutiny: "Client-Side Document Export Crashes in Mobile WebViews"
* **Panel Inquiry**: *"Do heavy DOM-based export libraries (`html2pdf.js`, `xlsx`) experience memory leaks or sandboxing failures in mobile WebViews?"*
* **Engineering Solution & Codebase Verification**:
  * **Role-Separated Reporting Architecture**: Heavy multi-page PDF generation (Dean Summary Reports) and master Computation of Grades (COG) Excel compilation (`src/lib/excelExport.js`) are designated strictly as **Desktop Administrative Workflows**.
  * **Mobile Viewport Optimization**: Mobile viewports render reactive DOM tables, attendance logs, and student grade cards with lightweight JSON summaries via `src/components/layout/BottomNav.jsx`, eliminating DOM-to-Canvas memory bloat on mobile hardware.
* **Official Defense Justification**: Architectural role separation prevents mobile WebView memory exhaustion and client crashes, ensuring high responsiveness on student mobile devices.

---

## 4. Technical Implementation & Verification Checklist

The following tasks represent the technical milestones required to close the mobile integration phase:

| Component | Target File(s) | Action Required | Status |
|---|---|---|---|
| **App Configuration** | `capacitor.config.json` & `android/app/build.gradle` | Verify `appId: 'ph.edu.dyci.sage'`, `appName: 'SAGE'`, `androidScheme: 'https'`. | ✅ Confirmed |
| **Android Manifest** | `android/app/src/main/AndroidManifest.xml` | Confirm `INTERNET` permission and `ph.edu.dyci.sage` deep link intent filters. | ✅ Confirmed |
| **FCM / Push Service & Realtime Dispatcher** | `src/lib/notificationService.js`, `src/lib/notificationDispatcher.js`, `user_push_tokens.sql` | Multi-role dispatchers, `sage-alerts` channel, `@capacitor/local-notifications` + FCM registration. | ✅ Confirmed |
| **Deep Link Listener** | `src/lib/AuthContext.jsx` | `CapApp.addListener('appUrlOpen')` intercepts PKCE codes, recovery fragments, and deep links. | ✅ Confirmed |
| **Adaptive UI Gateway** | `src/lib/usePwaInstall.js` & `SmartInstallModal.jsx` | Deploy OS detection logic (Android ➔ Supabase APK; Desktop/iOS ➔ PWA). | 📋 Ready to Deploy |
| **Export Gating** | `src/lib/excelExport.js`, `DeanSummaryReports.jsx`, `BottomNav.jsx` | Scoped heavy exports to desktop administrative workflows; responsive DOM tables on mobile. | ✅ Confirmed |

---

## 5. 📦 Deliverables to Return to Documenter / Capstone Lead

Upon completing the implementation and verification tasks outlined in this specification, the development team must return the following **5 technical deliverables** to the Capstone Documentation Lead:

```
                      REQUIRED DELIVERABLES RETURN PACKAGE
                                       │
   ┌───────────────────┬───────────────┴───────────────┬───────────────────┐
   ▼                   ▼                               ▼                   ▼
1. SIGNED RFC       2. PRODUCTION APK               3. HOSTING URL      4. DB MIGRATION SQL
Selected Option B   Latest Signed Binary            Public Supabase     user_push_tokens.sql
(Multi-Role Hybrid) (SAGE-v1.0.0.apk)               Storage Endpoint    & Realtime Channel
```

### Deliverable Itemization:

1. **Signed Decision Brief (`SAGE-TECH-RFC-2026-001`)**:
   * A completed copy of this document confirming that **Option B (Multi-Role Enterprise Broadcast Model)** powered by **Option C Hybrid Architecture** was executed.
2. **Latest Compiled Production APK (`SAGE-v1.0.0-release.apk`)**:
   * The final compiled Android Application Package binary with debug logs stripped, verified running on physical Android hardware.
3. **Public APK Download / Hosting URL**:
   * The direct endpoint hosted on Supabase Public Storage:  
     `https://ettnwknyhdhehoclrwwh.supabase.co/storage/v1/object/public/app-releases/sage-latest.apk` (configurable via `VITE_ANDROID_APK_URL`).
4. **Database Migration SQL File (`20260829_user_push_tokens.sql`)**:
   * The exact SQL script creating the `public.user_push_tokens` table for normalized multi-device token storage (`user_id`, `token`, `platform`, `updated_at`).
5. **Demonstration Media (Screenshot / Short Screen Recording)**:
   * A 10–20 second screen capture or mobile device screenshot proving successful receipt of a native push notification (e.g., milestone grade release alert) on physical Android hardware for Chapter 4 defense appendix inclusion.

---

## 6. 📝 Important Technical Notes for Developers

> [!IMPORTANT]
> **Version Code & Name Parity**: Ensure that `versionName` ("1.0") and `versionCode` (1) in `android/app/build.gradle` match the `"version"` field in `package.json` at all times.

> [!WARNING]
> **Package ID Strictness**: Do not change the application ID from `ph.edu.dyci.sage` unless absolutely necessary. Changing this ID will break the Firebase `google-services.json` binding, revoke existing push notification tokens, and invalidate deep-link URL callbacks.

> [!NOTE]
> **Android 13+ Notification Permissions**: Remember that Android 13+ (API level 33+) requires a runtime prompt for `POST_NOTIFICATIONS`. Ensure your Capacitor listener invokes `PushNotifications.requestPermissions()` and `LocalNotifications.requestPermissions()` on user login rather than app initialization to maximize user opt-in rates.

> [!TIP]
> **Multi-Role Hybrid Notification Architecture**: The codebase uses `src/lib/notificationDispatcher.js` to write to `public.notifications`, while `src/lib/AuthContext.jsx` subscribes to live database events via Supabase Realtime and triggers high-importance heads-up banners on Android via `@capacitor/local-notifications`.

---

## 7. Architecture Selection & Return Acknowledgment

Please indicate the team's selected architecture below:

- [ ] **Option A Selected**: Student-Centric Mobile Push Notification Architecture
- [x] **Option B Selected**: Multi-Role Enterprise Push Notification Architecture *(with Option C Hybrid Realtime + Native Local Notifications Engine)*
- [x] **Option C Details**: Custom Hybrid Engine Specified Below

**Architecture Summary & Libraries Used**:  
1. **Scope**: Multi-Role Enterprise covering Students (grades, eval windows, absences), Faculty (approvals, eval open), Deans (overrides, report compilation), Office (eval windows, rosters), and Admins (security notices, system events).
2. **Event Dispatcher**: `src/lib/notificationDispatcher.js` inserts records into `public.notifications`.
3. **Realtime Transport**: `src/lib/AuthContext.jsx` opens a Supabase Realtime channel (`realtime-notifications-${userId}`) on `postgres_changes`.
4. **Native Device Popups**: `src/lib/notificationService.js` creates the high-importance `sage-alerts` channel via `@capacitor/local-notifications` to show instant heads-up/lockscreen banners.
5. **Token Management**: `src/lib/AuthContext.jsx` upserts device tokens to `public.user_push_tokens` via `@capacitor/push-notifications`.
6. **Network & Deep Links**: `@capacitor/network` (`useNetworkStatus.js`) and `@capacitor/app` (`CapApp.addListener('appUrlOpen')`).

**Date Created**: August 31, 2026  
**Date Returned**: September 1, 2026
