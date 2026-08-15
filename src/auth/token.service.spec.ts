import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;
  let mockJwtService: {
    signAsync: jest.Mock;
    verifyAsync: jest.Mock;
    decode: jest.Mock;
  };
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockJwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
      decode: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'jwt.refreshSecret': 'refresh-secret',
          'jwt.refreshExpiresIn': '7d',
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('signAccessToken', () => {
    it('signs with the module-default secret (no override)', async () => {
      mockJwtService.signAsync.mockResolvedValueOnce('access-token');

      const result = await service.signAccessToken({
        sub: 'user-1',
        email: 'jane@example.com',
      });

      expect(mockJwtService.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'jane@example.com',
      });
      expect(result).toBe('access-token');
    });
  });

  describe('signRefreshToken', () => {
    it('signs with the refresh secret/TTL from config', async () => {
      mockJwtService.signAsync.mockResolvedValueOnce('refresh-token');

      const result = await service.signRefreshToken({
        sub: 'user-1',
        jti: 'jti-1',
      });

      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        { sub: 'user-1', jti: 'jti-1' },
        { secret: 'refresh-secret', expiresIn: '7d' },
      );
      expect(result).toBe('refresh-token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('returns the decoded payload for a valid token', async () => {
      mockJwtService.verifyAsync.mockResolvedValueOnce({
        sub: 'user-1',
        jti: 'jti-1',
      });

      const result = await service.verifyRefreshToken('a-valid-token');

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('a-valid-token', {
        secret: 'refresh-secret',
      });
      expect(result).toEqual({ sub: 'user-1', jti: 'jti-1' });
    });

    it('wraps an invalid/expired token as UnauthorizedException', async () => {
      mockJwtService.verifyAsync.mockRejectedValueOnce(
        new Error('jwt expired'),
      );

      await expect(service.verifyRefreshToken('a-bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('hashToken', () => {
    it('is deterministic and depends on the input', () => {
      const hashA = service.hashToken('token-a');
      const hashB = service.hashToken('token-a');
      const hashC = service.hashToken('token-b');

      expect(hashA).toBe(hashB);
      expect(hashA).not.toBe(hashC);
    });
  });

  describe('decodeExpiry', () => {
    it('converts the exp claim (seconds) to a Date', () => {
      mockJwtService.decode.mockReturnValueOnce({ exp: 1_700_000_000 });

      const result = service.decodeExpiry('some-token');

      expect(result).toEqual(new Date(1_700_000_000 * 1000));
    });

    it('throws when the token has no exp claim', () => {
      mockJwtService.decode.mockReturnValueOnce({});

      expect(() => service.decodeExpiry('some-token')).toThrow();
    });
  });
});
