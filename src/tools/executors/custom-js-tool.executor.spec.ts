import { CustomJsToolExecutor } from './custom-js-tool.executor';

// These tests spawn real worker_threads Workers (no mocking) since the
// worker bootstrap file's sandboxing behavior is exactly what's under test.
// Under ts-jest there's no compiled .js sibling for the worker bootstrap, so
// each Worker here falls back to `-r ts-node/register` against the .ts
// source (see custom-js-tool.executor.ts's resolveWorkerEntry) — that
// per-worker TS-compiler cold start is slow (multiple seconds) compared to
// production's plain compiled-.js path, hence the generous timeout.
jest.setTimeout(20_000);

describe('CustomJsToolExecutor', () => {
  let executor: CustomJsToolExecutor;

  beforeEach(() => {
    executor = new CustomJsToolExecutor();
  });

  it('returns the value the script returns', async () => {
    const result = await executor.execute(
      { code: 'return args.a + args.b;' },
      { a: 2, b: 3 },
    );

    expect(result).toEqual({ ok: true, status: 200, body: 5 });
  });

  it('returns null when the script returns nothing', async () => {
    const result = await executor.execute({ code: '' }, {});

    expect(result).toEqual({ ok: true, status: 200, body: null });
  });

  it('never throws when the script itself throws', async () => {
    const result = await executor.execute(
      { code: "throw new Error('boom');" },
      {},
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect((result.body as { error: string }).error).toContain('boom');
  });

  it('terminates a script that never settles (async code the in-script timeout cannot catch)', async () => {
    const result = await executor.execute(
      {
        code: 'await new Promise(() => {});',
        timeoutMs: 200,
      },
      {},
    );

    expect(result.ok).toBe(false);
    expect((result.body as { error: string }).error).toMatch(/timed out/);
  });

  it('terminates a synchronous infinite loop', async () => {
    const result = await executor.execute(
      { code: 'while (true) {}', timeoutMs: 200 },
      {},
    );

    expect(result.ok).toBe(false);
  });

  it('cannot reach the host process object via a constructor-chain vm escape', async () => {
    // args.constructor.constructor('return process')() is the classic vm
    // realm-crossing escape: it works when a non-primitive value crosses
    // into the vm context, because that value's prototype chain leads back
    // to the outer realm's Function constructor. Only a JSON string crosses
    // the worker boundary in this design (see custom-js-tool.worker.ts), so
    // `args` inside the vm is parsed by the vm's OWN JSON, and this escape
    // must fail.
    const result = await executor.execute(
      {
        code: `
          try {
            const proc = args.constructor.constructor('return process')();
            return { escaped: true, hasEnv: !!proc.env };
          } catch (e) {
            return { escaped: false };
          }
        `,
      },
      { probe: true },
    );

    expect(result.ok).toBe(true);
    expect((result.body as { escaped: boolean }).escaped).toBe(false);
  });

  it('has no direct `process` global inside the vm context (env: {} also means an escape finds nothing)', async () => {
    process.env.CUSTOM_JS_TOOL_SECRET_PROBE = 'super-secret';

    try {
      const result = await executor.execute(
        {
          code: `
            try {
              return { env: process.env.CUSTOM_JS_TOOL_SECRET_PROBE ?? null };
            } catch (e) {
              return { env: null, threw: true };
            }
          `,
        },
        {},
      );

      const body = result.body as { env: string | null; threw?: boolean };
      expect(body.threw).toBe(true);
      expect(body.env).toBeNull();
    } finally {
      delete process.env.CUSTOM_JS_TOOL_SECRET_PROBE;
    }
  });
});
