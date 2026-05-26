# DESIGN SYSTEM
# Automated Grading & Faculty Evaluation System — DYCI
# Visual direction inherited from ASPIRE

> **Aesthetic Direction:** Sleek, institutional, and clinical. This is an academic data platform — not a consumer app. Prioritize information density, scanability, and trust over decorative flourish. Think: refined government portal meets modern SaaS dashboard.

---

## ❌ Prohibited Patterns

The following are **strictly banned** from the codebase:

- Arbitrary hex codes (e.g. `text-[#1F3864]`, `bg-[#2D9B6F]`) — use semantic tokens only
- Neon or AI-style gradients (e.g. `from-purple-500 to-pink-600`, `bg-gradient-to-r from-blue-400`)
- Rainbow color use — maximum 3 color ramps per screen
- `font-family: Inter` or `font-family: Arial` — use the defined type stack only
- Emoji as icons in components — use `lucide-react` exclusively
- Inline `style={{}}` for layout or color — use Tailwind classes only
- `!important` overrides — solve layout with proper Tailwind composition
- Absolute pixel values (`w-[342px]`) — use grid/flex with Tailwind spacing tokens
- Dark mode for this version — single light theme only, no `dark:` variants

---

## Color Palette

All colors are defined as Tailwind semantic tokens. Do not reference colors outside this palette.

*(Note: "sage" is a custom color mapping. In your `tailwind.config.js`, you must define the `sage` color palette, e.g., mapping it to `#8A9A86` or similar custom values).*

### Primary
| Token | Tailwind Class | Purpose |
|---|---|---|
| Primary | `sage-600` | Primary actions, active nav, links |
| Primary Hover | `sage-700` | Button hover states |
| Primary Light | `sage-50` | Selected row backgrounds, subtle highlights |
| Primary Border | `sage-200` | Focus rings, card borders on active state |

### Grade / Status Tier Colors
| Tier | Background | Text | Border | Usage |
|---|---|---|---|---|
| Passed / Good | `emerald-50` | `emerald-700` | `emerald-200` | Passing grades, posted status, fit verdict |
| Warning / Moderate | `amber-50` | `amber-700` | `amber-200` | At-risk students, needs improvement verdict |
| Failed / Critical | `rose-50` | `rose-700` | `rose-200` | Failing grades, not recommended verdict, missing scores |
| Pending / Info | `blue-50` | `blue-700` | `blue-200` | Pending posts, open eval windows, draft state |

**Rule:** Tier colors are used **only** for their defined semantic purpose. Do not use `rose` for general danger states or `emerald` for general success states if they conflict with tier semantics.

### Neutral / Structural
| Token | Tailwind Class | Purpose |
|---|---|---|
| Page Background | `slate-50` | Body background |
| Card Background | `white` | All card surfaces |
| Sidebar Background | `slate-900` | Navigation sidebar |
| Sidebar Text | `slate-300` | Nav item default |
| Sidebar Active | `white` | Active nav item |
| Border Default | `slate-200` | Card borders, table dividers |
| Border Strong | `slate-300` | Input borders, section dividers |
| Text Primary | `slate-900` | Headings, table data |
| Text Secondary | `slate-500` | Labels, descriptions, metadata |
| Text Tertiary | `slate-400` | Placeholder text, timestamps |

### Semantic (Non-Tier)
| Purpose | Tailwind Class |
|---|---|
| Info / Pending | `blue-600` / `blue-50` |
| System Success | `emerald-600` / `emerald-50` |
| System Warning | `amber-600` / `amber-50` |
| Destructive Action | `rose-600` / `rose-50` |
| AI / Generated Content | `violet-600` / `violet-50` |

---

## Typography

### Font Stack
```css
/* Display / Headings */
font-family: 'Sora', sans-serif;

/* Body / UI */
font-family: 'DM Sans', sans-serif;

/* Code / Data / Grades / Scores / Timestamps */
font-family: 'JetBrains Mono', monospace;
```

