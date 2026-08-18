# SAGE Implementation Plan: PWA & Mobile/Tablet Responsiveness

**Target Repository**: `c:\Users\sadia\SAGE`  
**Focus**: Progressive Web App (PWA) & Full Mobile/Tablet Responsiveness  
**Date**: August 5, 2026  

---

## Executive Overview

This implementation plan outlines the steps to turn **SAGE** into an installable **Progressive Web App (PWA)** with a fully responsive layout tailored for smartphones ($\le 768px$), tablets ($\le 1024px$), and desktops.

Per your selection, the **"Install SAGE App"** button will be integrated directly into the **Sidebar bottom footer** (right above the Sign Out button) in [Sidebar.jsx](file:///c:/Users/sadia/SAGE/src/components/layout/Sidebar.jsx).

---

## 1. PWA & Responsiveness Architecture

```
                  ┌─────────────────────────────────────────┐
                  │          SAGE App Core (React 19)       │
                  └────────────────────┬────────────────────┘
                                       │
           ┌───────────────────────────┴───────────────────────────┐
           ▼                                                       ▼
 ┌───────────────────┐                                   ┌───────────────────┐
 │   PWA Layer       │                                   │ Responsive Layer  │
 ├───────────────────┤                                   ├───────────────────┤
 │ • Web Manifest    │                                   │ • Mobile Drawer   │
 │ • Service Worker  │                                   │ • Mobile Cards    │
 │ • Sidebar Button  │                                   │ • Sticky Columns  │
 │ • Offline Badge   │                                   │ • Safe Areas      │
 └───────────────────┘                                   └───────────────────┘
```

---

## 2. Phase-by-Phase Plan

### Phase 1: Web App Manifest & Service Worker Setup (PWA Core)

#### [NEW] [manifest.webmanifest](file:///c:/Users/sadia/SAGE/public/manifest.webmanifest)
- Defines app metadata:
  - `name`: "SAGE - Smart Academic Grading & Evaluation System"
  - `short_name`: "SAGE"
  - `start_url`: "/"
  - `display`: "standalone"
  - `theme_color`: "#0f172a" (Sage Navy)
  - `background_color`: "#f8fafc"
  - `icons`: 192x192, 512x512, and maskable icons.

#### [NEW] [sw.js](file:///c:/Users/sadia/SAGE/public/sw.js)
- Service Worker caching app shell resources (HTML, JS, CSS, Google Fonts Sora/DM Sans/JetBrains Mono, icons).
- Provides instant loading and offline fallback support.

#### [MODIFY] [index.html](file:///c:/Users/sadia/SAGE/index.html)
- Add PWA meta tags:
  - `<meta name="theme-color" content="#0f172a" />`
  - `<meta name="apple-mobile-web-app-capable" content="yes" />`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`
  - `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />`
- Link `manifest.webmanifest` and register Service Worker script.

---

### Phase 2: PWA Installation Trigger Hook & Sidebar Integration

#### [NEW] [usePwaInstall.js](file:///c:/Users/sadia/SAGE/src/lib/usePwaInstall.js)
- React custom hook capturing the browser's `beforeinstallprompt` event.
- Exposes `canInstall` (boolean) and `promptInstall` (trigger function).

#### [MODIFY] [Sidebar.jsx](file:///c:/Users/sadia/SAGE/src/components/layout/Sidebar.jsx)
- Integrate `usePwaInstall()` into the bottom footer section (above Sign Out).
- When `canInstall` is true, renders a sleek button:
  `[ 📲 Install App ]` (with download icon and hover effects, supporting collapsed icon-only mode).

#### [NEW] [OfflineBadge.jsx](file:///c:/Users/sadia/SAGE/src/components/pwa/OfflineBadge.jsx)
- Listens to `online` and `offline` browser events. Displays a floating indicator pill when offline: *"Offline Mode — Using cached data"*.

---

### Phase 3: Mobile & Tablet Layout Responsiveness (`MainLayout`, `Sidebar`, `Header`)

#### [MODIFY] [Sidebar.jsx](file:///c:/Users/sadia/SAGE/src/components/layout/Sidebar.jsx)
- Desktop ($\ge 1024px$): Fixed sidebar navigation panel.
- Mobile/Tablet ($\le 1024px$): Collapsible sliding drawer overlay with backdrop blur and swipe-to-close behavior.

#### [MODIFY] [Header.jsx](file:///c:/Users/sadia/SAGE/src/components/layout/Header.jsx)
- Add hamburger menu button on mobile/tablet viewports to toggle the sidebar drawer.
- Optimize user profile dropdown and Quick Demo Accounts Selector for touch targets.

---

### Phase 4: Complex Data Table & Spreadsheet Mobile/Tablet Adapters

#### [MODIFY] [ScoreInput.jsx](file:///c:/Users/sadia/SAGE/src/pages/faculty/ScoreInput.jsx)
- Wrap wide raw score matrix in `overflow-x-auto` container.
- Pin Student Name & ID column with CSS `sticky left-0 bg-white z-10 shadow-sm` so names remain visible while horizontal scrolling.
- Add compact touch-input drawer for editing scores on phone screens.

#### [MODIFY] [GradeComputationPreview.jsx](file:///c:/Users/sadia/SAGE/src/pages/faculty/GradeComputationPreview.jsx)
- Enable touch scroll wrappers with sticky column headers for raw scores, MR, TFR, and GWA columns.

#### [MODIFY] [MyGradesList.jsx](file:///c:/Users/sadia/SAGE/src/pages/student/MyGradesList.jsx)
- On mobile viewports ($\le 640px$), transform tabular grade listings into stacked card components displaying subject title, MR, TFR, SG, and passing remarks.

---

### Phase 5: Touch Targets, iOS Safe Area & PWA Icon Generation

#### [MODIFY] [index.css](file:///c:/Users/sadia/SAGE/src/index.css)
- Add safe area utility classes: `pb-[env(safe-area-inset-bottom)]`, `pt-[env(safe-area-inset-top)]`.
- Enforce minimum touch target sizing ($44px \times 44px$) for buttons and inputs on touch devices.

#### [NEW] [public/icons/](file:///c:/Users/sadia/SAGE/public/icons/)
- Generate PWA app icon assets (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `icon-maskable.png`).

---

## 3. Verification Plan

### Automated Tests
- Lint codebase for syntax or styling issues:
  ```bash
  npm run lint
  ```

### Manual Verification
1. **Sidebar PWA Install Button Test**: Verify `[ 📲 Install App ]` appears in the sidebar bottom footer when SAGE is installable, and triggers native installation on click.
2. **Lighthouse PWA Audit**: Run Chrome DevTools Lighthouse audit to verify PWA score (>90%) and installability.
3. **Mobile Device Emulation**: Test Chrome DevTools device mode across iPhone 14/15, iPad Air, and Galaxy S23 viewports.
4. **Offline Mode Test**: Toggle "Offline" in DevTools Network tab $\rightarrow$ verify offline badge appears and app shell loads cached pages cleanly.
5. **Spreadsheet Scroll Test**: Open `ScoreInput.jsx` on mobile emulation $\rightarrow$ verify sticky student name column stays anchored while scrolling right.
