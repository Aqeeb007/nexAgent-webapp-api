import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { RbacModule } from './rbac/rbac.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { AgentsModule } from './agents/agents.module';
import { ToolsModule } from './tools/tools.module';
import { AgentToolsModule } from './agent-tools/agent-tools.module';
import { OpenAiModule } from './openai/openai.module';
import { ChatModule } from './chat/chat.module';
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

        OPENAI_API_KEY: Joi.string().required(),
      }),
    }),
    DatabaseModule,
    RbacModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    AgentsModule,
    ToolsModule,
    AgentToolsModule,
    OpenAiModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
