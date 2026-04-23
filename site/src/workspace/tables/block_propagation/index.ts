import slowBlocksTable from './slow_blocks_table';

export const BLOCK_PROPAGATION_TABLES = {
  [slowBlocksTable.id]: slowBlocksTable,
} as const;
