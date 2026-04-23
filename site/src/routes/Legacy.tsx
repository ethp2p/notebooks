import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { resolveLegacy } from '../../../worker/src/legacy';
import { loadDates } from '@/workspace/data/dates';

export default function Legacy() {
  const params = useParams<{ year?: string; month?: string; day?: string; id?: string }>();
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    loadDates()
      .then((d) => setLatest(d.latest))
      .catch(() => setLatest(''));
  }, []);
  if (latest === null) return <div className="p-8 text-xs text-muted">resolving...</div>;
  const date =
    params.year && params.month && params.day
      ? `${params.year}-${params.month}-${params.day}`
      : undefined;
  const target = resolveLegacy({ date, notebookId: params.id }, latest);
  return <Navigate to={target} replace />;
}