Import in `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Type Scale
| Element | Class | Usage |
|---|---|---|
| Page Title | `text-2xl font-bold tracking-tight font-display` | Screen headings |
| Section Title | `text-base font-semibold` | Card headings |
| Body | `text-sm` | Table data, descriptions |
| Label | `text-xs font-semibold uppercase tracking-wide text-slate-500` | Form labels, column headers |
| Mono Data | `text-sm font-mono` | Grades, scores, weights, timestamps |
| Caption | `text-xs text-slate-400` | Timestamps, metadata |

**Rule:** Computed grades, component scores, percentage weights, and GWA values **must always** use `font-mono`. Never render academic data in a proportional font.

---

## Spacing System

### Grid Base: 4px
All spacing uses Tailwind's 4px grid. Never use `p-3`, `m-5`, `gap-7` (odd numbers). Stick to even multiples: `p-2`, `p-4`, `p-6`, `p-8`.

### Layout Constants
| Element | Class |
|---|---|
| Sidebar width | `w-56` (224px) |
| Main content padding | `p-8` |
| Card padding | `p-6` |
| Card padding (compact) | `p-4` |
| Section gap | `gap-6` |
| KPI grid gap | `gap-4` |
| Form field gap | `space-y-4` |
| Table cell padding | `px-4 py-3` |

---

## Grade Display Rules

The system uses the **Philippine GWA scale (1.00–5.00)** where:
- `1.00` = Highest (Excellent)
- `5.00` = Failing
- Passing threshold = `3.00`

### Grade Tier Mapping
| Grade Range | Tier | Color |
|---|---|---|
| 1.00 – 2.50 | Passed / Good | `emerald` |
| 2.51 – 3.00 | Borderline | `amber` |
| 3.01 – 5.00 | Failed / Critical | `rose` |
| Not yet posted | Pending | `blue` |
| Missing score | Critical | `rose` |

### Grade Display Format
```tsx
// Always monospace, always 2 decimal places
<span className="font-mono text-sm font-medium">
  {grade.toFixed(2)}
</span>

// Grade with tier color
<span className={cn(
  "font-mono text-sm font-semibold",
  grade <= 2.50 ? "text-emerald-700" :
  grade <= 3.00 ? "text-amber-700" :
  "text-rose-700"
)}>
  {grade.toFixed(2)}
</span>
```

### Percentage / Weight Display Format
```tsx
// Component weights — always monospace with % suffix
<span className="font-mono text-sm text-slate-700">
  {weight}%
</span>

// Weight validation indicator
<span className={cn(
  "font-mono text-sm font-semibold",
  totalWeight === 100 ? "text-emerald-700" : "text-rose-700"
)}>
  {totalWeight}% / 100%
</span>
```

---

## AI Output Display Rules

AI-generated content (student recommendations, faculty fitness predictions) must be visually distinct from system-computed data.

```tsx
// AI result card — always use violet accent
<Card className="rounded-xl border border-violet-200 bg-violet-50/40 shadow-sm">
  <CardHeader className="pb-2">
    <div className="flex items-center gap-2">
      <Sparkles className="h-4 w-4 text-violet-600" />
      <CardTitle className="text-base font-semibold text-violet-900">
        AI Recommendation
      </CardTitle>
    </div>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-slate-700">{summary}</p>
  </CardContent>
</Card>

// AI verdict badge
// Recommended
<Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
  Recommended
</Badge>

// Needs Improvement
<Badge className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
  Needs Improvement
</Badge>

// Not Recommended
<Badge className="bg-rose-50 text-rose-700 border border-rose-200 rounded-full">
  Not Recommended
</Badge>

// Student: Continue
<Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
  Continue
</Badge>

// Student: At-Risk
<Badge className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
  At-Risk
</Badge>

// Student: Recommend Shift
<Badge className="bg-rose-50 text-rose-700 border border-rose-200 rounded-full">
  Recommend Shift
</Badge>
```

**Rule:** Always show a `generated_at` timestamp below AI output in `text-xs text-slate-400 font-mono`. Never present AI output without its generation date.

---

## Component Standards

### Cards
```tsx
// Standard card
<Card className="rounded-xl border border-slate-200 shadow-sm">
  <CardHeader className="pb-2">
    <CardTitle className="text-base font-semibold">Title</CardTitle>
    <CardDescription>Subtitle</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

**Rules:**
- Always `rounded-xl` — never `rounded-lg` or `rounded-md` for cards
- Always `shadow-sm` — never `shadow-md` or `shadow-lg`
- Always `border border-slate-200` — never borderless cards

