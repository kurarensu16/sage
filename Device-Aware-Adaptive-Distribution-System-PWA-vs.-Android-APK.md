# Implementation Plan: Device-Aware Adaptive Distribution System (PWA vs. Android APK)

## 📌 Goal Description
Implement an intelligent **Device-Aware Adaptive Distribution Gateway** for the SAGE web portal. 
The system dynamically inspects the client's operating system environment (`navigator.userAgent` and display mode):
1. **On Android Mobile & Tablets**: Replaces the browser PWA prompt with a direct **"Download Android App (.APK)"** trigger, complete with a step-by-step modal guiding students through the Android "Install Unknown Apps" permission flow.
2. **On iOS Devices (iPhone / iPad)**: Detects Safari/WebKit and presents an **"Add to Home Screen (iOS PWA)"** visual walkthrough.
3. **On Desktop & Laptops (Windows / macOS / Linux / ChromeOS)**: Triggers the native **Browser PWA Installation** prompt (`beforeinstallprompt`).
4. **When Already Installed / Running in Standalone App**: Automatically hides the installation trigger to avoid UI redundancy.

---

## ⚠️ User Review Required

> [!IMPORTANT]
> **APK Storage Location**: Where would you like the `.apk` file to be hosted?
> 1. **Option A (Recommended)**: Public Supabase Storage bucket (e.g., `https://[project-ref].supabase.co/storage/v1/object/public/app-releases/sage-latest.apk`), enabling you to upload new APK versions anytime without rebuilding the web code.
> 2. **Option B**: Bundled directly inside the web app's `public/downloads/sage-latest.apk` folder.

> [!NOTE]
> **Platform Detection Accuracy**: Detection relies on `navigator.userAgent` and `navigator.maxTouchPoints` rather than screen width alone. This guarantees that **iPad and touch laptops are not mistakenly served Android `.apk` files**.

---

## ❓ Open Questions
- What is the exact public URL or filename for the compiled SAGE Android APK? *(Default fallback: Supabase storage or `/downloads/sage-latest.apk`)*.
- Would you like a download banner to appear on the **Public Login page** for mobile visitors, or keep it strictly inside the **Sidebar / Navigation**?

---

## 🛠️ Proposed Changes

### Component 1: Core Platform Detection & Installation Engine

#### [MODIFY] [`src/lib/usePwaInstall.js`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/lib/usePwaInstall.js)
- Extend state to include `platform`: `'android'`, `'ios'`, or `'desktop'`.
- Add Android APK download handler linking to the APK release endpoint.
- Enhance standalone detection (`display-mode: standalone`, `window.navigator.standalone`).
- Export platform metadata, direct download action, and modal trigger states.

---

### Component 2: Smart Adaptive Install Modal & UI Components

#### [NEW] [`src/components/layout/SmartInstallModal.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/components/layout/SmartInstallModal.jsx)
- **Multi-Platform Modal UI**:
  - **Android View**: Features a direct **"Download SAGE APK (.apk)"** button + a 3-step visual guide:
    1. *Download*: Tap "Download Anyway" when prompted by Chrome/browser.
    2. *Open File*: Tap the completed `.apk` notification.
    3. *Install*: Select "Allow from this source" if prompted by Android Security.
  - **iOS View**: Features step-by-step Safari directions with visual icons (*Tap Share `[⎋]` ➔ Tap `Add to Home Screen` ➔ Tap `Add`*).
  - **Desktop View**: Triggers native `deferredPrompt.prompt()` or shows Chrome/Edge address bar install guide (*Click `⊕ Install`*).

#### [MODIFY] [`src/components/layout/Sidebar.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/components/layout/Sidebar.jsx)
- Update the sidebar bottom install trigger:
  - If **Android**: Icon displays `Smartphone` + label *"Download Android App (.APK)"*.
  - If **Desktop**: Icon displays `Monitor` / `Download` + label *"Install Desktop App"*.
  - If **iOS**: Icon displays `Smartphone` + label *"Add to Home Screen"*.
- Replace the legacy static PWA modal with the new `SmartInstallModal`.

#### [MODIFY] [`src/pages/public/Login.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/public/Login.jsx)
- Add an optional, non-intrusive mobile install badge at the bottom of the login card (*e.g., "Using an Android device? Download the Native SAGE App"*) so students can install the APK before logging in.

---

## 🧪 Verification Plan

### Automated & Unit Checks
- Verify `usePwaInstall.js` compiles without runtime errors in Vite dev build (`npm run dev`).
- Verify no lint or build errors with `npm run build`.

### Manual & Cross-Platform Verification
1. **Desktop Test (Chrome / Edge on Windows)**:
   - Verify sidebar displays *"Install Desktop App"*.
   - Click button ➔ Triggers browser native PWA install prompt.
2. **Android Simulation Test (Chrome DevTools Device Toolbar set to Pixel 7 / Galaxy S20)**:
   - Emulate Android user agent.
   - Verify sidebar displays *"Download Android App (.APK)"*.
   - Click button ➔ Opens Android installation modal with step-by-step "Unknown sources" guide and triggers APK download.
3. **iOS Simulation Test (Chrome DevTools set to iPhone 15 / Safari)**:
   - Emulate iOS user agent.
   - Verify modal shows Safari *"Share ➔ Add to Home Screen"* instructions.
4. **Standalone App Check**:
   - Open app in standalone window (or simulate `display-mode: standalone`).
   - Verify install button is automatically hidden.
