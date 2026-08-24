// Read-only enforcement for the Database Tool's query template. This is a
// regex-level guard, not a SQL parser — it is defense-in-depth on top of the
// real safeguard, which is that the org must supply a minimally-privileged,
// read-only DB credential (no FILE/superuser/proc-exec grants) for this tool.
// It deliberately does not attempt to catch "SELECT-shaped but dangerous"
// builtins (pg_read_file, dblink, MySQL UDFs) — those aren't enumerable by
// regex and are out of scope for this guard.

const MUTATING_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|CALL|EXECUTE|COPY)\b/i;

const INTO_OUTFILE = /\bINTO\s+(OUTFILE|DUMPFILE)\b/i;

// Strips '...' string literals, `...` quoted identifiers, and -- / /* */
// comments before any keyword scan, so a literal like 'a;b' or a column
// named update_count can't produce a false positive (or a keyword hidden
// inside a comment produce a false negative).
function stripLiteralsAndComments(query: string): string {
  return query
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

export function assertSelectOnly(query: string): void {
  const stripped = stripLiteralsAndComments(query).trim();

  if (!stripped) {
    throw new Error('Query must not be empty');
  }

  if (!/^(SELECT|WITH)\b/i.test(stripped)) {
    throw new Error('Query must be a single SELECT statement');
  }

  // Allow at most one trailing semicolon; reject anything embedded earlier
  // (multi-statement injection at the template level).
  const withoutTrailingSemicolon = stripped.replace(/;\s*$/, '');

  if (withoutTrailingSemicolon.includes(';')) {
    throw new Error('Query must be a single statement');
  }

  if (MUTATING_KEYWORDS.test(withoutTrailingSemicolon)) {
    throw new Error(
      'Query must be read-only — no INSERT/UPDATE/DELETE/DDL, including inside a WITH CTE',
    );
  }

  if (INTO_OUTFILE.test(withoutTrailingSemicolon)) {
    throw new Error("Query must not write to the database server's filesystem");
  }
}