### Badges
```tsx
// Passed / Good
<Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
  Passed
</Badge>

// Pending / Open
<Badge className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
  Pending
</Badge>

// At-Risk / Warning
<Badge className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
  At-Risk
</Badge>

// Failed / Critical
<Badge className="bg-rose-50 text-rose-700 border border-rose-200 rounded-full">
  Failed
</Badge>

// Locked (posted grade)
<Badge className="bg-slate-100 text-slate-600 border border-slate-200 rounded-full">
  Locked
</Badge>
```

### Buttons
```tsx
// Primary
<Button className="bg-sage-600 hover:bg-sage-700 text-white">Action</Button>

// Secondary
<Button variant="outline" className="border-slate-200 text-slate-700 hover:border-sage-300">Action</Button>

// Destructive
<Button variant="destructive">Delete</Button>

// Ghost (icon buttons)
<Button variant="ghost" size="icon"><Icon className="h-4 w-4" /></Button>
```

### Tables
```tsx
<Table>
  <TableHeader>
    <TableRow className="bg-slate-50 hover:bg-slate-50">
      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Column
      </TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow className="hover:bg-slate-50/60 border-b border-slate-100">
      <TableCell className="text-sm">Data</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

**Grade tier row highlighting:**
```tsx
// Failed row
<TableRow className="bg-rose-50/40 hover:bg-rose-50/60">

// At-risk / borderline row
<TableRow className="bg-amber-50/40 hover:bg-amber-50/60">

// Missing score row
<TableRow className="bg-rose-50/30 hover:bg-rose-50/50 border-l-2 border-rose-300">
```

### Score Input Grid (S24 — unique to this system)
```tsx
// Editable score cell
<TableCell className="px-4 py-3">
  <Input
    type="number"
    className={cn(
      "w-20 font-mono text-sm border-slate-200 focus:border-sage-400 focus:ring-sage-400",
      isMissing && "border-rose-300 bg-rose-50"
    )}
    placeholder="—"
  />
</TableCell>

// Computed grade cell (read-only)
<TableCell className="px-4 py-3">
  <span className={cn(
    "font-mono text-sm font-semibold",
    grade <= 2.50 ? "text-emerald-700" :
    grade <= 3.00 ? "text-amber-700" :
    "text-rose-700"
  )}>
    {grade.toFixed(2)}
  </span>
</TableCell>
```

### Weight Validator (S23 — unique to this system)
```tsx
// Live weight total bar
<div className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
  <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
    <div
      className={cn(
        "h-full rounded-full transition-all",
        totalWeight === 100 ? "bg-emerald-500" :
        totalWeight > 100 ? "bg-rose-500" :
        "bg-sage-400"
      )}
      style={{ width: `${Math.min(totalWeight, 100)}%` }}
    />
  </div>
  <span className={cn(
    "font-mono text-sm font-semibold w-20 text-right",
    totalWeight === 100 ? "text-emerald-700" :
    totalWeight > 100 ? "text-rose-700" :
    "text-slate-500"
  )}>
    {totalWeight}% / 100%
  </span>
</div>
```

### Evaluation Rating Input (S33 — unique to this system)
```tsx
// 1–5 star/number rating row per criterion
<div className="flex items-center justify-between py-3 border-b border-slate-100">
  <div>
    <p className="text-sm font-medium text-slate-900">{criteria.label}</p>
    <p className="text-xs text-slate-400">{criteria.description}</p>
  </div>
  <div className="flex items-center gap-1">
    {[1, 2, 3, 4, 5].map(n => (
      <button
        key={n}
        className={cn(
          "w-8 h-8 rounded-lg text-sm font-mono font-medium transition-colors",
          rating === n
            ? "bg-sage-600 text-white"
            : "bg-slate-100 text-slate-500 hover:bg-sage-50 hover:text-sage-600"
        )}
      >
        {n}
      </button>
    ))}
  </div>
</div>
```

### Form Inputs
```tsx
<div className="space-y-2">
  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
    Label
  </Label>
  <Input className="border-slate-200 focus:border-sage-400 focus:ring-sage-400" />
</div>
```

### Navigation Sidebar
```tsx
// Sidebar item — default
<div className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300
                rounded-lg hover:bg-slate-800 hover:text-white transition-colors">
  <Icon className="h-4 w-4" />
  Label
</div>

