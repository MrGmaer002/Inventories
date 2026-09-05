export function money(n: number | string | null | undefined, currency: string): string {
  const v = Number(n) || 0;
  return `${v.toFixed(2)} ${currency}`;
}

export function signedMoney(n: number | string | null | undefined, currency: string): string {
  const v = Number(n) || 0;
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)} ${currency}`;
}

export function num(n: number | string | null | undefined): number {
  return Number(n) || 0;
}

/** Localized short time from an ISO timestamp or 'HH:mm'. */
export function timeLabel(isoOrHm: string, lang: string): string {
  if (!isoOrHm) return '';
  if (/^\d{2}:\d{2}/.test(isoOrHm)) {
    const [h, m] = isoOrHm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }
  const d = new Date(isoOrHm);
  if (Number.isNaN(d.getTime())) return isoOrHm;
  return d.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });
}

export function dateLabel(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function durationLabel(fromIso: string, lang: string): string {
  const start = new Date(fromIso).getTime();
  const diff = Math.max(0, Date.now() - start);
  const mins = Math.floor(diff / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (lang === 'ar') {
    if (h === 0 && m === 0) return 'أقل من دقيقة';
    if (h === 0) return `${m} دقيقة`;
    return `${h} س و ${m} د`;
  }
  if (h === 0 && m === 0) return 'less than a minute';
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Rows → CSV. `keys` are row properties, `labels` (optional) are translated header names. UTF-8 BOM so Excel renders Arabic correctly. */
export function salesToCsv(
  rows: Array<Record<string, unknown>>,
  keys: string[],
  labels?: string[]
): string {
  const esc = (v: unknown): string => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = (labels || keys).map(esc).join(',');
  const body = rows.map((r) => keys.map((k) => esc(r[k])).join(','));
  return `\uFEFF${header}\n${body.join('\n')}`;
}
