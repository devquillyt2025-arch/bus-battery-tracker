import type { TrackerRecord } from './types';

export type RecordFormData = {
  busNumber: string;
  battery1: string;
  battery1Date: string;
  battery2: string;
  battery2Date: string;
  starter: string;
  starterDate: string;
  alternator: string;
  alternatorDate: string;
  fanBelt: string;
  fanBeltDate: string;
  note: string;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, password?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (password) headers.set('x-admin-password', password);

  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  listRecords: () => request<TrackerRecord[]>('/api/records'),

  verifyPassword: (password: string) => request<{ ok: true }>('/api/auth', { method: 'POST' }, password),

  createRecord: (data: RecordFormData, password: string) =>
    request<{ id: string }>('/api/records', { method: 'POST', body: JSON.stringify(data) }, password),

  updateRecord: (id: string, data: RecordFormData, password: string) =>
    request(`/api/records?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }, password),

  deleteRecord: (id: string, password: string) =>
    request(`/api/records?id=${encodeURIComponent(id)}`, { method: 'DELETE' }, password),

  deleteHistory: (id: string, historyIndex: number, password: string) =>
    request(`/api/records?id=${encodeURIComponent(id)}&historyIndex=${historyIndex}`, { method: 'DELETE' }, password),
};
