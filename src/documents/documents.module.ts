import { Module } from '@nestjs/common';

import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

import { RbacModule } from '../rbac/rbac.module';
import { OpenAiModule } from '../openai/openai.module';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [RbacModule, OpenAiModule, UsageModule],

  controllers: [DocumentsController],

  providers: [DocumentsService],

  exports: [DocumentsService],
})
export class DocumentsModule {}
