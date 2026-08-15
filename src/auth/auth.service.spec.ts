import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { DATABASE } from '../database/database.module';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';
import { RefreshTokensService } from './refresh-tokens.service';
import { OrganizationsService } from '../organizations/organizations.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;

  // register() runs everything inside `this.db.transaction(async (tx) => ...)`.
  // mockTx stands in for the `tx` query builder passed into that callback;
  // mockDb.transaction just invokes the callback with it, the same way the
  // real Drizzle transaction() does. User creation itself is delegated to
  // UsersService, so it's mocked directly rather than driven through mockTx.
  let mockTx: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    returning: jest.Mock;
  };
  let mockDb: { transaction: jest.Mock };
  let mockUsersService: {
    createUser: jest.Mock;
    findByEmail: jest.Mock;
    findById: jest.Mock;
  };
  let mockTokenService: {
    signAccessToken: jest.Mock;
    signRefreshToken: jest.Mock;
    verifyRefreshToken: jest.Mock;
    hashToken: jest.Mock;
    decodeExpiry: jest.Mock;
  };
  let mockRefreshTokensService: {
    create: jest.Mock;
    findValidByHash: jest.Mock;
    revokeByHash: jest.Mock;
  };
  let mockOrganizationsService: { createOwned: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTx = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };
    mockDb = {
      transaction: jest.fn((callback) => callback(mockTx)),
    };
    mockUsersService = {
      createUser: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };
    mockTokenService = {
      signAccessToken: jest.fn(),
      signRefreshToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
      hashToken: jest.fn(),
      decodeExpiry: jest.fn(),
    };
    mockRefreshTokensService = {
      create: jest.fn(),
      findValidByHash: jest.fn(),
      revokeByHash: jest.fn(),
    };
    mockOrganizationsService = {
      createOwned: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DATABASE, useValue: mockDb },
        { provide: UsersService, useValue: mockUsersService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: RefreshTokensService, useValue: mockRefreshTokensService },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto = {
      email: 'Jane@Example.com',
      password: 'plainPassword123',
      firstName: 'Jane',
      lastName: 'Doe',
    };

    const insertedUser = {
      id: 'user-1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      emailVerified: false,
    };
    const insertedOrganization = {
      id: 'org-1',
      name: "Jane's Organization",
      slug: 'janes-organization-abcd1234',
    };

    it('creates the user and their owned organization inside one transaction', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockUsersService.createUser.mockResolvedValueOnce(insertedUser);
      mockOrganizationsService.createOwned.mockResolvedValueOnce(
        insertedOrganization,
      );

      const result = await service.register(registerDto);

      // Never store the plain-text password, only the bcrypt hash
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 12);
      expect(mockUsersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'hashed-password' }),
        mockTx,
      );
      expect(mockUsersService.createUser).not.toHaveBeenCalledWith(
        expect.objectContaining({ password: registerDto.password }),
        mockTx,
      );

      // Org creation + owner-role assignment is delegated to
      // OrganizationsService.createOwned, sharing the same transaction
      expect(mockOrganizationsService.createOwned).toHaveBeenCalledWith(
        `${registerDto.firstName}'s Organization`,
        insertedUser.id,
        mockTx,
      );

      expect(result).toEqual({
        user: insertedUser,
        organization: insertedOrganization,
      });
    });

    it('propagates the ConflictException and creates nothing else when the email is already registered', async () => {
      mockUsersService.createUser.mockRejectedValueOnce(
        new ConflictException('Email already registered'),
      );

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockOrganizationsService.createOwned).not.toHaveBeenCalled();
    });

    it('propagates errors from organization creation', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockUsersService.createUser.mockResolvedValueOnce(insertedUser);
      mockOrganizationsService.createOwned.mockRejectedValueOnce(
        new ConflictException(
          'Could not create organization, please try again',
        ),
      );

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'jane@example.com',
      password: 'correct-password',
    };
    const storedUser = {
      id: 'user-1',
      email: 'jane@example.com',
      passwordHash: 'stored-hash',
      firstName: 'Jane',
      lastName: 'Doe',
      emailVerified: false,
    };

    it('returns tokens and a sanitized user on success', async () => {
      mockUsersService.findByEmail.mockResolvedValueOnce(storedUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      mockTokenService.signAccessToken.mockResolvedValueOnce('access-token');
      mockTokenService.signRefreshToken.mockResolvedValueOnce('refresh-token');
      mockTokenService.hashToken.mockReturnValueOnce('hashed-refresh-token');
      mockTokenService.decodeExpiry.mockReturnValueOnce(
        new Date('2099-01-01T00:00:00Z'),
      );

      const result = await service.login(loginDto);

      expect(bcrypt.compare).toHaveBeenCalledWith(
        loginDto.password,
        storedUser.passwordHash,
      );
      expect(mockRefreshTokensService.create).toHaveBeenCalledWith(
        storedUser.id,
        'hashed-refresh-token',
        new Date('2099-01-01T00:00:00Z'),
        undefined,
      );
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          id: storedUser.id,
          email: storedUser.email,
          firstName: storedUser.firstName,
          lastName: storedUser.lastName,
          emailVerified: storedUser.emailVerified,
        },
      });
    });

    it('still calls bcrypt.compare (against a dummy hash) when no user is found, to avoid a timing side-channel', async () => {
      mockUsersService.findByEmail.mockResolvedValueOnce(null);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(bcrypt.compare).toHaveBeenCalledWith(
        loginDto.password,
        expect.any(String),
      );
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      mockUsersService.findByEmail.mockResolvedValueOnce(storedUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRefreshTokensService.create).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const refreshTokenDto = { refreshToken: 'old-refresh-token' };
    const user = {
      id: 'user-1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      emailVerified: false,
    };

    it('rotates the refresh token and returns a new pair', async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValueOnce({
        sub: user.id,
        jti: 'old-jti',
      });
      mockTokenService.hashToken
        .mockReturnValueOnce('hashed-old-token') // lookup of the presented token
        .mockReturnValueOnce('hashed-new-token'); // hash of the freshly issued token
      mockRefreshTokensService.findValidByHash.mockResolvedValueOnce({
        id: 'stored-token-1',
      });
      mockUsersService.findById.mockResolvedValueOnce(user);
      mockTokenService.signAccessToken.mockResolvedValueOnce(
        'new-access-token',
      );
      mockTokenService.signRefreshToken.mockResolvedValueOnce(
        'new-refresh-token',
      );
      mockTokenService.decodeExpiry.mockReturnValueOnce(
        new Date('2099-01-01T00:00:00Z'),
      );

      const result = await service.refresh(refreshTokenDto);

      expect(mockRefreshTokensService.revokeByHash).toHaveBeenCalledWith(
        'hashed-old-token',
        mockTx,
      );
      expect(mockRefreshTokensService.create).toHaveBeenCalledWith(
        user.id,
        'hashed-new-token',
        new Date('2099-01-01T00:00:00Z'),
        mockTx,
      );
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('propagates the UnauthorizedException when the token signature/expiry is invalid', async () => {
      mockTokenService.verifyRefreshToken.mockRejectedValueOnce(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(service.refresh(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the token is unknown, revoked, or expired', async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValueOnce({
        sub: user.id,
        jti: 'old-jti',
      });
      mockTokenService.hashToken.mockReturnValueOnce('hashed-old-token');
      mockRefreshTokensService.findValidByHash.mockResolvedValueOnce(null);

      await expect(service.refresh(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUsersService.findById).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the token subject no longer exists', async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValueOnce({
        sub: user.id,
        jti: 'old-jti',
      });
      mockTokenService.hashToken.mockReturnValueOnce('hashed-old-token');
      mockRefreshTokensService.findValidByHash.mockResolvedValueOnce({
        id: 'stored-token-1',
      });
      mockUsersService.findById.mockResolvedValueOnce(null);

      await expect(service.refresh(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRefreshTokensService.revokeByHash).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the refresh token by its hash', async () => {
      mockTokenService.hashToken.mockReturnValueOnce('hashed-token');

      await service.logout({ refreshToken: 'some-refresh-token' });

      expect(mockTokenService.hashToken).toHaveBeenCalledWith(
        'some-refresh-token',
      );
      expect(mockRefreshTokensService.revokeByHash).toHaveBeenCalledWith(
        'hashed-token',
      );
    });
  });
});
