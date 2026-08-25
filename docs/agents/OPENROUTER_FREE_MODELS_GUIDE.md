# OpenRouter Free Models & AI Integration Guide

## Overview

SAGE integrates with [OpenRouter](https://openrouter.ai) to deliver intelligent, cost-free AI advisory and counseling capabilities (**FR34** - Academic Recommendations and **FR35** - Faculty Predictions). 

By leveraging OpenRouter's `:free` model routing with automatic fallbacks, SAGE guarantees continuous AI guidance without incurring API costs or failing when a single provider experiences high traffic or rate limits.

---

## 1. Active Free Models Configuration

The integration is centralized in [`src/lib/openrouter.js`](file:///c:/Users/sadia/SAGE/src/lib/openrouter.js).

### Primary & Fallback Routing Stack:

```javascript
body: JSON.stringify({
  model: "nvidia/nemotron-3-super-120b-a12b:free",
  models: [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free"
  ],
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ],
  temperature: 0.5,
  max_tokens: 350
})
```

---

## 2. Model Breakdown & Selection Rationale

| Priority | Model ID | Strengths for SAGE | Status |
| :---: | :--- | :--- | :---: |
| **1 (Primary)** | `nvidia/nemotron-3-super-120b-a12b:free` | **120B Flagship Intelligence:** Clean, direct, empathetic counseling guidance without internal reasoning/scratchpad leakage. | Active & Verified |
| **2 (Fallback)** | `nvidia/nemotron-3-ultra-550b-a55b:free` | **550B Ultra Reasoning:** Deep pedagogical insight and comprehensive multi-term GWA trend analysis. | Active & Verified |

---

## 3. How the Fallback Mechanism Works

OpenRouter's `models` array parameter enables **automatic server-side failover**:
1. OpenRouter attempts to route the request to the primary model (`llama-3.3-70b-instruct:free`).
2. If that model is rate-limited, undergoing provider maintenance, or overloaded, OpenRouter automatically forwards the prompt to the next available model in the list (`gemini-2.0-flash-exp:free`, `qwen-2.5-72b`, etc.) without throwing an error back to the frontend.
3. The frontend receives a clean, transparent response without requiring manual retry logic.

---

## 4. Environment Variables Setup

Ensure your `.env.local` contains your OpenRouter API key:

```env
# SAGE Local Environment (.env.local)
VITE_SUPABASE_URL=https://ettnwknyhdhehoclrwwh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_OPENROUTER_API_KEY=sk-or-v1-...
```

> **Note**: Vite environment variables exposed to the client must begin with the `VITE_` prefix.

---

## 5. UI Touchpoints

1. **Student Portal &rarr; Academic Insights** ([`src/pages/student/AcademicInsights.jsx`](file:///c:/Users/sadia/SAGE/src/pages/student/AcademicInsights.jsx)):
   - **Overall Trajectory Guidance**: Analyzes total GWA, honors standing, and course load.
   - **Per-Course Period Breakdown**: Analyzes ratings from Prelim &rarr; Midterm &rarr; Semi-Final &rarr; Final.
   - **Local Client Cache (`aiCache`)**: Caches AI responses per tab to avoid redundant API queries during rapid UI navigation.

---

## 6. Testing & Verifying in Localhost

1. Run the dev server:
   ```bash
   npm run dev
   ```
2. Log in with the demo student account:
   - **Email**: `s.jenkins@student.sage.edu`
   - **Password**: `DemoPassword123!`
3. Navigate to **Academic Insights** on the sidebar.
4. Verify the **SAGE AI Academic Advisor** card generates dynamic counseling commentary.
