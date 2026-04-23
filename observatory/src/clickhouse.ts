import { createClient, type ClickHouseClient } from '@clickhouse/client';

export type Database = 'default' | 'contributoor';

export interface ClickHouseEnv {
  url: string;
  username: string;
  password: string;
}

export function readEnv(): ClickHouseEnv {
  const url = process.env.CLICKHOUSE_URL;
  const username = process.env.CLICKHOUSE_USERNAME;
  const password = process.env.CLICKHOUSE_PASSWORD;
  if (!url || !username || !password) {
    throw new Error(
      'CLICKHOUSE_URL, CLICKHOUSE_USERNAME, and CLICKHOUSE_PASSWORD must be set in the environment.',
    );
  }
  return { url, username, password };
}

export function makeClient(database: Database, env?: ClickHouseEnv): ClickHouseClient {
  const { url, username, password } = env ?? readEnv();
  return createClient({
    url,
    username,
    password,
    database,
    request_timeout: 120_000,
    compression: { response: true, request: false },
    application: 'observatory',
  });
}

export type { ClickHouseClient };
