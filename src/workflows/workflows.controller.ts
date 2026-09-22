import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { WorkflowsService, WorkflowStepInput } from './workflows.service';
import { WorkflowExecutionService } from './workflow-execution.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateWorkflowStepDto } from './dto/create-workflow-step.dto';
import { UpdateWorkflowStepDto } from './dto/update-workflow-step.dto';
import { CreateWorkflowEdgeDto } from './dto/create-workflow-edge.dto';
import { ExecuteWorkflowDto } from './dto/execute-workflow.dto';
import { validateStepConfig } from './dto/validate-step-config';

import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/constants/permissions';

import { OrganizationId } from '../common/decorators/organization-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/express';

@Controller('workflows')
@UseGuards(PermissionGuard)
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowExecutionService: WorkflowExecutionService,
  ) {}

  @Post()
  @RequirePermission(PERMISSIONS.WORKFLOW_CREATE)
  create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflowsService.create(organizationId, dto);
  }

  @Get()
  @RequirePermission(PERMISSIONS.WORKFLOW_READ)
  findAll(@OrganizationId() organizationId: string) {
    return this.workflowsService.findAllForOrganization(organizationId);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.WORKFLOW_READ)
  async findOne(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const workflow = await this.workflowsService.findOne(id, organizationId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const [steps, edges] = await Promise.all([
      this.workflowsService.listSteps(id, organizationId),
      this.workflowsService.listEdges(id, organizationId),
    ]);

    return { ...workflow, steps, edges };
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.WORKFLOW_UPDATE)
  async update(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    const workflow = await this.workflowsService.update(
      id,
      organizationId,
      dto,
    );

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return workflow;
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.WORKFLOW_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const removed = await this.workflowsService.remove(id, organizationId);

    if (!removed) {
      throw new NotFoundException('Workflow not found');
    }
  }

  @Post(':id/steps')
  @RequirePermission(PERMISSIONS.WORKFLOW_UPDATE)
  async addStep(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWorkflowStepDto,
  ) {
    const config = await validateStepConfig(dto.type, dto.config);

    return this.workflowsService.addStep(id, organizationId, {
      ...dto,
      config,
    });
  }

  @Get(':id/steps')
  @RequirePermission(PERMISSIONS.WORKFLOW_READ)
  listSteps(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowsService.listSteps(id, organizationId);
  }

  @Patch(':id/steps/:stepId')
  @RequirePermission(PERMISSIONS.WORKFLOW_UPDATE)
  async updateStep(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateWorkflowStepDto,
  ) {
    // type is optional on a PATCH (UpdateWorkflowStepDto is a PartialType),
    // so when only config changes we need the existing step's type to know
    // which concrete config DTO to validate against — same pattern as
    // ToolsController.update.
    const existing = await this.workflowsService.getStep(
      id,
      stepId,
      organizationId,
    );

    if (!existing) {
      throw new NotFoundException('Workflow step not found');
    }

    const update = dto as unknown as Partial<WorkflowStepInput>;

    if (dto.config) {
      update.config = await validateStepConfig(
        dto.type ?? existing.type,
        dto.config,
      );
    }

    const step = await this.workflowsService.updateStep(
      id,
      stepId,
      organizationId,
      update,
    );

    if (!step) {
      throw new NotFoundException('Workflow step not found');
    }

    return step;
  }

  @Delete(':id/steps/:stepId')
  @RequirePermission(PERMISSIONS.WORKFLOW_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStep(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
  ) {
    const removed = await this.workflowsService.removeStep(
      id,
      stepId,
      organizationId,
    );

    if (!removed) {
      throw new NotFoundException('Workflow step not found');
    }
  }

  @Post(':id/edges')
  @RequirePermission(PERMISSIONS.WORKFLOW_UPDATE)
  addEdge(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWorkflowEdgeDto,
  ) {
    return this.workflowsService.addEdge(id, organizationId, dto);
  }

  @Get(':id/edges')
  @RequirePermission(PERMISSIONS.WORKFLOW_READ)
  listEdges(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowsService.listEdges(id, organizationId);
  }

  @Delete(':id/edges/:edgeId')
  @RequirePermission(PERMISSIONS.WORKFLOW_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeEdge(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('edgeId', ParseUUIDPipe) edgeId: string,
  ) {
    const removed = await this.workflowsService.removeEdge(
      id,
      edgeId,
      organizationId,
    );

    if (!removed) {
      throw new NotFoundException('Workflow edge not found');
    }
  }

  @Post(':id/execute')
  @RequirePermission(PERMISSIONS.WORKFLOW_EXECUTE)
  execute(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ExecuteWorkflowDto,
  ) {
    return this.workflowExecutionService.execute(
      id,
      organizationId,
      user.id,
      dto.input,
    );
  }

  @Get(':id/runs')
  @RequirePermission(PERMISSIONS.WORKFLOW_READ)
  listRuns(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowExecutionService.listRuns(id, organizationId);
  }

  @Get(':id/runs/:runId')
  @RequirePermission(PERMISSIONS.WORKFLOW_READ)
  async getRun(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    const run = await this.workflowExecutionService.getRun(
      id,
      runId,
      organizationId,
    );

    if (!run) {
      throw new NotFoundException('Workflow run not found');
    }

    return run;
  }
}
