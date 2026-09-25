// The checkpoint operations bound to this product's markers. The mission engine parses the
// mechanical block but owns no brand; this is where the identity hands it the names to write and
// the former ones to keep reading, so a checkpoint written by a 3.x install is taken over in place.
import { checkpointCodec } from '@voidcorp/mission-engine/session';
import { PRODUCT_IDENTITY } from '../identity.js';

export const {
  parseCheckpoint,
  parseMechanicalContextBlock,
  renderMechanicalContextBlock,
  mergeMechanicalContextBlock,
  mentionsMarker: mentionsCheckpointMarker,
} = checkpointCodec(PRODUCT_IDENTITY.markers.contextContinuity);
