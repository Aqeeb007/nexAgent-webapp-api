import { Module } from '@nestjs/common';

import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';

import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
