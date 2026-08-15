import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let mockConfigService: { getOrThrow: jest.Mock };

  beforeEach(() => {
    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue('access-secret'),
    };

    strategy = new JwtStrategy(
      mockConfigService as unknown as ConstructorParameters<
        typeof JwtStrategy
      >[0],
    );
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('reads the access secret from config', () => {
    expect(mockConfigService.getOrThrow).toHaveBeenCalledWith(
      'jwt.accessSecret',
    );
  });

  describe('validate', () => {
    it('maps the token payload to an AuthenticatedUser', () => {
      const result = strategy.validate({
        sub: 'user-1',
        email: 'jane@example.com',
      });

      expect(result).toEqual({ id: 'user-1' });
    });
  });
});
