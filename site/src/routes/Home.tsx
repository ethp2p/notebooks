import { useEffect } from 'react';
import { useWorkspace } from '@/workspace/state/store';
import { loadDates } from '@/workspace/data/dates';
import { loadRegistry } from '@/workspace/data/registry';
import { WorkspaceShell } from '@/workspace/WorkspaceShell';
import { makePane } from '@/workspace/state/tree';

export default function Home() {
  const setWs = useWorkspace((s) => s.setWorkspace);

  useEffect(() => {
    Promise.all([loadDates(), loadRegistry()])
      .then(([d, r]) => {
        const ids = Object.keys(r.charts);
        const flagship = ids.includes('region-winner-grouped-bar')
          ? 'region-winner-grouped-bar'
          : ids[0] ?? '';
        const root = makePane({ id: 'p0', chartId: flagship, date: d.latest });
        setWs({
          root,
          focusedPaneId: root.id,
          defaultDate: d.latest,
        });
      })
      .catch(() => { /* ignore; shell renders empty */ });
  }, [setWs]);

  return <WorkspaceShell />;
}
