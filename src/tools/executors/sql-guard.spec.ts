import { assertSelectOnly } from './sql-guard';

describe('assertSelectOnly', () => {
  it('allows a plain SELECT', () => {
    expect(() =>
      assertSelectOnly('SELECT * FROM orders WHERE customer_id = :customerId'),
    ).not.toThrow();
  });

  it('allows a read-only WITH CTE', () => {
    expect(() =>
      assertSelectOnly(
        'WITH recent AS (SELECT * FROM orders WHERE created_at > :since) SELECT * FROM recent',
      ),
    ).not.toThrow();
  });

  it('allows a single trailing semicolon', () => {
    expect(() => assertSelectOnly('SELECT 1;')).not.toThrow();
  });

  it('rejects an empty query', () => {
    expect(() => assertSelectOnly('   ')).toThrow('must not be empty');
  });

  it('rejects a bare INSERT/UPDATE/DELETE', () => {
    expect(() => assertSelectOnly('INSERT INTO users VALUES (1)')).toThrow(
      /must be a single SELECT statement/,
    );
    expect(() => assertSelectOnly('UPDATE users SET x = 1')).toThrow(
      /must be a single SELECT statement/,
    );
    expect(() => assertSelectOnly('DELETE FROM users')).toThrow(
      /must be a single SELECT statement/,
    );
  });

  it('rejects multi-statement injection via an embedded semicolon', () => {
    expect(() => assertSelectOnly('SELECT 1; DROP TABLE users; --')).toThrow(
      /single statement/,
    );
  });

  it('rejects a data-modifying CTE disguised as a SELECT (leading-keyword bypass)', () => {
    expect(() =>
      assertSelectOnly(
        'WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x',
      ),
    ).toThrow(/read-only/);
  });

  it('rejects MySQL SELECT ... INTO OUTFILE', () => {
    expect(() =>
      assertSelectOnly("SELECT * FROM users INTO OUTFILE '/tmp/dump.csv'"),
    ).toThrow(/filesystem/);
  });

  it('rejects MySQL SELECT ... INTO DUMPFILE', () => {
    expect(() =>
      assertSelectOnly("SELECT * FROM users INTO DUMPFILE '/tmp/dump.bin'"),
    ).toThrow(/filesystem/);
  });

  it('does not false-positive on a string literal containing a semicolon or mutating keyword', () => {
    expect(() =>
      assertSelectOnly("SELECT * FROM notes WHERE body = 'a;b DELETE'"),
    ).not.toThrow();
  });

  it('does not false-positive on a column named like a mutating keyword', () => {
    expect(() =>
      assertSelectOnly('SELECT update_count FROM stats'),
    ).not.toThrow();
  });

  it('does not false-positive on a mutating keyword that only appears inside a comment', () => {
    expect(() =>
      assertSelectOnly('SELECT 1 /* ; DELETE FROM users */'),
    ).not.toThrow();
  });
});
