import { isUniqueConstraintViolation } from './postgres-error.util';

describe('isUniqueConstraintViolation', () => {
  it('returns true for a raw pg error with code 23505', () => {
    expect(isUniqueConstraintViolation({ code: '23505' })).toBe(true);
  });

  // drizzle-orm wraps the raw pg driver error in a DrizzleQueryError, putting
  // the actual Postgres error on `.cause` instead of the top level.
  it('returns true for a DrizzleQueryError wrapping a 23505 cause', () => {
    const wrapped = new Error('Failed query') as Error & { cause?: unknown };
    wrapped.cause = { code: '23505' };

    expect(isUniqueConstraintViolation(wrapped)).toBe(true);
  });

  it('returns false for an unrelated pg error code', () => {
    expect(isUniqueConstraintViolation({ code: '23503' })).toBe(false);
  });

  it('returns false for an Error with an unrelated cause', () => {
    const wrapped = new Error('Failed query') as Error & { cause?: unknown };
    wrapped.cause = { code: '23503' };

    expect(isUniqueConstraintViolation(wrapped)).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isUniqueConstraintViolation(null)).toBe(false);
    expect(isUniqueConstraintViolation(undefined)).toBe(false);
    expect(isUniqueConstraintViolation('some string')).toBe(false);
    expect(isUniqueConstraintViolation(new Error('plain error'))).toBe(false);
  });
});
