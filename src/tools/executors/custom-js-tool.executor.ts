import * as fs from 'node:fs';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';

import { Injectable } from '@nestjs/common';

import { ToolExecutionResult, ToolExecutor } from './tool-executor.interface';

// In production this file and the worker bootstrap are both plain tsc
// output under dist/, so the compiled .js sibling exists. Under ts-jest
// (and pnpm start:dev's on-the-fly transform), no .js sibling is ever
// written to disk, so fall back to running the .ts source directly via
// ts-node (already a devDependency, used the same way by the test:debug
// script).
function resolveWorkerEntry(): {
  filename: string;
  execArgv: string[];
  isDevFallback: boolean;
} {
  const compiled = path.join(__dirname, 'custom-js-tool.worker.js');

  if (fs.existsSync(compiled)) {
    return { filename: compiled, execArgv: [], isDevFallback: false };
  }

  return {
    filename: path.join(__dirname, 'custom-js-tool.worker.ts'),
    execArgv: ['-r', 'ts-node/register'],
    isDevFallback: true,
  };
}

interface CustomJsToolConfig {
  code: string;
  timeoutMs?: number;
}

interface WorkerMessage {
  ok: boolean;
  resultJson?: string;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_RESULT_BYTES = 256 * 1024;

// Resource- and crash-isolated (own worker thread, memory/CPU caps, stripped
// process.env), NOT security-isolated: a malicious tool's code can still
// reach the full Node API (filesystem, outbound network, host process)
// within the app server's own process/user context if it manages to escape
// the vm context (see custom-js-tool.worker.ts's comment for the specific
// escape class this design closes, and docs/ROADMAP.md for the accepted-risk
// framing). Same trust tier as the HTTP tool's unrestricted target URL —
// tool:create should only be granted to admins trusted with shell access on
// the app server.
@Injectable()
export class CustomJsToolExecutor implements ToolExecutor {
  async execute(
    rawConfig: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    // Trusted to match CustomJsToolConfigDto's shape — config is only ever
    // written through validateToolConfig's validation.
    const config = rawConfig as unknown as CustomJsToolConfig;
    const timeoutMs = Math.min(
      config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    );

    try {
      const message = await this.runInWorker(config.code, args, timeoutMs);

      if (!message.ok) {
        return {
          ok: false,
          status: 0,
          body: { error: message.error ?? 'Script execution failed' },
        };
      }

      const resultJson = message.resultJson ?? 'null';

      if (Buffer.byteLength(resultJson) > MAX_RESULT_BYTES) {
        return {
          ok: false,
          status: 0,
          body: { error: 'Result exceeded the size limit' },
          truncated: true,
        };
      }

      return { ok: true, status: 200, body: JSON.parse(resultJson) };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        body: {
          error:
            error instanceof Error ? error.message : 'Script execution failed',
        },
      };
    }
  }

  private runInWorker(
    code: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<WorkerMessage> {
    return new Promise((resolve) => {
      const { filename, execArgv, isDevFallback } = resolveWorkerEntry();
      const worker = new Worker(filename, {
        execArgv,
        workerData: { code, argsJson: JSON.stringify(args), timeoutMs },
        // ts-node/register's own TypeScript compiler needs real headroom
        // to initialize in the dev/test fallback — the tight production
        // limits below are sized for running the tool's code alone, not
        // for compiling TS on the fly, so they don't apply in that case.
        resourceLimits: isDevFallback
          ? { maxOldGenerationSizeMb: 512 }
          : {
              maxOldGenerationSizeMb: 64,
              maxYoungGenerationSizeMb: 16,
              codeRangeSizeMb: 16,
              stackSizeMb: 4,
            },
        // Replaces (does not merge with) the worker's process.env, so a
        // vm-escape can't read this process's secrets even though it can
        // still reach the live process object.
        env: {},
      });

      let settled = false;

      const finish = (message: WorkerMessage) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(hardTimeout);
        void worker.terminate();
        resolve(message);
      };

      // Hard backstop in addition to vm.Script's own `timeout` option in the
      // worker: vm's timeout only bounds synchronous execution, so it does
      // not catch async code (e.g. an awaited timer) that yields control
      // back to the host without ever settling.
      const hardTimeout = setTimeout(() => {
        finish({ ok: false, error: 'Custom JS tool timed out' });
      }, timeoutMs + 250);
      hardTimeout.unref();

      worker.once('message', (message: WorkerMessage) => finish(message));
      worker.once('error', (error: Error) =>
        finish({ ok: false, error: error.message }),
      );
      worker.once('exit', (code) => {
        if (!settled) {
          finish({ ok: false, error: `Worker exited with code ${code}` });
        }
      });
    });
  }
}
