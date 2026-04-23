import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useWorkspace } from '@/workspace/state/store';
import { loadDates } from '@/workspace/data/dates';
import { WorkspaceShell } from '@/workspace/WorkspaceShell';

export default function Workspace() {
  const { encoded } = useParams<{ encoded?: string }>();
  const loadFromUrl = useWorkspace((s) => s.loadFromUrl);
  const setWs       = useWorkspace((s) => s.setWorkspace);

  useEffect(() => {
    if (encoded) {
      if (!loadFromUrl(encoded)) {
        loadDates()
          .then((d) => setWs({ root: null, focusedPaneId: null, defaultDate: d.latest }))
          .catch(() => undefined);
      }
    } else {
      loadDates()
        .then((d) => setWs({ root: null, focusedPaneId: null, defaultDate: d.latest }))
        .catch(() => undefined);
    }
  }, [encoded, loadFromUrl, setWs]);

  return <WorkspaceShell />;
}
