import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const DataSchema = z.object({
  nodes: z.array(z.object({ name: z.string() })),
  links: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      value: z.number(),
    }),
  ),
});

export default defineChart({
  id: 'entity-relay-sankey',
  topic: 'blob-flow',
  title: 'Entity to relay',
  description: 'Block flow from proposing entities to relays.',
  queries: ['blob_flow_edges'] as const,
  related: [],
  context: () =>
    import(
      '../context/blob_flow/entity_relay.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 3,

  dataSchema: DataSchema,

  transform(raw) {
    const blob_flow_edges = raw['blob_flow_edges'];
    if (!blob_flow_edges) return { nodes: [], links: [] };
    const table = blob_flow_edges as Table;
    const stage = blob_flow_edges.getChild('stage')?.toArray() ?? [];
    const source = blob_flow_edges.getChild('source')?.toArray() ?? [];
    const target = blob_flow_edges.getChild('target')?.toArray() ?? [];
    const value = blob_flow_edges.getChild('value')?.toArray() ?? [];

    const nodes = new Set<string>();
    const links: Array<{ source: string; target: string; value: number }> = [];

    for (let i = 0; i < table.numRows; i++) {
      if (String(stage[i]) !== 'entity_to_relay') continue;
      const s = String(source[i]);
      const d = String(target[i]);
      nodes.add(s);
      nodes.add(d);
      links.push({ source: s, target: d, value: Number(value[i]) });
    }

    return { nodes: [...nodes].map((name) => ({ name })), links };
  },

  option(data) {
    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'sankey',
          data: data.nodes,
          links: data.links,
          emphasis: { focus: 'adjacency' },
          lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.4 },
          label: { fontFamily: 'Xray Mono, monospace', fontSize: 10 },
        },
      ],
    };
  },
});
