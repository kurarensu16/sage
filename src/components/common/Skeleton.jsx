import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Base atomic skeleton pulse placeholder.
 */
export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-slate-200/70", className)}
      {...props}
    />
  );
}

/**
 * Skeleton loader for Portal Dashboards (Student, Faculty, Dean, Admin, Office).
 */
export function DashboardSkeleton() {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
      {/* Header Skeleton */}
      <div className="bg-white border-b border-slate-200/80 px-4 sm:px-6 md:px-8 py-4 sm:py-5 flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="h-6 sm:h-7 w-48 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-28 rounded-xl hidden sm:block" />
      </div>

      <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 overflow-y-auto flex-1">
        {/* Hero Banner Skeleton */}
        <div className="rounded-2xl p-5 sm:p-6 md:p-8 bg-slate-200/50 border border-slate-200/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2.5 flex-1 max-w-xl">
            <Skeleton className="h-4 w-36 rounded-full" />
            <Skeleton className="h-7 sm:h-9 w-64 rounded-xl" />
            <Skeleton className="h-3.5 w-full max-w-md rounded-md" />
          </div>
          <Skeleton className="h-10 w-36 rounded-xl self-start md:self-auto" />
        </div>

        {/* Stats Row Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white p-3.5 sm:p-5 md:p-6 rounded-2xl border border-slate-200/80 shadow-xs flex items-start justify-between gap-2 sm:gap-3"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-16 sm:w-20 rounded-md" />
                <Skeleton className="h-6 sm:h-8 w-12 sm:w-16 rounded-lg" />
                <Skeleton className="h-2.5 w-24 sm:w-28 rounded-md" />
              </div>
              <Skeleton className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl flex-shrink-0" />
            </div>
          ))}
        </div>

        {/* Main Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-36 rounded-md" />
                <Skeleton className="h-3 w-52 rounded-md" />
              </div>
              <Skeleton className="h-4 w-24 rounded-md" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/60 space-y-3">
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-4 w-16 rounded-md" />
                    <Skeleton className="h-4 w-14 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-3/4 rounded-md" />
                  <Skeleton className="h-3 w-1/2 rounded-md" />
                  <div className="border-t border-slate-200/40 pt-2 flex justify-between items-center">
                    <Skeleton className="h-3 w-16 rounded-md" />
                    <Skeleton className="h-3 w-20 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 sm:space-y-6">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-5 rounded-lg" />
                  <Skeleton className="h-4 w-32 rounded-md" />
                </div>
                <Skeleton className="h-3.5 w-full rounded-md" />
                <Skeleton className="h-3.5 w-4/5 rounded-md" />
                <Skeleton className="h-3 w-28 rounded-md pt-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton loader for Card Feeds (Notifications, Class Records, Evaluations, etc.).
 */
export function CardListSkeleton({ count = 5 }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
      {/* Header Skeleton */}
      <div className="bg-white border-b border-slate-200/80 px-4 sm:px-6 md:px-8 py-4 sm:py-5 flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="h-6 sm:h-7 w-48 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>

      <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
        {/* Filter Pills Skeleton */}
        <div className="flex items-center gap-2 pb-3.5 border-b border-slate-200/60 overflow-x-auto">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-7 w-16 sm:w-20 rounded-full flex-shrink-0" />
          ))}
        </div>

        {/* Cards Stack Skeleton */}
        <div className="space-y-3 sm:space-y-4">
          {Array.from({ length: count }).map((_, i) => (
            <div
              key={i}
              className="p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs flex items-start gap-3 sm:gap-4"
            >
              <Skeleton className="h-5 w-5 rounded-md flex-shrink-0 mt-0.5" />
              <Skeleton className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex-shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-40 sm:w-64 rounded-md" />
                  <Skeleton className="h-3 w-16 rounded-md flex-shrink-0" />
                </div>
                <Skeleton className="h-3.5 w-full max-w-xl rounded-md" />
                <Skeleton className="h-3 w-2/3 max-w-md rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton loader for Ledgers and Data Tables (My Grades, User List, Compliance, etc.).
 */
export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
      {/* Header Skeleton */}
      <div className="bg-white border-b border-slate-200/80 px-4 sm:px-6 md:px-8 py-4 sm:py-5 flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="h-6 sm:h-7 w-48 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-36 rounded-xl" />
      </div>

      <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
        {/* Banner/Metric Card Skeleton */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-3.5 w-48 rounded-md" />
          </div>
          <Skeleton className="h-12 w-12 rounded-2xl" />
        </div>

        {/* Table Container Skeleton */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-44 rounded-md" />
            <Skeleton className="h-8 w-32 rounded-lg" />
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="p-4 sm:px-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <Skeleton className="h-4 w-36 sm:w-48 rounded-md" />
                    <Skeleton className="h-3 w-24 sm:w-32 rounded-md" />
                  </div>
                </div>
                <Skeleton className="h-4 w-12 sm:w-16 rounded-md hidden sm:block" />
                <Skeleton className="h-6 w-20 sm:w-24 rounded-full hidden md:block" />
                <Skeleton className="h-6 w-14 rounded-lg" />
                <Skeleton className="h-8 w-20 rounded-lg hidden sm:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton loader for Detail & Form views (MyGradesDetail, ScoreInput, EvalForm).
 */
export function DetailSkeleton() {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
      {/* Header Skeleton with Back Button */}
      <div className="bg-white border-b border-slate-200/80 px-4 sm:px-6 md:px-8 py-4 sm:py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl flex-shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28 rounded-md" />
            <Skeleton className="h-6 w-48 sm:w-64 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 rounded-xl hidden sm:block" />
      </div>

      <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
        {/* Metric Overview Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
              <Skeleton className="h-3 w-20 rounded-md" />
              <Skeleton className="h-7 w-16 rounded-lg" />
              <Skeleton className="h-2.5 w-24 rounded-md" />
            </div>
          ))}
        </div>

        {/* Detailed Breakdown Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <Skeleton className="h-5 w-40 rounded-md" />
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32 rounded-md" />
                  <Skeleton className="h-3 w-20 rounded-md" />
                </div>
                <Skeleton className="h-6 w-16 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Skeleton;
