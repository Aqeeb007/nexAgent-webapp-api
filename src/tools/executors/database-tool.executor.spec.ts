import { DatabaseToolExecutor } from './database-tool.executor';

const mockPgQuery = jest.fn();
const mockPgEnd = jest.fn().mockResolvedValue(undefined);

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockPgQuery,
    end: mockPgEnd,
  })),
}));

const mockMysqlExecute = jest.fn();
const mockMysqlEnd = jest.fn().mockResolvedValue(undefined);

jest.mock('mysql2/promise', () => ({
  __esModule: true,
  default: {
    createPool: jest.fn().mockImplementation(() => ({
      execute: mockMysqlExecute,
      end: mockMysqlEnd,
    })),
  },
}));

describe('DatabaseToolExecutor', () => {
  let executor: DatabaseToolExecutor;

  const postgresConfig = {
    engine: 'postgres' as const,
    host: 'localhost',
    port: 5432,
    database: 'app',
    user: 'reader',
    password: 'secret',
    query: 'SELECT * FROM orders WHERE customer_id = :customerId',
  };

  const mysqlConfig = {
    ...postgresConfig,
    engine: 'mysql' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    executor = new DatabaseToolExecutor();
  });

  afterEach(async () => {
    await executor.onModuleDestroy();
  });

  it('binds a named placeholder as a real Postgres positional parameter', async () => {
    mockPgQuery.mockResolvedValue({ rows: [{ id: 1 }] });

    const result = await executor.execute(postgresConfig, {
      customerId: 'cust-1',
    });

    expect(mockPgQuery).toHaveBeenCalledWith(
      'SELECT * FROM orders WHERE customer_id = $1',
      ['cust-1'],
    );
    expect(result).toEqual({
      ok: true,
      status: 200,
      body: [{ id: 1 }],
      truncated: false,
    });
  });

  it('never string-concatenates an arg value into the query text (Postgres)', async () => {
    mockPgQuery.mockResolvedValue({ rows: [] });

    await executor.execute(postgresConfig, {
      customerId: "'; DROP TABLE orders; --",
    });

    const [text, values] = mockPgQuery.mock.calls[0] as [string, unknown[]];
    expect(text).toBe('SELECT * FROM orders WHERE customer_id = $1');
    expect(values).toEqual(["'; DROP TABLE orders; --"]);
  });

  it('binds a named placeholder as a MySQL "?" positional parameter', async () => {
    mockMysqlExecute.mockResolvedValue([[{ id: 1 }]]);

    const result = await executor.execute(mysqlConfig, {
      customerId: 'cust-1',
    });

    expect(mockMysqlExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: 'SELECT * FROM orders WHERE customer_id = ?',
      }),
      ['cust-1'],
    );
    expect(result).toEqual({
      ok: true,
      status: 200,
      body: [{ id: 1 }],
      truncated: false,
    });
  });

  it('rejects a query that is not read-only, without ever reaching the driver', async () => {
    const result = await executor.execute(
      { ...postgresConfig, query: 'DELETE FROM orders' },
      {},
    );

    expect(result.ok).toBe(false);
    expect(mockPgQuery).not.toHaveBeenCalled();
  });

  it('truncates a result set larger than the row cap', async () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({ id: i }));
    mockPgQuery.mockResolvedValue({ rows });

    const result = await executor.execute(postgresConfig, {});

    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    expect((result.body as unknown[]).length).toBe(500);
  });

  it('never throws on a connection/query failure', async () => {
    mockPgQuery.mockRejectedValue(new Error('connection refused'));

    const result = await executor.execute(postgresConfig, {});

    expect(result).toEqual({
      ok: false,
      status: 0,
      body: { error: 'connection refused' },
    });
  });

  it('reuses a cached pool for the same config, and creates a new one after a credential change', async () => {
    const pg = jest.requireMock<{ Pool: jest.Mock }>('pg');
    mockPgQuery.mockResolvedValue({ rows: [] });

    await executor.execute(postgresConfig, {});
    await executor.execute(postgresConfig, {});
    expect(pg.Pool).toHaveBeenCalledTimes(1);

    await executor.execute({ ...postgresConfig, password: 'rotated' }, {});
    expect(pg.Pool).toHaveBeenCalledTimes(2);
  });
});
