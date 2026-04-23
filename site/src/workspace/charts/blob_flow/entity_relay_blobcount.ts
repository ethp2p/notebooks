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
  id: 'entity-relay-blobcount-sankey',
  topic: 'blob-flow',
  title: 'Entity through relay to blob count',
  description: 'Three-column flow: proposing entity through relay to blob count bucket.',
  queries: ['blob_flow_edges'] as const,
  related: [],
  context: () =>
    import(
      '../context/blob_flow/entity_relay_blobcount.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 4,

  dataSchema: DataSchema,

  transform(raw) {
    const blob_flow_edges = raw['blob_flow_edges'];
    if (!blob_flow_edges) return { nodes: [], links: [] };
    const table = blob_flow_edges as Table;
    const stage = blob_flow_edges.getChild('stage')?.toArray() ?? [];
    const source = blob_flow_edges.getChild('source')?.toArray() ?? [];
    const target = blob_flow_edges.getChild('target')?.toArray() ?? [];
    const intermediate = blob_flow_edges.getChild('intermediate')?.toArray() ?? [];
    const value = blob_flow_edges.getChild('value')?.toArray() ?? [];

    const nodes = new Set<string>();
    // Map key: "source\0target" to summed value
    const linkMap = new Map<string, number>();

    for (let i = 0; i < table.numRows; i++) {
      if (String(stage[i]) !== 'entity_to_relay_to_blob') continue;

      const s = String(source[i]);
      const mid = intermediate[i] != null ? String(intermediate[i]) : null;
      const d = String(target[i]);
      const v = Number(value[i]);

      nodes.add(s);
      nodes.add(d);

      if (mid != null) {
        nodes.add(mid);

        const key1 = `${s}\0${mid}`;
        linkMap.set(key1, (linkMap.get(key1) ?? 0) + v);

        const key2 = `${mid}\0${d}`;
        linkMap.set(key2, (linkMap.get(key2) ?? 0) + v);
      } else {
        const key = `${s}\0${d}`;
        linkMap.set(key, (linkMap.get(key) ?? 0) + v);
      }
    }

    const links = [...linkMap.entries()].map(([key, v]) => {
      const sep = key.indexOf('\0');
      return {
        source: key.slice(0, sep),
        target: key.slice(sep + 1),
        value: v,
      };
    });

    return { nodes: [...nodes].map((name) => ({ name })), links };
  },

  option(data) {
    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'sankey',
          nodeAlign: 'left',
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
