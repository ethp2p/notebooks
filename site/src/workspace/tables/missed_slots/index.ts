import missedSlotsTable from './missed_slots_table';

export const MISSED_SLOTS_TABLES = {
  [missedSlotsTable.id]: missedSlotsTable,
} as const;
