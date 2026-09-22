import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID } from 'class-validator';

import { CreateWorkflowDto } from './create-workflow.dto';

export class UpdateWorkflowDto extends PartialType(CreateWorkflowDto) {
  // Not part of CreateWorkflowDto — no steps exist at workflow-creation
  // time, so an entry step only ever makes sense to set afterwards.
  // WorkflowsService.update verifies the referenced step belongs to this
  // workflow before writing it.
  @IsOptional()
  @IsUUID()
  entryStepId?: string;
}
