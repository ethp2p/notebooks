export type TopicDef = { id: string; title: string; order: number };

export const TOPIC_REGISTRY: Record<string, TopicDef> = {
  'blob-inclusion':        { id: 'blob-inclusion',        title: 'Blob inclusion',        order: 1 },
  'blob-flow':             { id: 'blob-flow',             title: 'Blob flow',             order: 2 },
  'column-propagation':    { id: 'column-propagation',    title: 'Column propagation',    order: 3 },
  'mempool-visibility':    { id: 'mempool-visibility',    title: 'Mempool visibility',    order: 4 },
  'mev-pipeline':          { id: 'mev-pipeline',          title: 'MEV pipeline',          order: 5 },
  'block-column-timing':   { id: 'block-column-timing',   title: 'Block / column timing', order: 6 },
  'propagation-anomalies': { id: 'propagation-anomalies', title: 'Propagation anomalies', order: 7 },
  'missed-slots':          { id: 'missed-slots',          title: 'Missed slots',          order: 8 },
  'block-propagation':     { id: 'block-propagation',     title: 'Block propagation',     order: 9 },
};

export function sortedTopics(): readonly TopicDef[] {
  return Object.values(TOPIC_REGISTRY).sort((a, b) => a.order - b.order);
}
