import { ExecutionContext } from '@nestjs/common';
import { currentUserFactory } from './current-user.decorator';

function mockContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('currentUserFactory', () => {
  it('returns request.user when present', () => {
    const user = { id: 'user-1' };

    const result = currentUserFactory(undefined, mockContext(user));

    expect(result).toBe(user);
  });

  it('throws UnauthorizedException when request.user is missing', () => {
    expect(() =>
      currentUserFactory(undefined, mockContext(undefined)),
    ).toThrow();
  });
});
