import axios from 'axios'

let cachedToken: string | null = null
let inFlightPromise: Promise<string | null> | null = null

export const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

/**
 * Lazily fetches and caches a CSRF token from /api/public/csrf.
 * Deduplicates concurrent in-flight requests.
 */
export async function getCsrfToken(): Promise<string | null> {
  if (cachedToken) {
    return cachedToken
  }
  if (inFlightPromise) {
    return inFlightPromise
  }

  inFlightPromise = axios
    .get<{ success?: boolean; token?: string }>('/api/public/csrf', {
      withCredentials: true,
    })
    .then((res) => {
      const token = res.data?.token ?? null
      if (token) {
        cachedToken = token
      }
      return token
    })
    .catch(() => null)
    .finally(() => {
      inFlightPromise = null
    })

  return inFlightPromise
}

export function clearCsrfToken(): void {
  cachedToken = null
}
