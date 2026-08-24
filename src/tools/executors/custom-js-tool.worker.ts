// Worker bootstrap for the Custom JS Tool. Runs in its own thread (memory/CPU
// resourceLimits + env: {} are set by the parent — see custom-js-tool.executor.ts)
// and executes the tool's code inside a vm context.
//
// IMPORTANT: only primitives (strings) are allowed to cross into the vm
// context. Any object/function reference created outside vm.createContext()'s
// realm (e.g. an injected `console`, or the outer `JSON`/`Math`) carries a
// live prototype chain back to that outer realm — from inside the vm,
// `someInjectedValue.constructor.constructor('return process')()` compiles
// and runs code in the WORKER's real global scope, where `process`/`require`
// genuinely exist. This is a well-known vm-escape technique (it's why Node's
// own docs say vm is not a security mechanism). Crossing only a JSON string,
// and parsing/serializing it with functions compiled *inside* the vm's own
// realm, closes that specific hole. It does not make this a hardened
// sandbox — see the accepted-limitations note in docs/ROADMAP.md.
import { parentPort, workerData } from 'node:worker_threads';
import * as vm from 'node:vm';

interface WorkerData {
  code: string;
  argsJson: string;
  timeoutMs: number;
}

// A value thrown from inside vm.Script.runInContext isn't `instanceof` this
// file's own Error class even when it looks like one — it belongs to the
// vm context's own realm, which has its own distinct Error constructor.
// Duck-typing on `.message` sidesteps that cross-realm identity mismatch.
function describeError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return typeof error === 'string' ? error : 'Script execution failed';
}

async function run(): Promise<void> {
  const { code, argsJson, timeoutMs } = workerData as WorkerData;

  // vm.createContext() with no seed object gives the new realm its own
  // fresh, safe copies of JSON/Math/Date/Object/Array/etc. — nothing from
  // the outer (worker) realm needs to be, or should be, injected.
  const context = vm.createContext({ __argsJson: argsJson });

  const script = new vm.Script(
    `(async () => {
      const args = JSON.parse(__argsJson);
      const __result = await (async () => { ${code} })();
      return JSON.stringify(__result === undefined ? null : __result);
    })()`,
    { filename: 'custom-js-tool.js' },
  );

  try {
    const resultJson = (await script.runInContext(context, {
      timeout: timeoutMs,
    })) as string;
    parentPort?.postMessage({ ok: true, resultJson });
  } catch (error: unknown) {
    parentPort?.postMessage({ ok: false, error: describeError(error) });
  }
}

void run();
