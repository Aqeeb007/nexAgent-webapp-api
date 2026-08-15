import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('delegates to AuthService.register and returns its result', async () => {
      const registerDto = {
        email: 'jane@example.com',
        password: 'plainPassword123',
        firstName: 'Jane',
        lastName: 'Doe',
      };
      const createdUser = { id: 'uuid-1', email: registerDto.email };
      authService.register.mockResolvedValue(createdUser);

      const result = await controller.register(registerDto);

      expect(authService.register).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual(createdUser);
    });
  });

  describe('login', () => {
    it('delegates to AuthService.login and returns its result', async () => {
      const loginDto = {
        email: 'jane@example.com',
        password: 'plainPassword123',
      };
      const tokens = { accessToken: 'access', refreshToken: 'refresh' };
      authService.login.mockResolvedValue(tokens);

      const result = await controller.login(loginDto);

      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(result).toEqual(tokens);
    });
  });

  describe('refresh', () => {
    it('delegates to AuthService.refresh and returns its result', async () => {
      const refreshTokenDto = { refreshToken: 'old-refresh-token' };
      const tokens = { accessToken: 'new-access', refreshToken: 'new-refresh' };
      authService.refresh.mockResolvedValue(tokens);

      const result = await controller.refresh(refreshTokenDto);

      expect(authService.refresh).toHaveBeenCalledWith(refreshTokenDto);
      expect(result).toEqual(tokens);
    });
  });

  describe('logout', () => {
    it('delegates to AuthService.logout', async () => {
      const refreshTokenDto = { refreshToken: 'some-refresh-token' };
      authService.logout.mockResolvedValue(undefined);

      const result = await controller.logout(refreshTokenDto);

      expect(authService.logout).toHaveBeenCalledWith(refreshTokenDto);
      expect(result).toBeUndefined();
    });
  });
});
