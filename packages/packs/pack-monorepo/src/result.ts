/**
 * `Result<T, E>` — errors as values for expected failures.
 *
 * Composes with the `functional` and `typescript-strict` void-harness skills.
 * Use for expected failures (validation, business rules, expected external errors).
 * Throw exceptions for the unexpected (DB down, invariant violations, network outage).
 */

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Apply `fn` to the success value, leaving errors unchanged. */
export function map<T, U, E>(r: Result<T, E>, fn: (t: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** Chain: apply `fn` returning another Result, flatten. */
export function flatMap<T, U, E>(
  r: Result<T, E>,
  fn: (t: T) => Result<U, E>,
): Result<U, E> {
  return r.ok ? fn(r.value) : r;
}

/** Apply `fn` to the error, leaving success unchanged. */
export function mapErr<T, E, F>(r: Result<T, E>, fn: (e: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error));
}

/** Return the value on success, or the fallback on error. */
export function unwrap<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/** Return the value on success, or throw the error. Use sparingly (at top-level boundaries). */
export function unwrapOrThrow<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error instanceof Error ? r.error : new Error(JSON.stringify(r.error));
}

/** Convert a function that may throw into one that returns a Result. */
export function tryCatch<T, E>(
  fn: () => T,
  onError: (e: unknown) => E,
): Result<T, E> {
  try {
    return ok(fn());
  } catch (e) {
    return err(onError(e));
  }
}

/** Async variant of tryCatch. */
export async function tryCatchAsync<T, E>(
  fn: () => Promise<T>,
  onError: (e: unknown) => E,
): Promise<Result<T, E>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(onError(e));
  }
}

/** Combine N Results into one Result of N values (fails on first error). */
export function combine<T, E>(results: readonly Result<T, E>[]): Result<readonly T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}
