import { formatDistanceToNow } from 'date-fns';

export function formatUpdatedAt(isoString) {
  if (!isoString) return '—';
  try {
    return formatDistanceToNow(new Date(isoString), { addSuffix: true });
  } catch {
    return '—';
  }
}
