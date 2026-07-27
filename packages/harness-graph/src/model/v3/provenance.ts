import type {
  GraphOrigin,
  GraphProvenance,
  GraphProvenancePointer,
} from './types.js';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function validUtcTimestamp(value: string): boolean {
  if (!ISO_UTC.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(timestamp).toISOString() === normalized;
}

function provenance(
  origin: GraphOrigin,
  source: GraphProvenancePointer,
  confidence: number,
  observedAt?: string,
): GraphProvenance {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('GRAPH_PROVENANCE_INVALID: confidence must be between 0 and 1');
  }
  if (origin === 'observed') {
    if (observedAt === undefined || !validUtcTimestamp(observedAt)) {
      throw new Error('GRAPH_PROVENANCE_INVALID: observed provenance requires an ISO UTC timestamp');
    }
  } else if (observedAt !== undefined) {
    throw new Error('GRAPH_PROVENANCE_INVALID: timestamps are reserved for observed provenance');
  }
  return Object.freeze({
    origin,
    confidence,
    sources: Object.freeze([Object.freeze({ ...source })]),
    ...(observedAt === undefined ? {} : { observedAt }),
  });
}

export function declaredProvenance(source: GraphProvenancePointer): GraphProvenance {
  return provenance('declared', source, 1);
}

export function extractedProvenance(
  source: GraphProvenancePointer,
  confidence = 1,
): GraphProvenance {
  return provenance('extracted', source, confidence);
}

export function observedProvenance(
  source: GraphProvenancePointer,
  observedAt: string,
  confidence: number,
): GraphProvenance {
  return provenance('observed', source, confidence, observedAt);
}

export function inferredProvenance(
  source: GraphProvenancePointer,
  confidence: number,
): GraphProvenance {
  return provenance('inferred', source, confidence);
}
