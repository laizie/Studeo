/**
 * The one place the repository layer admits it is lying to TypeScript.
 *
 * `node:sqlite` hands back null-prototype objects typed as `unknown`, so every read has
 * to be asserted into its domain type. Each repository used to carry its own private
 * three-line `row()` doing exactly this — twelve copies of the same cast, and twelve
 * copies of the same caveat in a comment. This is that cast, once, so the caveat has a
 * single home.
 *
 * The assertion is safe *today* because the column names match the interfaces exactly.
 * It is not checked, and it never will be at zero cost: the failure mode is a migration
 * renaming a column, after which `row.due_date` is silently `undefined` rather than a
 * type error.
 *
 * Why there's no runtime validation here, having considered it: every design needs a
 * list of expected columns to compare against, and that list is a second source of truth
 * which can itself drift out of step with the interfaces — reintroducing the exact
 * failure it was meant to catch, with more machinery. The real guards are elsewhere and
 * already in place: migrations are transactional and tested (connection.ts), the repo
 * test suite runs against the real schema built from the real migration files
 * (`createTestDb`), and the rebuild migrations name their columns explicitly rather than
 * relying on `SELECT *`. If this ever does bite, the fix is a generated types-from-schema
 * step, not a hand-maintained key list.
 */
export function asRow<T>(r: unknown): T {
  return r as T;
}

/** The list form, for `.all()` results. */
export function asRows<T>(rs: unknown[]): T[] {
  return rs as T[];
}
