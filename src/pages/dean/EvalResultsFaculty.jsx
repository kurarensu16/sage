import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import {
  Star,
  MessageSquare,
  ChevronRight,
  Award,
  AlertCircle,
  BrainCircuit,
  Lightbulb,
  Zap,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Users
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Static fallback insight content (AI feature not yet seeded) ──────────────
const STATIC_INSIGHTS = {
  excellent: {
    verdict: 'excellent',
    severity: 'success',
    status: 'Excellent Standing',
    summary: 'This instructor demonstrates exemplary instructional delivery. Student feedback shows consistently high scores across all criteria, particularly in Content Knowledge and Community Linkages.',
  },
  needs_improvement: {
    verdict: 'needs_improvement',
    severity: 'warning',
    status: 'Needs Improvement',
    summary: 'Student feedback indicates some areas requiring development. Developing a structured action plan and peer observation schedule is recommended to support continued improvement.',
  },
  no_data: {
    verdict: 'no_data',
    severity: 'info',
    status: 'No Evaluation Data',
    summary: 'No student evaluation responses have been recorded for this faculty member yet. Ensure evaluation windows are open and students have been notified.',
  },
};

// Determine verdict from rating
function verdictFromRating(rating) {
  if (rating === null) return 'no_data';
  if (rating >= 3.5) return 'excellent';
  if (rating >= 2.5) return 'good';
  return 'needs_improvement';
}

export default function EvalResultsFaculty() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const facultyId = params.get('id');

  const [faculty, setFaculty] = useState(null);
  const [criteriaRatings, setCriteriaRatings] = useState([]);
  const [comments, setComments] = useState([]);
  const [aiInsight, setAiInsight] = useState(null);
  const [responseCount, setResponseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!facultyId) return;
    let cancelled = false;

    async function load() {
      try {
        // 1. Faculty profile
        const { data: userData, error: uErr } = await supabase
          .from('users')
          .select(`
            user_id,
            first_name,
            last_name,
            email,
            department_id,
            departments ( name )
          `)
          .eq('user_id', facultyId)
          .eq('role', 'faculty')
          .maybeSingle();

        if (uErr) throw uErr;
        if (!userData) {
          if (!cancelled) setError('Faculty member not found.');
          return;
        }
        if (!cancelled) setFaculty({
          id: userData.user_id,
          firstName: userData.first_name,
          lastName: userData.last_name,
          email: userData.email,
          department: userData.departments?.name || '—',
        });

        // 2. Evaluation windows for this faculty → responses → ratings + comments
        const { data: windowData, error: wErr } = await supabase
          .from('evaluation_windows')
          .select(`
            window_id,
            evaluation_responses (
              response_id,
              evaluation_ratings (
                rating,
                criteria_id,
                criteria:evaluation_criteria!evaluation_ratings_criteria_id_fkey (
                  criteria_id,
                  label,
                  max_rating,
                  order_index
                )
              ),
              evaluation_comments (
                comment_id,
                comment
              )
            )
          `)
          .eq('faculty_id', facultyId);

        if (wErr) throw wErr;

        // Flatten: collect all responses across windows
        const allResponses = (windowData || []).flatMap(w => w.evaluation_responses || []);
        if (!cancelled) setResponseCount(allResponses.length);

        // Collect all ratings and comments
        const allRatings = allResponses.flatMap(r => r.evaluation_ratings || []);
        const allComments = allResponses
          .flatMap(r => r.evaluation_comments || [])
          .map(c => c.comment)
          .filter(Boolean);

        if (!cancelled) setComments(allComments);

        // 3. Group ratings by criteria LABEL (not criteria_id, since multiple sub-criteria share a label)
        //    Average the ratings within each label group
        const labelMap = {}; // label → { total, count, maxRating, minOrderIndex }
        allRatings.forEach(er => {
          const lbl = er.criteria?.label;
          if (!lbl) return;
          if (!labelMap[lbl]) {
            labelMap[lbl] = {
              total: 0,
              count: 0,
              maxRating: er.criteria?.max_rating ?? 4,
              orderIndex: er.criteria?.order_index ?? 99,
            };
          }
          labelMap[lbl].total += er.rating;
          labelMap[lbl].count += 1;
          // Track the lowest order_index for sorting
          if (er.criteria?.order_index < labelMap[lbl].orderIndex) {
            labelMap[lbl].orderIndex = er.criteria.order_index;
          }
        });

        const grouped = Object.entries(labelMap)
          .map(([label, { total, count, maxRating, orderIndex }]) => ({
            id: label,
            label,
            rating: count > 0 ? total / count : 0,
            max: maxRating,
            orderIndex,
            count,
          }))
          .sort((a, b) => a.orderIndex - b.orderIndex);

        if (!cancelled) setCriteriaRatings(grouped);

        // 4. AI faculty predictions (from Supabase)
        const { data: aiData } = await supabase
          .from('ai_faculty_predictions')
          .select('*')
          .eq('faculty_id', facultyId)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cancelled && aiData) {
          setAiInsight({
            summary: aiData.summary,
            verdict: aiData.verdict,
            severity: aiData.verdict === 'needs_improvement' || aiData.verdict === 'not_recommended'
              ? 'warning' : 'success',
            strongPoints: aiData.strong_points,
            weakPoints: aiData.weak_points,
            snapshot: aiData.basis_snapshot,
          });
        }

      } catch (err) {
        console.error('Database query failed:', err);
        if (!cancelled) {
          setError('Failed to load faculty evaluation details from database.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [facultyId]);

  // ── Computed stats ──────────────────────────────────────────────────────────
  const totalSum = criteriaRatings.reduce((acc, c) => acc + c.rating, 0);
  const cumulativeRating = criteriaRatings.length > 0 ? totalSum / criteriaRatings.length : null;

  const sortedCriteria = [...criteriaRatings].sort((a, b) => b.rating - a.rating);
  const highest = sortedCriteria[0];
  const lowest = sortedCriteria[sortedCriteria.length - 1];

  // Determine which insight panel to show
  const verdict = aiInsight?.verdict ?? verdictFromRating(cumulativeRating);
  const insightContent = aiInsight ?? STATIC_INSIGHTS[verdict] ?? STATIC_INSIGHTS['no_data'];

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
          <p className="text-sm text-slate-500 font-medium">Loading evaluation data…</p>
        </div>
      </div>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────────────
  if (!faculty && !loading) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        Faculty record not found.
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Faculty Evaluation Dashboard" breadcrumb="Dean Portal" />

      <div className="p-8 overflow-y-auto flex-1 space-y-6">

        {/* ── Error banner ── */}
        {error && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-xs text-amber-800 shadow-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Breadcrumb back nav ── */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span
            className="hover:text-sage-600 cursor-pointer transition-colors"
            onClick={() => navigate('/dean/evalresultsoverview')}
          >
            Faculty Evaluations
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">
            Prof. {faculty?.firstName} {faculty?.lastName}
          </span>
        </div>

        {/* ── Header summary panel ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-sage-50 border border-sage-200 text-sage-700 font-bold text-sm flex items-center justify-center font-mono">
              {faculty?.firstName[0]}{faculty?.lastName[0]}
            </div>
            <div>
              <h2 className="text-xl font-bold font-display text-slate-950">
                Prof. {faculty?.firstName} {faculty?.lastName}
              </h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {faculty?.email} · {faculty?.department}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-medium">
              <Users className="h-3.5 w-3.5" />
              {responseCount} student response{responseCount !== 1 ? 's' : ''}
            </div>
            <div className={`flex items-center gap-2 border px-3.5 py-1.5 rounded-xl font-mono font-bold text-sm
              ${cumulativeRating === null
                ? 'bg-slate-50 border-slate-200 text-slate-400'
                : cumulativeRating >= 3.5
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  : cumulativeRating >= 2.5
                    ? 'bg-amber-50 border-amber-100 text-amber-700'
                    : 'bg-rose-50 border-rose-100 text-rose-700'
              }`}>
              <Star className={`h-4 w-4 ${cumulativeRating !== null ? 'fill-current' : ''}`} />
              {cumulativeRating !== null
                ? `Cumulative: ${cumulativeRating.toFixed(2)} / 4.00`
                : 'No Ratings Yet'
              }
            </div>
          </div>
        </div>

        {/* ── AI / Insights panel ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6 text-left">
          <div className="flex items-center gap-2 text-sage-700">
            <BrainCircuit className="h-5 w-5 text-sage-600" />
            <h3 className="text-sm font-bold text-slate-900 font-display">
              Academic Performance &amp; Growth Insights
              {!aiInsight && (
                <span className="ml-2 text-[10px] font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full normal-case">
                  Computed from live ratings
                </span>
              )}
            </h3>
          </div>

          {/* Qualitative summary */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-700 leading-relaxed italic">
              "{insightContent.summary}"
            </p>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Criteria spotlights — only when there are ratings */}
          {criteriaRatings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Peak Performance */}
              <div className="bg-emerald-50/30 border border-emerald-200/50 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 bg-emerald-100/60 rounded-lg shrink-0">
                  <Zap className="h-4 w-4 text-amber-500 fill-amber-400" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    Peak Performance Criteria
                  </span>
                  <h4 className="text-xs font-bold text-slate-900 mt-1">{highest?.label}</h4>
                  <p className="text-[10px] text-emerald-700 font-mono font-bold mt-0.5">
                    Score: {highest?.rating.toFixed(2)} / {highest?.max}.00
                  </p>
                </div>
              </div>

              {/* Development Focus */}
              <div className="bg-amber-50/30 border border-amber-200/40 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 bg-amber-100/60 rounded-lg shrink-0">
                  <Lightbulb className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    Development Area / Focus
                  </span>
                  <h4 className="text-xs font-bold text-slate-900 mt-1">{lowest?.label}</h4>
                  <p className="text-[10px] text-amber-700 font-mono font-bold mt-0.5">
                    Score: {lowest?.rating.toFixed(2)} / {lowest?.max}.00
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-xs text-slate-400 py-4">
              No criteria spotlights available — evaluation responses pending.
            </div>
          )}

          {/* Action Plan / Recommendations panel */}
          {verdict === 'needs_improvement' || verdict === 'not_recommended' ? (
            <div className="bg-amber-50/15 border border-amber-200 rounded-xl p-5 space-y-3.5">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Dean's Watchlist Action Plan</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white/60 border border-amber-200/50 rounded-lg p-3.5 space-y-1">
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">1. Classroom Observation</span>
                  <p className="text-[11px] text-slate-650 leading-relaxed font-medium">
                    Schedule a structured classroom observation during the next grading period to assess student-centered engagement strategies.
                  </p>
                </div>
                <div className="bg-white/60 border border-amber-200/50 rounded-lg p-3.5 space-y-1">
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">2. Peer Mentoring</span>
                  <p className="text-[11px] text-slate-650 leading-relaxed font-medium">
                    Pair the instructor with an exemplary peer to collaborate on lesson formatting and grading turnaround times.
                  </p>
                </div>
                <div className="bg-white/60 border border-amber-200/50 rounded-lg p-3.5 space-y-1">
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">3. Pedagogical Review</span>
                  <p className="text-[11px] text-slate-650 leading-relaxed font-medium">
                    Schedule a supportive 1-on-1 pedagogical review focusing on the identified focus area ({lowest?.label ?? '—'}).
                  </p>
                </div>
              </div>
            </div>
          ) : verdict === 'no_data' ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center text-xs text-slate-400">
              Action plan will be generated once student responses are collected.
            </div>
          ) : (
            <div className="bg-sage-50/40 border border-sage-200 rounded-xl p-5 space-y-3.5">
              <div className="flex items-center gap-2 text-sage-700">
                <CheckCircle2 className="h-4 w-4 text-sage-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Supportive Leadership Recommendations</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/60 border border-sage-200/40 rounded-lg p-3.5 space-y-1">
                  <span className="text-[10px] font-bold text-sage-800 uppercase block">Exemplary Performance Nomination</span>
                  <p className="text-[11px] text-slate-650 leading-relaxed font-medium">
                    Recommend for the annual Teaching Excellence and Departmental Merit awards in recognition of top evaluation standing.
                  </p>
                </div>
                <div className="bg-white/60 border border-sage-200/40 rounded-lg p-3.5 space-y-1">
                  <span className="text-[10px] font-bold text-sage-800 uppercase block">Knowledge Sharing Lead</span>
                  <p className="text-[11px] text-slate-650 leading-relaxed font-medium">
                    Invite the instructor to lead a short workshop on lesson structures during the next faculty colloquium.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Criteria breakdown + Comments ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Criteria breakdown bars */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-3 flex items-center gap-1">
              <Award className="h-4 w-4 text-sage-600" /> Criteria Breakdown Ratings
            </h3>

            {criteriaRatings.length > 0 ? (
              <div className="space-y-5">
                {criteriaRatings.map(crit => {
                  const pct = (crit.rating / crit.max) * 100;
                  const barColor = pct >= 87.5
                    ? 'bg-emerald-500'
                    : pct >= 62.5
                      ? 'bg-sage-600'
                      : pct >= 50
                        ? 'bg-amber-500'
                        : 'bg-rose-500';

                  return (
                    <div key={crit.id} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-900">{crit.label}</span>
                        <span className="font-mono font-bold text-slate-700">
                          {crit.rating.toFixed(2)} / {crit.max}.00
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                        <div
                          className={`${barColor} h-full rounded-full transition-all duration-500`}
                          style={{ width: `${Math.max(pct, crit.count > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {crit.count} rating{crit.count !== 1 ? 's' : ''} averaged
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs">
                <Award className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                No criteria ratings available yet.
              </div>
            )}
          </div>

          {/* Anonymized comments */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-3 flex items-center gap-1">
              <MessageSquare className="h-4 w-4 text-sage-600" /> Qualitative Feedback Comments
            </h3>

            {comments.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {comments.map((comment, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs leading-relaxed text-slate-700 relative"
                  >
                    <div className="absolute top-2.5 right-3 text-[10px] font-mono text-slate-350 font-medium">
                      Anonymized Student #{idx + 1}
                    </div>
                    <p className="pr-12">{comment}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                No written feedback comments submitted yet.
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
