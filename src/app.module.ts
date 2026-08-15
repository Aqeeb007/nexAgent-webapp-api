import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { RbacModule } from './rbac/rbac.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),

        DATABASE_HOST: Joi.string().optional(),
        DATABASE_PORT: Joi.number().default(5432),
        DATABASE_URL: Joi.string().required(),

        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().required(),

        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().required(),

        TEST_USER_ID: Joi.string().uuid().optional(),
      }),
    }),
    DatabaseModule,
    RbacModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
