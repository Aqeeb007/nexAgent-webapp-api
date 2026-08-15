const POSTGRES_UNIQUE_VIOLATION = '23505';

function hasUniqueViolationCode(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

// drizzle-orm wraps the underlying `pg` driver error in a DrizzleQueryError,
// putting the actual Postgres error (with its `code`) on `.cause` instead of
// the top level — check both so this works regardless of wrapping.
export function isUniqueConstraintViolation(error: unknown): boolean {
  if (hasUniqueViolationCode(error)) {
    return true;
  }

  const cause = error instanceof Error ? error.cause : undefined;
  return hasUniqueViolationCode(cause);
}
