import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { HttpToolConfigDto } from './http-tool-config.dto';
import {
  MysqlDatabaseToolConfigDto,
  PostgresDatabaseToolConfigDto,
} from './database-tool-config.dto';
import { CustomJsToolConfigDto } from './custom-js-tool-config.dto';

type ConfigClass = new () => object;

function resolveConfigClass(
  type: string,
  rawConfig: unknown,
): ConfigClass | null {
  if (type === 'http') {
    return HttpToolConfigDto;
  }

  if (type === 'custom_js') {
    return CustomJsToolConfigDto;
  }

  if (type === 'database') {
    const engine =
      typeof rawConfig === 'object' && rawConfig !== null
        ? (rawConfig as Record<string, unknown>).engine
        : undefined;

    if (engine === 'postgres') {
      return PostgresDatabaseToolConfigDto;
    }

    if (engine === 'mysql') {
      return MysqlDatabaseToolConfigDto;
    }

    return null;
  }

  return null;
}

// Manual polymorphic validation, deliberately not class-transformer's
// built-in @Type(discriminator) mechanism — that expects the discriminant
// property to live inside the nested object, and we'd need it at two nested
// levels (tool `type`, then database `config.engine`), which would force an
// artificial duplicate field just to satisfy the decorator.
export async function validateToolConfig(
  type: string,
  rawConfig: unknown,
): Promise<Record<string, unknown>> {
  const ConcreteClass = resolveConfigClass(type, rawConfig);

  if (!ConcreteClass) {
    throw new BadRequestException(
      type === 'database'
        ? 'config.engine must be one of: postgres, mysql'
        : `Unsupported tool type: ${type}`,
    );
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
