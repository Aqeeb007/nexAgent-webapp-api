import { ExecutionContext } from '@nestjs/common';
import { organizationIdFactory } from './organization-id.decorator';

function mockContext(
  headerValue: string | string[] | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { 'x-organization-id': headerValue },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('organizationIdFactory', () => {
  it('returns the header value when present', () => {
    const result = organizationIdFactory(undefined, mockContext('org-1'));

    expect(result).toBe('org-1');
  });

  it('throws ForbiddenException when the header is missing', () => {
    expect(() =>
      organizationIdFactory(undefined, mockContext(undefined)),
    ).toThrow();
  });

  it('throws ForbiddenException when the header is sent multiple times', () => {
    expect(() =>
      organizationIdFactory(undefined, mockContext(['org-1', 'org-2'])),
    ).toThrow();
  });
});
