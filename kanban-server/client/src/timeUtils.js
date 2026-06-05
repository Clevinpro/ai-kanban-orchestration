const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt) - new Date(startedAt);
  if (isNaN(ms) || ms < 0) return null;
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${totalMin < 1 ? '< 1' : mins}m`;
}

export function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleString([], { timeZone: USER_TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
