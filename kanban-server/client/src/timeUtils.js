const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Format a raw millisecond duration as "Nd Nh" / "Nh Nm" / "Nm".
export function formatDurationMs(ms) {
  if (ms == null || isNaN(ms) || ms < 0) return null;
  const totalMin = Math.ceil(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// Milliseconds between two ISO timestamps; 0 when either is missing/invalid or
// the range is negative. Safe to sum across many tasks.
export function spanMs(startedAt, completedAt) {
  if (!startedAt || !completedAt) return 0;
  const ms = new Date(completedAt) - new Date(startedAt);
  return isNaN(ms) || ms < 0 ? 0 : ms;
}

export function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return null;
  return formatDurationMs(new Date(completedAt) - new Date(startedAt));
}

export function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleString([], { timeZone: USER_TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
