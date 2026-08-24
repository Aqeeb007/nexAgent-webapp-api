import { Injectable } from '@nestjs/common';

import { HttpToolExecutor } from './http-tool.executor';
import { DatabaseToolExecutor } from './database-tool.executor';
import { CustomJsToolExecutor } from './custom-js-tool.executor';
import { ToolExecutor } from './tool-executor.interface';

@Injectable()
export class ToolExecutorRegistry {
  private readonly executors: Record<string, ToolExecutor>;

  constructor(
    http: HttpToolExecutor,
    database: DatabaseToolExecutor,
    customJs: CustomJsToolExecutor,
  ) {
    this.executors = {
      http,
      database,
      custom_js: customJs,
    };
  }

  get(type: string): ToolExecutor {
    const executor = this.executors[type];

    if (!executor) {
      throw new Error(`Unsupported tool type: ${type}`);
    }

    return executor;
  }
}
