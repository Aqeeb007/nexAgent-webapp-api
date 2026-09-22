// Deliberately not a template engine — one literal placeholder,
// {{input}}, substituted with the current pipeline input (the previous
// step's output, or the run's initial input for the first step),
// JSON-stringified for a predictable, unambiguous rendering regardless of
// whether the input is an object, string, or number.
const INPUT_PLACEHOLDER = '{{input}}';

export function renderInput(input: unknown): string {
  return typeof input === 'string' ? input : JSON.stringify(input ?? null);
}

export function renderTemplate(template: string, input: unknown): string {
  return template.split(INPUT_PLACEHOLDER).join(renderInput(input));
}

// Used by the tool-step executor: only a string arg value exactly equal to
// the placeholder is resolved (no partial substring substitution inside a
// larger string) — tool args are typically structured values, not prose,
// so "does this arg mean 'the whole input'" is a cleaner question than
// "does this arg contain the input somewhere".
export function resolveArgs(
  args: Record<string, unknown> | undefined,
  input: unknown,
): Record<string, unknown> {
  if (!args) {
    return {};
  }

  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    resolved[key] = value === INPUT_PLACEHOLDER ? input : value;
  }

  return resolved;
}
