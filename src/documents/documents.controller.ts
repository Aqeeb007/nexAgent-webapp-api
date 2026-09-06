import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { MAX_PDF_BYTES } from './upload-limits';

import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/constants/permissions';

import { OrganizationId } from '../common/decorators/organization-id.decorator';

@Controller('documents')
@UseGuards(PermissionGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @RequirePermission(PERMISSIONS.DOCUMENT_CREATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PDF_BYTES } }),
  )
  create(
    @OrganizationId() organizationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    if (!file) {
      throw new BadRequestException('A PDF file is required');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are supported');
    }

    return this.documentsService.create(
      organizationId,
      dto.name ?? file.originalname,
      file.buffer,
    );
  }

  @Get()
  @RequirePermission(PERMISSIONS.DOCUMENT_READ)
  findAll(@OrganizationId() organizationId: string) {
    return this.documentsService.findAllForOrganization(organizationId);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.DOCUMENT_READ)
  async findOne(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const document = await this.documentsService.findOne(id, organizationId);

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.DOCUMENT_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const removed = await this.documentsService.remove(id, organizationId);

    if (!removed) {
      throw new NotFoundException('Document not found');
    }
  }
}
