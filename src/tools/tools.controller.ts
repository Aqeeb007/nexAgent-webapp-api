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

import { ToolInput, ToolsService } from './tools.service';
import { CreateToolDto } from './dto/create-tool.dto';
import { UpdateToolDto } from './dto/update-tool.dto';
import { TestToolDto } from './dto/test-tool.dto';
import { validateToolConfig } from './dto/validate-tool-config';

import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/constants/permissions';

import { OrganizationId } from '../common/decorators/organization-id.decorator';

@Controller('tools')
@UseGuards(PermissionGuard)
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Post()
  @RequirePermission(PERMISSIONS.TOOL_CREATE)
  async create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateToolDto,
  ) {
    // config's shape varies by type (http/database/custom_js), so it's
    // validated here against the matching concrete config DTO rather than a
    // single fixed nested DTO — ToolsService still stores it as opaque
    // jsonb.
    const config = await validateToolConfig(dto.type, dto.config);

    return this.toolsService.create(organizationId, {
      ...dto,
      config,
    });
  }

  @Get()
  @RequirePermission(PERMISSIONS.TOOL_READ)
  findAll(@OrganizationId() organizationId: string) {
    return this.toolsService.findAllForOrganization(organizationId);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TOOL_READ)
  async findOne(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tool = await this.toolsService.findOne(id, organizationId);

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    return tool;
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TOOL_UPDATE)
  async update(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateToolDto,
  ) {
    // type is optional on a PATCH (UpdateToolDto is a PartialType), so when
    // only config changes we need the existing row's type to know which
    // concrete config DTO to validate against.
    const existing = await this.toolsService.findOne(id, organizationId);

    if (!existing) {
      throw new NotFoundException('Tool not found');
    }

    const update = dto as unknown as Partial<ToolInput>;

    if (dto.config) {
      update.config = await validateToolConfig(
        dto.type ?? existing.type,
        dto.config,
      );
    }

    const tool = await this.toolsService.update(id, organizationId, update);

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    return tool;
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.TOOL_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const removed = await this.toolsService.remove(id, organizationId);

    if (!removed) {
      throw new NotFoundException('Tool not found');
    }
  }

  @Post(':id/test')
  @RequirePermission(PERMISSIONS.TOOL_EXECUTE)
  async test(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestToolDto,
  ) {
    const tool = await this.toolsService.findOne(id, organizationId);

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    return this.toolsService.execute(tool, dto.args ?? {});
  }
}
