export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export async function getApiError(response: Response) {
  const body = await response.json().catch(() => null) as { detail?: unknown } | null;
  if (typeof body?.detail === 'string') return body.detail;
  if (body?.detail) return JSON.stringify(body.detail);
  return `Server mengembalikan status ${response.status}.`;
}

export function apiHeaders(accessToken: string, withJsonBody = false) {
  return { Authorization: `Bearer ${accessToken}`, ...(withJsonBody ? { 'Content-Type': 'application/json' } : {}) };
}
