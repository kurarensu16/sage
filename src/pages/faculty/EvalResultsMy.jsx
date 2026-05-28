import React, { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Users, 
  Award, 
  MessageSquare, 
  Calendar, 
  TrendingUp, 
  ChevronDown, 
  ShieldCheck, 
  Star,
  CheckCircle,
  HelpCircle,
  FileSpreadsheet
} from 'lucide-react';

export default function EvalResultsMy() {
  const [selectedSemester, setSelectedSemester] = useState('First Semester, AY 2025-2026');
  const [selectedClass, setSelectedClass] = useState('All');

  // Academic year and semesters list
  const semesters = [
    'First Semester, AY 2025-2026',
    'Second Semester, AY 2024-2025',
    'First Semester, AY 2024-2025',
  ];

  // List of courses/sections evaluated for this professor
  const classesEvaluated = [
    { id: 'All', code: 'All Classes', section: 'Aggregate' },
    { id: 'IT101', code: 'IT101', section: 'BSIT-1A' },
    { id: 'IT201', code: 'IT201', section: 'BSIT-2B' },
    { id: 'CS301', code: 'CS301', section: 'BSCS-3A' },
  ];

  // Mock evaluation data rescaled out of 4
  const evaluationStats = {
    All: {
      overall: 3.72,
      totalEvaluators: 125,
      participationRate: '92.5%',
      collegeRank: 'Top 8%',
      criteria: [
        { name: 'Content Knowledge and Pedagogy', description: 'Instructional methods, higher-order thinking skills, language proficiency, verbal/non-verbal strategies.', score: 3.82, max: 4 },
        { name: 'Learning Environment', description: 'Safe, learning-focused environment, behavior management, supportive collaboration.', score: 3.71, max: 4 },
        { name: 'Diversity of Learners', description: 'Learner-centered culture, linguistic and cultural responsiveness, addressing unique educational needs.', score: 3.65, max: 4 },
        { name: 'Teaching, Learning, and Planning', description: 'Sequential teaching-learning process, curriculum alignment, technology integration.', score: 3.76, max: 4 },
        { name: 'Assessment and Reporting', description: 'Assessment design, monitoring student progress, informing stakeholders of accomplishments.', score: 3.69, max: 4 },
        { name: 'Community Linkages and Professional Engagement', description: 'School community relations, professional ethics, compliance with rules/regulations.', score: 3.73, max: 4 },
        { name: 'Personal Growth and Professional Development', description: 'Protection of teaching honor, professional collaboration, self-reflection.', score: 3.80, max: 4 }
      ],
      comments: [
        { course: 'IT101', text: "Very accommodating and explains the lab exercises clearly. I learned a lot from the hands-on sessions." },
        { course: 'IT201', text: "Could provide more coding examples during lectures, but overall very helpful during consultation hours." },
        { course: 'CS301', text: "Awesome professor! Data structures and algorithms became very easy to understand because of the interactive assignments." },
        { course: 'IT101', text: "Always punctual and returns graded works with constructive feedback in a timely manner. Thank you, Prof!" },
        { course: 'IT201', text: "The exams are challenging but fair. The lectures perfectly align with the practical laboratory activities." }
      ]
    },
    IT101: {
      overall: 3.80,
      totalEvaluators: 42,
      participationRate: '93.3%',
      collegeRank: 'Top 5%',
      criteria: [
        { name: 'Content Knowledge and Pedagogy', description: 'Instructional methods, higher-order thinking skills, language proficiency, verbal/non-verbal strategies.', score: 3.88, max: 4 },
        { name: 'Learning Environment', description: 'Safe, learning-focused environment, behavior management, supportive collaboration.', score: 3.79, max: 4 },
        { name: 'Diversity of Learners', description: 'Learner-centered culture, linguistic and cultural responsiveness, addressing unique educational needs.', score: 3.72, max: 4 },
        { name: 'Teaching, Learning, and Planning', description: 'Sequential teaching-learning process, curriculum alignment, technology integration.', score: 3.82, max: 4 },
        { name: 'Assessment and Reporting', description: 'Assessment design, monitoring student progress, informing stakeholders of accomplishments.', score: 3.75, max: 4 },
        { name: 'Community Linkages and Professional Engagement', description: 'School community relations, professional ethics, compliance with rules/regulations.', score: 3.81, max: 4 },
        { name: 'Personal Growth and Professional Development', description: 'Protection of teaching honor, professional collaboration, self-reflection.', score: 3.87, max: 4 }
      ],
      comments: [
        { course: 'IT101', text: "Very accommodating and explains the lab exercises clearly. I learned a lot from the hands-on sessions." },
        { course: 'IT101', text: "Always punctual and returns graded works with constructive feedback in a timely manner. Thank you, Prof!" }
      ]
    },
    IT201: {
      overall: 3.64,
      totalEvaluators: 35,
      participationRate: '92.1%',
      collegeRank: 'Top 15%',
      criteria: [
        { name: 'Content Knowledge and Pedagogy', description: 'Instructional methods, higher-order thinking skills, language proficiency, verbal/non-verbal strategies.', score: 3.75, max: 4 },
        { name: 'Learning Environment', description: 'Safe, learning-focused environment, behavior management, supportive collaboration.', score: 3.63, max: 4 },
        { name: 'Diversity of Learners', description: 'Learner-centered culture, linguistic and cultural responsiveness, addressing unique educational needs.', score: 3.58, max: 4 },
        { name: 'Teaching, Learning, and Planning', description: 'Sequential teaching-learning process, curriculum alignment, technology integration.', score: 3.68, max: 4 },
        { name: 'Assessment and Reporting', description: 'Assessment design, monitoring student progress, informing stakeholders of accomplishments.', score: 3.61, max: 4 },
        { name: 'Community Linkages and Professional Engagement', description: 'School community relations, professional ethics, compliance with rules/regulations.', score: 3.65, max: 4 },
        { name: 'Personal Growth and Professional Development', description: 'Protection of teaching honor, professional collaboration, self-reflection.', score: 3.72, max: 4 }
      ],
      comments: [
        { course: 'IT201', text: "Could provide more coding examples during lectures, but overall very helpful during consultation hours." },
        { course: 'IT201', text: "The exams are challenging but fair. The lectures perfectly align with the practical laboratory activities." }
      ]
    },
    CS301: {
      overall: 3.73,
      totalEvaluators: 48,
      participationRate: '92.3%',
      collegeRank: 'Top 7%',
      criteria: [
        { name: 'Content Knowledge and Pedagogy', description: 'Instructional methods, higher-order thinking skills, language proficiency, verbal/non-verbal strategies.', score: 3.84, max: 4 },
        { name: 'Learning Environment', description: 'Safe, learning-focused environment, behavior management, supportive collaboration.', score: 3.72, max: 4 },
        { name: 'Diversity of Learners', description: 'Learner-centered culture, linguistic and cultural responsiveness, addressing unique educational needs.', score: 3.66, max: 4 },
        { name: 'Teaching, Learning, and Planning', description: 'Sequential teaching-learning process, curriculum alignment, technology integration.', score: 3.77, max: 4 },
        { name: 'Assessment and Reporting', description: 'Assessment design, monitoring student progress, informing stakeholders of accomplishments.', score: 3.70, max: 4 },
        { name: 'Community Linkages and Professional Engagement', description: 'School community relations, professional ethics, compliance with rules/regulations.', score: 3.74, max: 4 },
        { name: 'Personal Growth and Professional Development', description: 'Protection of teaching honor, professional collaboration, self-reflection.', score: 3.81, max: 4 }
      ],
      comments: [
        { course: 'CS301', text: "Awesome professor! Data structures and algorithms became very easy to understand because of the interactive assignments." }
      ]
    }
  };

  const activeStats = evaluationStats[selectedClass] || evaluationStats.All;

  // Helper to determine score color / label
  const getRatingLabel = (score) => {
    if (score >= 3.60) return { text: 'Exemplary', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (score >= 3.00) return { text: 'Satisfactory', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    if (score >= 2.00) return { text: 'Needs Improvement', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { text: 'Poor', color: 'bg-rose-50 text-rose-700 border-rose-200' };
  };

  const ratingLabel = getRatingLabel(activeStats.overall);

  return (
    <>
      <PageHeader title="Student Evaluations" breadcrumb="Faculty Portal">
        <div className="flex items-center gap-3">
          {/* Semester Selector */}
          <div className="relative">
            <select 
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="appearance-none bg-white border border-slate-200 hover:border-sage-300 text-slate-700 px-4 py-2 pr-10 rounded-lg text-sm font-medium focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer"
            >
              {semesters.map((sem, idx) => (
                <option key={idx} value={sem}>{sem}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          <button className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:border-sage-300 rounded-lg transition-colors bg-white flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Export Report
          </button>
        </div>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-8">
        
        {/* Anonymity Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-slate-900 text-sm">Faculty Evaluation Privacy Protection</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              In compliance with academic evaluation policy FR25, student identities are completely anonymized. Data is aggregated to protect student confidentiality.
            </p>
          </div>
        </div>

        {/* Filters and Sub-navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
            {classesEvaluated.map((cls) => (
              <button
                key={cls.id}
                onClick={() => setSelectedClass(cls.id)}
                className={`px-4 py-2 text-xs font-semibold rounded-full border transition-all whitespace-nowrap ${
                  selectedClass === cls.id 
                    ? 'bg-sage-600 text-white border-sage-600' 
                    : 'bg-white text-slate-600 border-slate-200 hover:border-sage-300 hover:text-slate-900'
                }`}
              >
                {cls.code === 'All Classes' ? 'All Classes (Combined)' : `${cls.code} - ${cls.section}`}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-400 italic">
            Currently showing results for: <span className="font-medium text-slate-600">{selectedSemester}</span>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          
          {/* Main Stat Card - Overall Rating */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-sage-300 transition-all md:col-span-1">
            <div className="absolute top-0 inset-x-0 h-1 bg-sage-500"></div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Overall Rating</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-5xl font-extrabold font-mono text-slate-900">{activeStats.overall.toFixed(2)}</span>
              <span className="text-lg text-slate-400 font-mono">/4.00</span>
            </div>
            
            <div className="mt-3 flex items-center gap-1">
              {[1, 2, 3, 4].map((star) => (
                <Star 
                  key={star} 
                  className={`h-4 w-4 ${
                    star <= Math.round(activeStats.overall) 
                      ? 'text-amber-400 fill-amber-400' 
                      : 'text-slate-200'
                  }`} 
                />
              ))}
            </div>

            <span className={`mt-4 px-3 py-1 rounded-full text-xs font-semibold border ${ratingLabel.color}`}>
              {ratingLabel.text}
            </span>
          </div>

          {/* Stat 2 - Total Evaluators */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between hover:border-sage-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Evaluators</span>
              <div className="p-2 bg-sage-50 rounded-lg text-sage-600">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-6">
              <h3 className="text-3xl font-extrabold font-mono text-slate-900">{activeStats.totalEvaluators}</h3>
              <p className="text-xs text-slate-500 mt-1">Anonymized responses submitted</p>
            </div>
          </div>

          {/* Stat 3 - Participation Rate */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between hover:border-sage-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Response Rate</span>
              <div className="p-2 bg-sage-50 rounded-lg text-sage-600">
                <CheckCircle className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-6">
              <h3 className="text-3xl font-extrabold font-mono text-slate-900">{activeStats.participationRate}</h3>
              <p className="text-xs text-slate-500 mt-1">Out of total registered students</p>
            </div>
          </div>

          {/* Stat 4 - College Ranking */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between hover:border-sage-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Department Rank</span>
              <div className="p-2 bg-sage-50 rounded-lg text-sage-600">
                <Award className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-6">
              <h3 className="text-3xl font-extrabold font-mono text-slate-900">{activeStats.collegeRank}</h3>
              <p className="text-xs text-slate-500 mt-1">Relative to department faculty</p>
            </div>
          </div>

        </div>

        {/* Criteria breakdown & student reviews */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Detailed Criteria Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm lg:col-span-2 space-y-6">
            <div>
              <h3 className="text-lg font-bold font-display text-slate-900">Criteria Breakdown</h3>
              <p className="text-xs text-slate-500">Evaluation scores categorized by official teaching effectiveness metrics.</p>
            </div>

            <div className="space-y-5">
              {activeStats.criteria.map((item, idx) => {
                const percentage = (item.score / item.max) * 100;
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">{item.name}</h4>
                        <p className="text-xs text-slate-400 pr-4 mt-0.5 line-clamp-1">{item.description}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold font-mono text-slate-900">{item.score.toFixed(2)}</span>
                        <span className="text-xs text-slate-400 font-mono"> / {item.max.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-sage-600 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Student Comments list */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-sage-600" />
                <h3 className="text-lg font-bold font-display text-slate-900">Student Feedback</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">Anonymized, direct excerpts of student feedback responses.</p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 max-h-[360px] pr-2 table-container">
              {activeStats.comments.length > 0 ? (
                activeStats.comments.map((comment, index) => (
                  <div key={index} className="bg-slate-50 border border-slate-150 rounded-lg p-4 text-xs space-y-2">
                    <p className="text-slate-700 leading-relaxed italic">"{comment.text}"</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                      <span>Verified Student Submission</span>
                      <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-mono font-bold">
                        {comment.course}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 text-slate-400">
                  <MessageSquare className="h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-xs font-medium">No comments recorded for this filter selection.</p>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </>
  );
}

