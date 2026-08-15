import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let mockReflector: { getAllAndOverride: jest.Mock };
  let canActivateSpy: jest.SpyInstance;

  const mockContext = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new JwtAuthGuard(mockReflector as unknown as Reflector);

    // AuthGuard('jwt') is memoized by @nestjs/passport, so this is the exact
    // same class JwtAuthGuard extends — stubbing its prototype method lets us
    // test delegation without touching real passport internals.
    canActivateSpy = jest
      .spyOn(AuthGuard('jwt').prototype, 'canActivate')
      .mockReturnValue(true);
  });

  afterEach(() => {
    canActivateSpy.mockRestore();
  });

  it('bypasses passport entirely for a route marked @Public()', () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);

    const result = guard.canActivate(mockContext);

    expect(result).toBe(true);
    expect(canActivateSpy).not.toHaveBeenCalled();
  });

  it('delegates to the passport strategy for a non-public route', () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);

    void guard.canActivate(mockContext);

    expect(canActivateSpy).toHaveBeenCalledWith(mockContext);
  });

  it('reads the public flag from both the handler and the class', () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);

    void guard.canActivate(mockContext);

    expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      [mockContext.getHandler(), mockContext.getClass()],
    );
  });
});
