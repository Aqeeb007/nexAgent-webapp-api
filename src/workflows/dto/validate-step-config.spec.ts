import { BadRequestException } from '@nestjs/common';
import { validateStepConfig } from './validate-step-config';

describe('validateStepConfig', () => {
  it('validates and returns an agent step config', async () => {
    const result = await validateStepConfig('agent', {
      agentId: '11111111-1111-4111-8111-111111111111',
      promptTemplate: 'Summarize: {{input}}',
    });

    expect(result).toEqual({
      agentId: '11111111-1111-4111-8111-111111111111',
      promptTemplate: 'Summarize: {{input}}',
    });
  });

  it('rejects an agent step config with a non-uuid agentId', async () => {
    await expect(
      validateStepConfig('agent', { agentId: 'not-a-uuid' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('validates and returns a tool step config', async () => {
    const result = await validateStepConfig('tool', {
      toolId: '22222222-2222-4222-8222-222222222222',
      args: { city: '{{input}}' },
    });

    expect(result).toEqual({
      toolId: '22222222-2222-4222-8222-222222222222',
      args: { city: '{{input}}' },
    });
  });

  it('rejects a tool step config missing toolId', async () => {
    await expect(validateStepConfig('tool', { args: {} })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('validates and returns a condition step config', async () => {
    const result = await validateStepConfig('condition', {
      path: 'body.status',
      cases: [
        { branch: 'ready_branch', operator: 'equals', value: 'ok' },
        { branch: 'other_branch', operator: 'truthy' },
      ],
    });

    expect(result).toEqual({
      path: 'body.status',
      cases: [
        { branch: 'ready_branch', operator: 'equals', value: 'ok' },
        { branch: 'other_branch', operator: 'truthy' },
      ],
    });
  });

  it('rejects a condition step config with an unsupported operator', async () => {
    await expect(
      validateStepConfig('condition', {
        cases: [{ branch: 'x', operator: 'greater_than' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a condition step config with an empty cases array', async () => {
    await expect(
      validateStepConfig('condition', { cases: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a condition step config with a case missing a branch', async () => {
    await expect(
      validateStepConfig('condition', {
        cases: [{ operator: 'truthy' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an unsupported step type', async () => {
    await expect(validateStepConfig('webhook', {})).rejects.toThrow(
      BadRequestException,
    );
  });
});
