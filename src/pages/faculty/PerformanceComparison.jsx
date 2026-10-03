import { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { useAuth } from '../../lib/AuthContext';
import {
  fetchFacultyCourseHistory,
  fetchTermCohortMetrics,
  compareCohortMetrics
} from '../../lib/reportsService';
import { SAME_MARGIN } from '../../lib/constants';
import { cn } from '../../lib/utils';
import { TableSkeleton } from '../../components/common/Skeleton';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  BookOpen,
  Calendar,
  Users,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  Sparkles,
  BarChart2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
export default function PerformanceComparison() {
  const { user } = useAuth();

  const [courses, setCourses] = useState([]);
  const [selectedCourseCode, setSelectedCourseCode] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [referenceClassId, setReferenceClassId] = useState('');

  const [comparisonMode, setComparisonMode] = useState('ab'); // 'ab' or 'range'
  const [rangeStartClassId, setRangeStartClassId] = useState('');
  const [rangeEndClassId, setRangeEndClassId] = useState('');

  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [targetMetrics, setTargetMetrics] = useState(null);
  const [referenceMetrics, setReferenceMetrics] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  // 1. Fetch courses taught by faculty
  useEffect(() => {
    async function loadCourses() {
      if (!user) return;
      try {
        setLoadingCourses(true);
        const courseHistory = await fetchFacultyCourseHistory(user.id);
        setCourses(courseHistory);

        if (courseHistory.length > 0) {
          const firstCourse = courseHistory[0];
          setSelectedCourseCode(firstCourse.courseCode);
          if (firstCourse.classes.length > 0) {
            setTargetClassId(firstCourse.classes[0].class_record_id);
            if (firstCourse.classes.length > 1) {
              setReferenceClassId(firstCourse.classes[1].class_record_id);
            } else {
              setReferenceClassId('');
            }
            setRangeStartClassId(firstCourse.classes[0].class_record_id);
            setRangeEndClassId(firstCourse.classes[firstCourse.classes.length - 1].class_record_id);
          }
        }
      } catch (err) {
        console.error('Error fetching course history:', err);
        setErrorMsg('Failed to load courses for comparison.');
      } finally {
        setLoadingCourses(false);
      }
    }
    loadCourses();
  }, [user]);

  // Current selected course object
  const selectedCourse = useMemo(() => {
    return courses.find(c => c.courseCode === selectedCourseCode) || null;
  }, [courses, selectedCourseCode]);

  // Handle course switch
  const handleCourseChange = (e) => {
    const code = e.target.value;
    setSelectedCourseCode(code);
    const course = courses.find(c => c.courseCode === code);
    if (course && course.classes.length > 0) {
      setTargetClassId(course.classes[0].class_record_id);
      setReferenceClassId(course.classes.length > 1 ? course.classes[1].class_record_id : '');
      setRangeStartClassId(course.classes[0].class_record_id);
      setRangeEndClassId(course.classes[course.classes.length - 1].class_record_id);
    } else {
      setTargetClassId('');
      setReferenceClassId('');
      setRangeStartClassId('');
      setRangeEndClassId('');
    }
  };

  // 2. Fetch metrics for target, reference, and all historical classes of this course
  useEffect(() => {
    async function loadMetrics() {
      if (!selectedCourse || selectedCourse.classes.length === 0) {
        setTargetMetrics(null);
        setReferenceMetrics(null);
        setHistoricalData([]);
        return;
      }

      try {
        setLoadingMetrics(true);
        setErrorMsg(null);

        // Fetch metrics for target and reference
        const promises = [
          targetClassId ? fetchTermCohortMetrics(targetClassId) : Promise.resolve(null),
          referenceClassId ? fetchTermCohortMetrics(referenceClassId) : Promise.resolve(null)
        ];

        // Also fetch metrics for all classes of this course for the trajectory table
        const historyPromises = selectedCourse.classes.map(async (c) => {
          const m = await fetchTermCohortMetrics(c.class_record_id);
          return {
            ...c,
            metrics: m
          };
        });

        const [[tMetrics, rMetrics], historyResults] = await Promise.all([
          Promise.all(promises),
          Promise.all(historyPromises)
        ]);

        setTargetMetrics(tMetrics);
        setReferenceMetrics(rMetrics);
        setHistoricalData(historyResults);
      } catch (err) {
        console.error('Error loading comparative metrics:', err);
        setErrorMsg('Failed to calculate cohort comparison metrics.');
      } finally {
        setLoadingMetrics(false);
      }
    }

    loadMetrics();
  }, [selectedCourse, targetClassId, referenceClassId]);

  // Comparative delta calculation
  const comparison = useMemo(() => {
    if (!targetMetrics || !referenceMetrics) return null;
    return compareCohortMetrics(targetMetrics, referenceMetrics, SAME_MARGIN);
  }, [targetMetrics, referenceMetrics]);

  const targetClass = selectedCourse?.classes?.find(c => c.class_record_id === targetClassId);
  const referenceClass = selectedCourse?.classes?.find(c => c.class_record_id === referenceClassId);

  const chartData = useMemo(() => {
    if (!targetMetrics || !referenceMetrics || !targetClass || !referenceClass) return [];
    
    // Fallbacks to 0 if null just for rendering the chart
    return [
      {
        name: 'Passing Rate (%)',
        ['Target Class']: targetMetrics.passingRate || 0,
        ['Reference Class']: referenceMetrics.passingRate || 0,
      },
      {
        name: 'At-Risk Rate (%)',
        ['Target Class']: targetMetrics.atRiskRate || 0,
        ['Reference Class']: referenceMetrics.atRiskRate || 0,
      },
      {
        name: 'Class Average (%)',
        ['Target Class']: targetMetrics.averageGrade || 0,
        ['Reference Class']: referenceMetrics.averageGrade || 0,
      }
    ];
  }, [targetMetrics, referenceMetrics, targetClass, referenceClass]);

  const trendChartData = useMemo(() => {
    if (!rangeStartClassId || !rangeEndClassId || historicalData.length === 0) return [];
    
    const startIndex = historicalData.findIndex(h => h.class_record_id === rangeStartClassId);
    const endIndex = historicalData.findIndex(h => h.class_record_id === rangeEndClassId);
    
    if (startIndex === -1 || endIndex === -1) return [];
    
    const minIdx = Math.min(startIndex, endIndex);
    const maxIdx = Math.max(startIndex, endIndex);
    
    return historicalData.slice(minIdx, maxIdx + 1).map(d => ({
      name: `${d.semester} A.Y. ${d.school_year}`,
      'Passing Rate': d.metrics?.passingRate || 0,
      'At-Risk Rate': d.metrics?.atRiskRate || 0,
      'Class Average': d.metrics?.averageGrade || 0
    }));
  }, [historicalData, rangeStartClassId, rangeEndClassId]);

  const rangeSummary = useMemo(() => {
    if (trendChartData.length < 2) return "Not enough terms selected to generate a trend analysis. Please select a wider range.";
    
    const start = trendChartData[0];
    const end = trendChartData[trendChartData.length - 1];
    
    const passDiff = end['Passing Rate'] - start['Passing Rate'];
    const riskDiff = end['At-Risk Rate'] - start['At-Risk Rate'];
    
    if (passDiff > 5 && riskDiff < -5) {
      return `Over the selected ${trendChartData.length} terms, passing rates improved by ${passDiff}% while at-risk students dropped by ${Math.abs(riskDiff)}%. This indicates a strong positive trajectory in student mastery.`;
    } else if (passDiff < -5 && riskDiff > 5) {
      return `Over the selected ${trendChartData.length} terms, passing rates declined by ${Math.abs(passDiff)}% while at-risk students increased by ${riskDiff}%. Consider reviewing curriculum pacing across this timeframe.`;
    } else if (passDiff > 2) {
      return `Passing rates have trended positively, improving by ${passDiff}% from the start of the selected period.`;
    } else if (passDiff < -2) {
      return `Passing rates have decreased by ${Math.abs(passDiff)}% across the selected period.`;
    } else {
      return `Performance has remained relatively stable across the selected ${trendChartData.length} terms.`;
    }
  }, [trendChartData]);

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Performance Comparison"
        subtitle="Multi-term class comparison and trend analysis for identical course codes"
      />

      {/* Top Bar: Subject and Term Selector */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Course Code Dropdown */}
        <div className="flex items-center gap-3 flex-1">
          <BookOpen className="w-5 h-5 text-sage-600 flex-shrink-0" />
          <div className="flex-1 max-w-sm">
            <label htmlFor="course-selector" className="sr-only">Select Course Code</label>
            <select
              id="course-selector"
              value={selectedCourseCode}
              onChange={handleCourseChange}
              disabled={loadingCourses}
              className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
            >
              {loadingCourses && <option value="">Loading courses...</option>}
              {!loadingCourses && courses.length === 0 && <option value="">No courses assigned</option>}
              {courses.map(c => (
                <option key={c.courseCode} value={c.courseCode}>
                  {c.courseCode} — {c.courseName} ({c.classes.length} {c.classes.length === 1 ? 'term' : 'terms'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Mode Toggle & Selectors */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-max">
            <button
              onClick={() => setComparisonMode('ab')}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                comparisonMode === 'ab' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              A/B Compare
            </button>
            <button
              onClick={() => setComparisonMode('range')}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                comparisonMode === 'range' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Trend Range
            </button>
          </div>

          {/* Target vs Reference Term Selectors */}
          {selectedCourse && selectedCourse.classes.length > 0 && comparisonMode === 'ab' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Target:</span>
              <select
                value={targetClassId}
                onChange={(e) => setTargetClassId(e.target.value)}
                className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-sage-500 cursor-pointer"
              >
                {selectedCourse.classes.map(c => (
                  <option key={c.class_record_id} value={c.class_record_id}>
                    {c.semester} A.Y. {c.school_year} ({c.sections?.name || 'Section'})
                  </option>
                ))}
              </select>
            </div>

            <span className="hidden sm:inline text-slate-300 font-bold">vs</span>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Reference:</span>
              <select
                value={referenceClassId}
                onChange={(e) => setReferenceClassId(e.target.value)}
                className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-sage-500 cursor-pointer"
              >
                <option value="">None (Select reference term)</option>
                {selectedCourse.classes
                  .filter(c => c.class_record_id !== targetClassId)
                  .map(c => (
                    <option key={c.class_record_id} value={c.class_record_id}>
                      {c.semester} A.Y. {c.school_year} ({c.sections?.name || 'Section'})
                    </option>
                  ))}
              </select>
            </div>
          </div>
          )}

          {/* Range Mode Selectors */}
          {selectedCourse && selectedCourse.classes.length > 0 && comparisonMode === 'range' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">From:</span>
                <select
                  value={rangeStartClassId}
                  onChange={(e) => setRangeStartClassId(e.target.value)}
                  className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-sage-500 cursor-pointer"
                >
                  {selectedCourse.classes.map(c => (
                    <option key={c.class_record_id} value={c.class_record_id}>
                      {c.semester} A.Y. {c.school_year}
                    </option>
                  ))}
                </select>
              </div>

              <span className="hidden sm:inline text-slate-300 font-bold">to</span>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">To:</span>
                <select
                  value={rangeEndClassId}
                  onChange={(e) => setRangeEndClassId(e.target.value)}
                  className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-sage-500 cursor-pointer"
                >
                  {selectedCourse.classes.map(c => (
                    <option key={c.class_record_id} value={c.class_record_id}>
                      {c.semester} A.Y. {c.school_year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-xs sm:text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Pedagogical Disclaimer Banner */}
      <div className="bg-sage-50/70 border border-sage-200/80 rounded-xl p-3 flex items-center gap-3 text-xs text-sage-900 font-medium">
        <Info className="w-4 h-4 text-sage-600 flex-shrink-0" />
        <div>
          <span className="font-bold text-sage-950">Note: </span>
          Variations between classes serve as guides for instructional refinement, not definitive proof of efficacy.
        </div>
      </div>

      {loadingMetrics ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-8">
          <TableSkeleton rows={4} cols={4} />
        </div>
      ) : comparisonMode === 'range' ? (
        <div className="space-y-6">
          {/* Executive Summary Card for Range */}
          <div className="bg-gradient-to-br from-white via-sage-50/50 to-sage-100/50 rounded-2xl border border-sage-200 shadow-sm p-6 flex items-start gap-4 text-slate-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-sage-300 rounded-full blur-3xl opacity-20 translate-x-1/3 -translate-y-1/3 group-hover:opacity-40 transition-opacity duration-700"></div>
            <div className="w-10 h-10 rounded-xl bg-sage-100 border border-sage-200 flex items-center justify-center flex-shrink-0 shadow-inner z-10 relative">
              <Sparkles className="w-5 h-5 text-sage-600" />
            </div>
            <div className="space-y-1.5 z-10 relative">
              <div className="text-[11px] font-bold text-sage-600 uppercase tracking-wider flex items-center gap-2">
                Longitudinal Trend Analysis
                <span className="w-1.5 h-1.5 rounded-full bg-sage-500 animate-pulse"></span>
              </div>
              <p className="text-sm sm:text-base font-semibold text-slate-800 leading-relaxed">
                {rangeSummary}
              </p>
              <p className="text-[11px] text-slate-500 mt-2 font-medium">
                Analyzing a span of {trendChartData.length} academic terms.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 pb-8 overflow-hidden h-[400px]">
            <h4 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sage-600" />
              Trend Range Overview
            </h4>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData} margin={{ top: 0, right: 0, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} domain={[0, 100]} />
                <Tooltip 
                  cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }} 
                  contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="Passing Rate" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="At-Risk Rate" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="Class Average" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : !comparison ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-8 sm:p-12 text-center max-w-xl mx-auto space-y-3">
          <Layers className="w-10 h-10 text-slate-300 mx-auto stroke-1" />
          <h4 className="font-bold text-slate-800 text-sm sm:text-base">Reference Term Needed for Direct Comparison</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Select a reference term from the dropdown above to view delta calculations and trend comparisons for this course.
          </p>
        </div>
      ) : (
        <>
          {/* Executive Summary Card */}
          <div className="bg-gradient-to-br from-white via-sage-50/50 to-sage-100/50 rounded-2xl border border-sage-200 shadow-sm p-6 flex items-start gap-4 text-slate-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-sage-300 rounded-full blur-3xl opacity-20 translate-x-1/3 -translate-y-1/3 group-hover:opacity-40 transition-opacity duration-700"></div>
            <div className="w-10 h-10 rounded-xl bg-sage-100 border border-sage-200 flex items-center justify-center flex-shrink-0 shadow-inner z-10 relative">
              <Sparkles className="w-5 h-5 text-sage-600" />
            </div>
            <div className="space-y-1.5 z-10 relative">
              <div className="text-[11px] font-bold text-sage-600 uppercase tracking-wider flex items-center gap-2">
                Executive Trend Analysis
                <span className="w-1.5 h-1.5 rounded-full bg-sage-500 animate-pulse"></span>
              </div>
              <p className="text-sm sm:text-base font-semibold text-slate-800 leading-relaxed">
                {comparison.summary}
              </p>
              <p className="text-[11px] text-slate-500 mt-2 font-medium">
                Comparing {targetClass?.semester} A.Y. {targetClass?.school_year} ({targetClass?.sections?.name}) against {referenceClass?.semester} A.Y. {referenceClass?.school_year} ({referenceClass?.sections?.name}) with ±{SAME_MARGIN}% tolerance.
              </p>
            </div>
          </div>

          {/* Comparative KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Passing Rate */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 p-4 flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400 opacity-50 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Passing Rate</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-slate-900">
                  {comparison.passingRate.current !== null ? `${comparison.passingRate.current}%` : 'N/A'}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  vs {comparison.passingRate.previous !== null ? `${comparison.passingRate.previous}%` : 'N/A'}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                {comparison.passingRate.trend === 'better' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <TrendingUp className="w-3 h-3" />
                    +{comparison.passingRate.diff}% (Better)
                  </span>
                )}
                {comparison.passingRate.trend === 'worse' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <TrendingDown className="w-3 h-3" />
                    {comparison.passingRate.diff}% (Lower)
                  </span>
                )}
                {comparison.passingRate.trend === 'about the same' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600">
                    <Minus className="w-3 h-3" />
                    About the same (±{SAME_MARGIN}%)
                  </span>
                )}
                {comparison.passingRate.trend === 'insufficient' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                    <AlertTriangle className="w-3 h-3 text-slate-400" />
                    Pending Data
                  </span>
                )}
              </div>
            </div>

            {/* At-Risk Rate (Lower is better) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 p-4 flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-rose-400 opacity-50 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>At-Risk Quota</span>
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-rose-600">
                  {comparison.atRiskRate.current !== null ? `${comparison.atRiskRate.current}%` : 'N/A'}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  vs {comparison.atRiskRate.previous !== null ? `${comparison.atRiskRate.previous}%` : 'N/A'}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                {comparison.atRiskRate.trend === 'better' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <TrendingDown className="w-3 h-3" />
                    {comparison.atRiskRate.diff}% (Improved)
                  </span>
                )}
                {comparison.atRiskRate.trend === 'worse' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <TrendingUp className="w-3 h-3" />
                    +{comparison.atRiskRate.diff}% (Higher)
                  </span>
                )}
                {comparison.atRiskRate.trend === 'about the same' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600">
                    <Minus className="w-3 h-3" />
                    About the same (±{SAME_MARGIN}%)
                  </span>
                )}
                {comparison.atRiskRate.trend === 'insufficient' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                    <AlertTriangle className="w-3 h-3 text-slate-400" />
                    Pending Data
                  </span>
                )}
              </div>
            </div>

            {/* Average Course Grade */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 p-4 flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-sage-400 opacity-50 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Class Average</span>
                <TrendingUp className="w-4 h-4 text-sage-600" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-slate-900">
                  {comparison.averageGrade.current !== null ? `${comparison.averageGrade.current}%` : 'N/A'}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  vs {comparison.averageGrade.previous !== null ? `${comparison.averageGrade.previous}%` : 'N/A'}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                {comparison.averageGrade.trend === 'better' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <TrendingUp className="w-3 h-3" />
                    +{comparison.averageGrade.diff}%
                  </span>
                )}
                {comparison.averageGrade.trend === 'worse' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <TrendingDown className="w-3 h-3" />
                    {comparison.averageGrade.diff}%
                  </span>
                )}
                {comparison.averageGrade.trend === 'about the same' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600">
                    <Minus className="w-3 h-3" />
                    About the same
                  </span>
                )}
                {comparison.averageGrade.trend === 'insufficient' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                    <AlertTriangle className="w-3 h-3 text-slate-400" />
                    Pending Data
                  </span>
                )}
              </div>
            </div>

            {/* Enrolled Cohort Size */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 p-4 flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-slate-300 opacity-50 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Class Enrollment</span>
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-slate-900">
                  {comparison.classSize.current}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  vs {comparison.classSize.previous} students
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500 font-medium">
                Class size difference: <span className="font-mono font-bold text-slate-700">{comparison.classSize.diff >= 0 ? `+${comparison.classSize.diff}` : comparison.classSize.diff}</span> students
              </div>
            </div>
          </div>

          {/* Visual Comparison Chart */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 pb-8 overflow-hidden h-[260px]">
            <h4 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-sage-600" />
              Target vs. Reference Overview
            </h4>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }} 
                  contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="Target Class" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={36} />
                <Bar dataKey="Reference Class" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Trajectory Table: All Historical Classes for this Course */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-xs sm:text-sm">
            <Calendar className="w-4 h-4 text-sage-600" />
            <span>Multi-Term Class Trajectory ({selectedCourseCode})</span>
          </div>
          <div className="text-xs text-slate-400 font-medium">
            {historicalData.length} recorded {historicalData.length === 1 ? 'term' : 'terms'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Academic Term</th>
                <th className="py-3 px-4">Section</th>
                <th className="py-3 px-4 text-center">Class Size</th>
                <th className="py-3 px-4 text-right">Average Grade</th>
                <th className="py-3 px-4 text-center">Passing Rate</th>
                <th className="py-3 px-4 text-center">At-Risk Rate</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {historicalData.map(item => {
                const m = item.metrics || {};
                const isTarget = item.class_record_id === targetClassId;
                const isReference = item.class_record_id === referenceClassId;

                return (
                  <tr
                    key={item.class_record_id}
                    className={cn(
                      "hover:bg-slate-50/60 transition-colors",
                      isTarget && "bg-sage-50/40 font-semibold"
                    )}
                  >
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{item.semester} A.Y. {item.school_year}</span>
                        {isTarget && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-sage-600 text-white font-mono">
                            Target
                          </span>
                        )}
                        {isReference && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-700 font-mono">
                            Reference
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">
                      {item.sections?.name || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      {m.classSize || 0}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                      {m.averageGrade ? `${m.averageGrade}%` : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      <span className="px-2 py-0.5 rounded-md font-bold text-emerald-700 bg-emerald-50">
                        {m.passingRate || 0}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      <span className={cn(
                        "px-2 py-0.5 rounded-md font-bold",
                        (m.atRiskRate || 0) > 0 ? "text-rose-700 bg-rose-50" : "text-slate-500 bg-slate-100"
                      )}>
                        {m.atRiskRate || 0}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        to={`/faculty/reports/class-performance?id=${item.class_record_id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-sage-600 hover:text-sage-700 hover:underline"
                      >
                        <span>Details</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
