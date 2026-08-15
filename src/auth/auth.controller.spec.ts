import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { register: jest.Mock };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
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
});
