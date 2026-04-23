import entityBlobcount from './entity_blobcount';
import relayBlobcount from './relay_blobcount';
import entityRelay from './entity_relay';
import entityRelayBlobcount from './entity_relay_blobcount';

export const BLOB_FLOW_CHARTS = {
  [entityBlobcount.id]: entityBlobcount,
  [relayBlobcount.id]: relayBlobcount,
  [entityRelay.id]: entityRelay,
  [entityRelayBlobcount.id]: entityRelayBlobcount,
} as const;
