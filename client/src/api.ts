import type {
  BackupFile,
  CartLine,
  CheckoutPayload,
  Item,
  ItemInput,
  LoginPayload,
  ReportLine,
  ReportScope,
  ReportTotals,
  Role,
  Sale,
  Settings,
  Shift,
  ShiftReport,
  User,
  UserInput
} from '../../shared/src/index.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let actorId: string | null = null;
export function setApiActor(id: string | null): void {
  actorId = id;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (actorId) headers['x-user-id'] = actorId;
  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'network', 'لا يمكن الوصول إلى الخادم');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const err = (data || {}) as { error?: string; message?: string };
    throw new ApiError(res.status, err.error || 'unknown', err.message || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path)
};

// ---------------------------------------------------------------------------
// Typed endpoint helpers
// ---------------------------------------------------------------------------

export const Endpoints = {
  health: () => api.get<{ status: string; db: string }>('/api/health'),

  login: (payload: LoginPayload) =>
    api.post<{ user: User }>('/api/auth/login', payload),

  users: {
    list: () => api.get<{ users: User[] }>('/api/users'),
    create: (u: UserInput) => api.post<{ user: User }>('/api/users', u),
    update: (id: string, u: Partial<UserInput>) => api.put<{ user: User }>(`/api/users/${id}`, u),
    remove: (id: string) => api.del<{ ok: boolean }>(`/api/users/${id}`),
    changePassword: (id: string, newPassword: string, actorPassword: string) =>
      api.post<{ user: User }>(`/api/users/${id}/password`, { newPassword, actorPassword })
  },

  items: {
    list: () => api.get<{ items: Item[] }>('/api/items'),
    create: (i: ItemInput) => api.post<{ item: Item }>('/api/items', i),
    update: (id: string, i: Partial<ItemInput>) => api.put<{ item: Item }>(`/api/items/${id}`, i),
    remove: (id: string) => api.del<{ ok: boolean }>(`/api/items/${id}`),
    stockIn: (id: string, qty: number, unitCost?: number) =>
      api.post<{ item: Item }>(`/api/items/${id}/stock-in`, { qty, unitCost })
  },

  checkout: (payload: CheckoutPayload) => api.post<{ sale: Sale }>('/api/sales/checkout', payload),

  shifts: {
    active: () => api.get<{ shift: Shift }>('/api/shifts/active'),
    history: () => api.get<{ shifts: Shift[] }>('/api/shifts/history'),
    close: (body: {
      actualCash?: number | null;
      notes?: string;
      actorUsername?: string;
      actorPassword?: string;
    }) => api.post<{ closedReport: ShiftReport; nextShift: Shift }>('/api/shifts/close', body),
    report: (id: number) => api.get<ShiftReport>(`/api/shifts/${id}/report`)
  },

  settings: {
    get: () => api.get<{ settings: Settings }>('/api/settings'),
    save: (s: Partial<Settings>) => api.put<{ settings: Settings }>('/api/settings', s)
  },

  reports: {
    summary: (scope: ReportScope, cashierId?: string) =>
      api.get<{ totals: ReportTotals; items: ReportLine[] }>(
        `/api/reports/summary?scope=${scopeParam(scope)}${cashierId ? `&cashier=${cashierId}` : ''}`
      ),
    sales: (scope: ReportScope, cashierId?: string) =>
      api.get<{ sales: Sale[] }>(
        `/api/reports/sales?scope=${scopeParam(scope)}${cashierId ? `&cashier=${cashierId}` : ''}`
      )
  },

  backup: {
    exportData: () => api.get<BackupFile>('/api/backup/export'),
    importData: (data: unknown) => api.post<{ ok: boolean; stats: { users: number; items: number; sales: number } }>('/api/backup/import', data)
  }
};

function scopeParam(scope: ReportScope): string {
  return scope.kind === 'shift' ? `shift:${scope.shiftId}` : scope.kind;
}

export const ROLES: Array<{ value: Role; labelKey: string }> = [
  { value: 'admin', labelKey: 'role:admin' },
  { value: 'cashier', labelKey: 'role:cashier' }
];

export type { Item, ItemInput, CartLine, Sale, User, Shift };
