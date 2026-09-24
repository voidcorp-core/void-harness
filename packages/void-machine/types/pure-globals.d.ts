// The only host globals the pure layers (core, runtime, verticals) may name, typed for
// tsconfig.pure.json, which loads no Node or DOM types. Each is a WHATWG primitive that does
// no I/O. Adding one here is a reviewed widening of the pure boundary, never a convenience.

/** Cancellation observed by an injected executor; the runtime only creates and fires it. */
interface AbortSignal {
  readonly aborted: boolean;
}
declare var AbortSignal: { prototype: AbortSignal };

interface AbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}
declare var AbortController: { prototype: AbortController; new(): AbortController };

/** UTF-8 byte counting for the bounds a vertical admits. */
interface TextEncoder {
  encode(input?: string): Uint8Array;
}
declare var TextEncoder: { prototype: TextEncoder; new(): TextEncoder };
