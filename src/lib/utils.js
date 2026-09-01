import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function parseIsoToDate(isoString) {
  if (!isoString) return new Date();
  if (typeof isoString !== 'string') return new Date(isoString);
  
  let normalized = isoString.trim().replace(' ', 'T');
  if (!normalized.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(normalized)) {
    normalized += 'Z';
  }
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? new Date(isoString) : d;
}

export function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = parseIsoToDate(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  if (diffMs < 60000 && diffMs > -60000) return 'Just now';
  
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}
