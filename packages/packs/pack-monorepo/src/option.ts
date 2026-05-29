/**
 * `Option<T>` — explicit optionality with discriminated union.
 *
 * Composes with the `functional` skill. Prefer `T | undefined` for simple cases.
 * Use `Option<T>` when you want exhaustive pattern matching (the compiler
 * refuses to forget the `none` branch).
 */

export type Option<T> =
  | { readonly kind: 'some'; readonly value: T }
  | { readonly kind: 'none' };

export const some = <T>(value: T): Option<T> => ({ kind: 'some', value });

export const none: Option<never> = { kind: 'none' };

export function isSome<T>(o: Option<T>): o is { kind: 'some'; value: T } {
  return o.kind === 'some';
}

export function isNone<T>(o: Option<T>): o is { kind: 'none' } {
  return o.kind === 'none';
}

/** Build an Option from a possibly-undefined value. */
export function fromNullable<T>(v: T | undefined | null): Option<T> {
  return v === undefined || v === null ? none : some(v);
}

/** Apply `fn` to the inner value, leaving none unchanged. */
export function map<T, U>(o: Option<T>, fn: (t: T) => U): Option<U> {
  return o.kind === 'some' ? some(fn(o.value)) : none;
}

/** Chain into another Option, flatten. */
export function flatMap<T, U>(o: Option<T>, fn: (t: T) => Option<U>): Option<U> {
  return o.kind === 'some' ? fn(o.value) : none;
}

/** Return the value or the fallback. */
export function unwrap<T>(o: Option<T>, fallback: T): T {
  return o.kind === 'some' ? o.value : fallback;
}