// Sidebar item — active
<div className="flex items-center gap-3 px-4 py-2.5 text-sm text-white
                rounded-lg bg-slate-800 border-l-2 border-sage-400">
  <Icon className="h-4 w-4" />
  Label
</div>
```

---

## Component State Requirements

Every component that fetches data **must** implement all three states:

### Loading State
```tsx
import { Skeleton } from "@/components/ui/skeleton"

// KPI Card skeleton
<Card className="rounded-xl border border-slate-200">
  <CardContent className="p-6">
    <Skeleton className="h-4 w-24 mb-2" />
    <Skeleton className="h-8 w-16" />
  </CardContent>
</Card>

// Table row skeleton
<TableRow>
  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
</TableRow>
```

### Error State
```tsx
<Card className="rounded-xl border border-rose-200 bg-rose-50">
  <CardContent className="p-6 flex items-center gap-3">
    <AlertCircle className="h-5 w-5 text-rose-500" />
    <div>
      <p className="text-sm font-semibold text-rose-700">Failed to load data</p>
      <p className="text-xs text-rose-600">{error.message}</p>
    </div>
    <Button variant="ghost" size="sm" onClick={retry}>Retry</Button>
  </CardContent>
</Card>
```

### Empty State
```tsx
<div className="flex flex-col items-center justify-center py-16 text-center">
  <div className="p-4 rounded-full bg-slate-100 mb-4">
    <Icon className="h-8 w-8 text-slate-400" />
  </div>
  <p className="text-sm font-semibold text-slate-700">No data yet</p>
  <p className="text-xs text-slate-400 mt-1">Description of what goes here</p>
</div>
```

---

## Icon Usage

All icons use `lucide-react`. Standard sizes:

| Context | Size Class |
|---|---|
| Inline text icon | `h-4 w-4` |
| Button icon | `h-4 w-4` |
| Card header icon | `h-5 w-5` |
| Empty state icon | `h-8 w-8` |
| Sidebar nav icon | `h-4 w-4` |

### Icon Mapping
| Concept | Icon |
|---|---|
| Student | `GraduationCap` |
| Faculty | `BookOpen` |
| Dean | `Building2` |
| Admin | `Settings` |
| Grade / Score | `ClipboardList` |
| Class Record | `TableProperties` |
| Grade Component | `Layers` |
| Post Grade | `Send` |
| Locked Grade | `Lock` |
| Override | `UnlockKeyhole` |
| Evaluation Form | `FileText` |
| Evaluation Window | `CalendarClock` |
| Submit Evaluation | `CheckSquare` |
| Anonymous / Privacy | `EyeOff` |
| AI Recommendation | `Sparkles` |
| At-Risk Student | `AlertTriangle` |
| Notification | `Bell` |
| Missing Score | `AlertCircle` |
| Passed | `CheckCircle2` |
| Failed | `XCircle` |
| Report / Export | `Download` |
| Grade Distribution | `BarChart3` |
| Weight / Percentage | `Percent` |
| Department | `Landmark` |
| Section | `Users` |
| Subject | `BookMarked` |
| Trend Up | `TrendingUp` |
| Trend Down | `TrendingDown` |

---

## Sidebar Navigation — Per Role

### Admin
- Settings `Settings` — Dashboard
- Users `Users` — User Management
- FileText `FileText` — Evaluation Forms
- CalendarClock `CalendarClock` — Evaluation Windows
- UnlockKeyhole `UnlockKeyhole` — Grade Overrides
- Bell `Bell` — Activity Log

### Dean
- Building2 `Building2` — Dashboard
- TableProperties `TableProperties` — Grade Posting Status
- BarChart3 `BarChart3` — Grade Distribution
- BookOpen `BookOpen` — Faculty Evaluations
- AlertTriangle `AlertTriangle` — At-Risk Students
- Download `Download` — Reports

### Faculty
- BookOpen `BookOpen` — Dashboard
- TableProperties `TableProperties` — Class Records
- ClipboardList `ClipboardList` — Score Input
- Send `Send` — Post Grades
- FileText `FileText` — Evaluation Results
- Bell `Bell` — Notifications

### Student
- GraduationCap `GraduationCap` — Dashboard
- ClipboardList `ClipboardList` — My Grades
- CheckSquare `CheckSquare` — Faculty Evaluation
- Sparkles `Sparkles` — AI Recommendation
- Bell `Bell` — Notifications
```
