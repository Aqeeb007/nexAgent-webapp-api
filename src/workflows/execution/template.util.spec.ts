import { renderInput, renderTemplate, resolveArgs } from './template.util';

describe('renderInput', () => {
  it('returns a string input verbatim', () => {
    expect(renderInput('hello')).toBe('hello');
  });

  it('JSON-stringifies a non-string input', () => {
    expect(renderInput({ content: 'hi' })).toBe('{"content":"hi"}');
  });

  it('stringifies null/undefined as the literal "null"', () => {
    expect(renderInput(undefined)).toBe('null');
    expect(renderInput(null)).toBe('null');
  });
});

describe('renderTemplate', () => {
  it('substitutes every occurrence of the {{input}} placeholder', () => {
    const result = renderTemplate(
      'Input was {{input}} and again {{input}}',
      'x',
    );

    expect(result).toBe('Input was x and again x');
  });

  it('JSON-stringifies an object input inside the template', () => {
    const result = renderTemplate('Data: {{input}}', { ok: true });

    expect(result).toBe('Data: {"ok":true}');
  });

  it('returns the template unchanged when it has no placeholder', () => {
    expect(renderTemplate('static prompt', { ok: true })).toBe('static prompt');
  });
});

describe('resolveArgs', () => {
  it('returns an empty object when args is undefined', () => {
    expect(resolveArgs(undefined, 'x')).toEqual({});
  });

  it('replaces a string arg exactly equal to the placeholder with the raw input', () => {
    const result = resolveArgs(
      { city: '{{input}}', unit: 'celsius' },
      {
        name: 'NYC',
      },
    );

    expect(result).toEqual({ city: { name: 'NYC' }, unit: 'celsius' });
  });

  it('leaves a string containing the placeholder as a substring untouched', () => {
    const result = resolveArgs({ note: 'about {{input}}' }, 'x');

    expect(result).toEqual({ note: 'about {{input}}' });
  });
});
