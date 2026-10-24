// "1:23.5" 또는 "83.5" → 초. 잘못된 값이면 null
export function parseTime(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0);
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round((sec - m * 60) * 10) / 10;
  return m > 0 ? `${m}:${s < 10 ? '0' : ''}${s}` : `${s}`;
}
