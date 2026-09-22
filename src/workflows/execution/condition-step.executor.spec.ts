import { ConditionStepExecutor } from './condition-step.executor';

describe('ConditionStepExecutor', () => {
  const executor = new ConditionStepExecutor();

  it('returns the first matching case branch, evaluated against the whole input when no path is given', async () => {
    const { output } = await executor.execute(
      {
        cases: [
          { branch: 'is_ok', operator: 'equals', value: 'ok' },
          { branch: 'is_other', operator: 'equals', value: 'other' },
        ],
      },
      'ok',
    );

    expect(output).toEqual({ branch: 'is_ok', matched: true });
  });

  it('reads a dot-notation path out of an object input', async () => {
    const { output } = await executor.execute(
      {
        path: 'body.status',
        cases: [{ branch: 'ready_branch', operator: 'equals', value: 'ready' }],
      },
      { body: { status: 'ready' } },
    );

    expect(output).toEqual({ branch: 'ready_branch', matched: true });
  });

  it('picks the first matching case when several cases could match', async () => {
    const { output } = await executor.execute(
      {
        cases: [
          { branch: 'truthy_branch', operator: 'truthy' },
          { branch: 'also_truthy', operator: 'truthy' },
        ],
      },
      'x',
    );

    expect(output).toEqual({ branch: 'truthy_branch', matched: true });
  });

  it('returns a null branch when no case matches', async () => {
    const { output } = await executor.execute(
      {
        cases: [{ branch: 'is_ok', operator: 'equals', value: 'ok' }],
      },
      'not-ok',
    );

    expect(output).toEqual({ branch: null, matched: false });
  });

  it('resolves to undefined for a path that does not exist, and fails equals', async () => {
    const { output } = await executor.execute(
      {
        path: 'missing.path',
        cases: [{ branch: 'ready_branch', operator: 'equals', value: 'ready' }],
      },
      { body: { status: 'ready' } },
    );

    expect(output).toEqual({ branch: null, matched: false });
  });

  it('evaluates not_equals', async () => {
    const { output } = await executor.execute(
      { cases: [{ branch: 'changed', operator: 'not_equals', value: 'ok' }] },
      'not-ok',
    );

    expect(output).toEqual({ branch: 'changed', matched: true });
  });

  it('evaluates contains for a string', async () => {
    const { output } = await executor.execute(
      { cases: [{ branch: 'has_lo', operator: 'contains', value: 'lo' }] },
      'hello',
    );

    expect(output).toEqual({ branch: 'has_lo', matched: true });
  });

  it('evaluates contains for an array', async () => {
    const { output } = await executor.execute(
      { cases: [{ branch: 'has_b', operator: 'contains', value: 'b' }] },
      ['a', 'b', 'c'],
    );

    expect(output).toEqual({ branch: 'has_b', matched: true });
  });

  it('evaluates falsy', async () => {
    const { output } = await executor.execute(
      { cases: [{ branch: 'is_falsy', operator: 'falsy' }] },
      null,
    );

    expect(output).toEqual({ branch: 'is_falsy', matched: true });
  });
});
