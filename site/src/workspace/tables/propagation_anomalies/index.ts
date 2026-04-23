import anomaliesTable from './anomalies_table';

export const PROPAGATION_ANOMALIES_TABLES = {
  [anomaliesTable.id]: anomaliesTable,
} as const;
