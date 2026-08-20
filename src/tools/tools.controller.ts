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
  create(@OrganizationId() organizationId: string, @Body() dto: CreateToolDto) {
    // Validated by CreateToolDto's nested HttpToolConfigDto — ToolsService
    // stores config as opaque jsonb so it stays agnostic to future tool
    // types with a different config shape.
    return this.toolsService.create(
      organizationId,
      dto as unknown as ToolInput,
    );
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
    const tool = await this.toolsService.update(
      id,
      organizationId,
      dto as unknown as Partial<ToolInput>,
    );

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
