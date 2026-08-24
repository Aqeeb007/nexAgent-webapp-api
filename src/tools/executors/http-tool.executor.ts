import { Injectable } from '@nestjs/common';

import { HttpToolMethod } from '../dto/http-tool-config.dto';
import { MAX_RESPONSE_BYTES, readWithLimit } from './response-limits';
import { ToolExecutionResult, ToolExecutor } from './tool-executor.interface';

interface HttpToolConfig {
  url: string;
  method: HttpToolMethod;
  headers?: Record<string, string>;
}

const EXECUTE_TIMEOUT_MS = 10_000;
const BODY_METHODS: HttpToolMethod[] = ['POST', 'PUT', 'PATCH'];

@Injectable()
export class HttpToolExecutor implements ToolExecutor {
  async execute(
    rawConfig: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    // Trusted to match HttpToolConfigDto's shape — config is only ever
    // written through validateToolConfig's HttpToolConfigDto validation.
    const config = rawConfig as unknown as HttpToolConfig;
    const usesBody = BODY_METHODS.includes(config.method);

    const url = new URL(config.url);

    if (!usesBody) {
      for (const [key, value] of Object.entries(args)) {
        url.searchParams.set(
          key,
          typeof value === 'object' && value !== null
            ? JSON.stringify(value)
            : String(value),
        );
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXECUTE_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: config.method,
        headers: { 'content-type': 'application/json', ...config.headers },
        body: usesBody ? JSON.stringify(args) : undefined,
        redirect: 'follow',
        signal: controller.signal,
      });

      const { text, truncated } = await readWithLimit(
        response,
        MAX_RESPONSE_BYTES,
      );

      let body: unknown = text;

      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        // Not JSON — keep the raw text.
      }

      return { ok: response.ok, status: response.status, body, truncated };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        body: {
          error: error instanceof Error ? error.message : 'Tool request failed',
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
