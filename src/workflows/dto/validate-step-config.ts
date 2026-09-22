import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AgentStepConfigDto } from './agent-step-config.dto';
import { ToolStepConfigDto } from './tool-step-config.dto';
import { ConditionStepConfigDto } from './condition-step-config.dto';

type ConfigClass = new () => object;

function resolveConfigClass(type: string): ConfigClass | null {
  if (type === 'agent') {
    return AgentStepConfigDto;
  }

  if (type === 'tool') {
    return ToolStepConfigDto;
  }

  if (type === 'condition') {
    return ConditionStepConfigDto;
  }

  return null;
}

// Mirrors tools/dto/validate-tool-config.ts exactly: picks the concrete
// config DTO based on the step `type`, validates the raw config against it,
// and returns the sanitized object to store as workflow_steps.config —
// WorkflowsService still stores it as opaque jsonb.
export async function validateStepConfig(
  type: string,
  rawConfig: unknown,
): Promise<Record<string, unknown>> {
  const ConcreteClass = resolveConfigClass(type);

  if (!ConcreteClass) {
    throw new BadRequestException(`Unsupported workflow step type: ${type}`);
  }

  const instance = plainToInstance(ConcreteClass, rawConfig);

  // forbidUnknownValues explicitly matched to the global ValidationPipe's
  // effective default: Nest merges { forbidUnknownValues: false, ...opts },
  // not bare class-validator's own default of true.
  const errors = await validate(instance, {
    whitelist: true,
    forbidUnknownValues: false,
  });

  if (errors.length) {
    throw new BadRequestException(
      errors.flatMap((error) => Object.values(error.constraints ?? {})),
    );
  }

  return instance as unknown as Record<string, unknown>;
}
