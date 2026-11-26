// Utility functions
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extract an API error message from an unknown thrown value.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: unknown }).response;
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = (response as { data?: unknown }).data;
      if (typeof data === 'object' && data !== null && 'error' in data) {
        const msg = (data as { error?: unknown }).error;
        if (typeof msg === 'string' && msg.length > 0) {
          return msg;
        }
      }
    }
  }
  return fallback;
}
