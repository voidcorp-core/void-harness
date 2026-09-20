// tdd-cover: e2e packages/void-machine/test/note-contract.test.ts
import { z } from 'zod';

const byteLength = (value: string): number => new TextEncoder().encode(value).length;
const identifier = z.string().min(1).max(200);
const sourceSchema = z.strictObject({
  sourceId: identifier,
  title: z.string().min(1).max(200),
  text: z.string().min(1).refine((value) => byteLength(value) <= 65_536),
});
export const noteInputSchema = z.strictObject({
  requestId: identifier,
  question: z.string().min(1).max(4000),
  sources: z.tuple([sourceSchema, sourceSchema]),
}).refine((value) => value.sources[0].sourceId !== value.sources[1].sourceId);
export type NoteInput = z.infer<typeof noteInputSchema>;

const evidenceSchema = z.strictObject({ sourceId: identifier, quote: z.string().min(1).max(65_536) });
const evidence = z.array(evidenceSchema).min(1).max(16);
const limitations = z.array(z.string().min(1).max(2000)).max(16);
const extractionSchema = z.strictObject({ evidence, limitations });
const noteSchema = z.strictObject({
  title: z.string().min(1).max(200), summary: z.string().min(1).max(16_000), evidence, limitations,
});
export type Extraction = z.infer<typeof extractionSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Admission<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

function traceable(items: Extraction['evidence'], input: NoteInput): boolean {
  return items.every((item) => input.sources.some((source) =>
    source.sourceId === item.sourceId && source.text.includes(item.quote)));
}

// JSON is the deliverable of this vertical, not an executor transport protocol.
function bounded(value: Extraction | Note): boolean {
  return byteLength(JSON.stringify(value)) <= 65_536;
}

export function admitExtraction(raw: unknown, input: NoteInput): Admission<Extraction> {
  const parsed = extractionSchema.safeParse(raw);
  if (!parsed.success || !bounded(parsed.data) || !traceable(parsed.data.evidence, input)) {
    return { ok: false };
  }
  return { ok: true, value: parsed.data };
}

export function admitNote(raw: unknown, input: NoteInput): Admission<Note> {
  const parsed = noteSchema.safeParse(raw);
  if (!parsed.success || !bounded(parsed.data) || !traceable(parsed.data.evidence, input)) {
    return { ok: false };
  }
  if (!input.sources.every((source) => parsed.data.evidence.some((item) =>
    item.sourceId === source.sourceId))) return { ok: false };
  return { ok: true, value: parsed.data };
}
