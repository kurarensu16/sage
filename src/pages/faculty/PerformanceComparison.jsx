import PageHeader from '../../components/layout/PageHeader';
import { TrendingUp, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PerformanceComparison() {
  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Performance Comparison"
        subtitle="Compare academic term metrics and cohort trajectory across academic years"
      />

      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-4">
        <div className="w-12 h-12 bg-sage-50 text-sage-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
          <TrendingUp className="w-6 h-6" />
        </div>

        <h3 className="font-sora text-lg sm:text-xl font-bold text-slate-900">
          Cohort Trajectory Comparison
        </h3>

        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed font-medium">
          Compare student passing rates, at-risk quotas, and term grade distributions across preceding academic terms for your assigned course codes. Full multi-term comparative visualization will be available in the upcoming analytics release.
        </p>

        <div className="pt-2">
          <Link
            to="/faculty/reports/class-performance"
            className="inline-flex items-center gap-2 px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-2xs"
          >
            <span>View Current Class Performance</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
