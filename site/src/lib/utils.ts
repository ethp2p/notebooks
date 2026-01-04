import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// -------------------------------------------------------------------------
// Date Utilities
// -------------------------------------------------------------------------
import { parse, format } from 'date-fns';

/**
 * Converts a YYYY-MM-DD string to YYYY/MM/DD for URL paths.
 */
export function toPathDate(isoDate: string): string {
  return isoDate.replace(/-/g, '/');
}

/**
 * Checks if a string is a valid YYYY-MM-DD date format.
 */
function isValidDateString(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

/**
 * Parses a YYYY-MM-DD string into a Date object.
 * We use the current date as a reference for missing components, though for perfect YYYY-MM-DD parsing it's less critical.
 */
function parseDate(dateStr: string): Date {
  return parse(dateStr, 'yyyy-MM-dd', new Date());
}

/**
 * Formats a date string (YYYY-MM-DD) into a long display format.
 * Example: "Wed, Nov 15, 2023"
 */
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr || !isValidDateString(dateStr)) return dateStr || '';
  const date = parseDate(dateStr);
  return format(date, 'EEE, MMM d, yyyy');
}

/**
 * Formats a date string (YYYY-MM-DD) into a short display format.
 * Example: "Nov 15"
 */
export function formatShortDate(dateStr: string): string {
  if (!dateStr || !isValidDateString(dateStr)) return dateStr || '';
  const date = parseDate(dateStr);
  return format(date, 'MMM d');
}

