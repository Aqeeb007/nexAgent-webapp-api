import { NotFoundException } from '@nestjs/common';
import { ToolStepExecutor } from './tool-step.executor';
import type { ToolsService } from '../../tools/tools.service';
import type { UsageService } from '../../usage/usage.service';

describe('ToolStepExecutor', () => {
  let executor: ToolStepExecutor;
  let mockToolsService: { findOne: jest.Mock; execute: jest.Mock };
  let mockUsageService: { record: jest.Mock };

  const organizationId = 'org-1';
  const userId = 'user-1';
  const tool = {
    id: 'tool-1',
    name: 'Weather API',
    type: 'http',
    config: { url: 'https://example.com/weather', method: 'GET' },
  };

  beforeEach(() => {
    mockToolsService = {
      findOne: jest.fn().mockResolvedValue(tool),
      execute: jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200, body: { temp: 70 } }),
    };
    mockUsageService = { record: jest.fn().mockResolvedValue(undefined) };

    executor = new ToolStepExecutor(
      mockToolsService as unknown as ToolsService,
      mockUsageService as unknown as UsageService,
    );
  });

  it('throws when the tool is not found in the caller organization', async () => {
    mockToolsService.findOne.mockResolvedValueOnce(null);

    await expect(
      executor.execute({ toolId: 'missing' }, {}, { organizationId, userId }),
    ).rejects.toThrow(NotFoundException);
  });

  it('resolves {{input}} args before calling ToolsService.execute', async () => {
    await executor.execute(
      { toolId: 'tool-1', args: { city: '{{input}}', unit: 'F' } },
      { name: 'NYC' },
      { organizationId, userId },
    );

    expect(mockToolsService.execute).toHaveBeenCalledWith(tool, {
      city: { name: 'NYC' },
      unit: 'F',
    });
  });

  it('calls with an empty object when no args are configured', async () => {
    await executor.execute({ toolId: 'tool-1' }, 'ignored', {
      organizationId,
      userId,
    });

    expect(mockToolsService.execute).toHaveBeenCalledWith(tool, {});
  });

  it('returns the tool execution result as output, success or failure alike', async () => {
    const { output } = await executor.execute(
      { toolId: 'tool-1' },
      {},
      {
        organizationId,
        userId,
      },
    );

    expect(output).toEqual({ ok: true, status: 200, body: { temp: 70 } });

    mockToolsService.execute.mockResolvedValueOnce({
      ok: false,
      status: 500,
      body: { error: 'boom' },
    });

    const failed = await executor.execute(
      { toolId: 'tool-1' },
      {},
      {
        organizationId,
        userId,
      },
    );

    expect(failed.output).toEqual({
      ok: false,
      status: 500,
      body: { error: 'boom' },
    });
  });

  it('records tool_execution usage', async () => {
    await executor.execute(
      { toolId: 'tool-1' },
      {},
      {
        organizationId,
        userId,
      },
    );

    expect(mockUsageService.record).toHaveBeenCalledWith(
      organizationId,
      'tool_execution',
      1,
      expect.objectContaining({ toolId: 'tool-1', source: 'workflow_step' }),
    );
  });
});
