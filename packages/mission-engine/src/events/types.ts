export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface CanonicalEvent {
  readonly schemaVersion: 1;
  readonly seq: number;
  readonly eventId: string;
  readonly missionId: string;
  readonly ts: string;
  readonly source: string;
  readonly kind: string;
  readonly subject: string;
  readonly causationId?: string;
  readonly correlationId: string;
  readonly payload: JsonValue;
}

export interface EventDraft {
  readonly source: string;
  readonly kind: string;
  readonly subject: string;
  readonly causationId?: string;
  readonly correlationId: string;
  readonly payload: JsonValue;
}

export type EventParseIssueCode =
  | 'event-line-too-large'
  | 'invalid-event-json'
  | 'invalid-event-contract';

export interface EventParseIssue {
  readonly code: EventParseIssueCode;
  readonly message: string;
}

export type EventParseResult =
  | { readonly ok: true; readonly value: CanonicalEvent }
  | { readonly ok: false; readonly issue: EventParseIssue };
