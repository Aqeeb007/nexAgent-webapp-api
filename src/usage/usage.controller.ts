import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import { UsageService } from './usage.service';

import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/constants/permissions';
import { OrganizationId } from '../common/decorators/organization-id.decorator';

const DAILY_TREND_DEFAULT_DAYS = 14;

function startOfCurrentMonth(): Date {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfDaysAgo(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);

  return date;
}

function parseDate(value: string): Date {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('`since` must be a valid date');
  }

  return date;
}

@Controller('usage')
@UseGuards(PermissionGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  // No plans/billing periods yet (deliberately deferred — see
  // docs/BILLING_USAGE.md), so "current period" just means the current
  // calendar month; `since` lets a caller ask for any other window.
  // Gated on ORGANIZATION_READ (granted to every role, same as
  // GET /organizations/current) since this is an org-level read with no
  // secrets in it, unlike tool config.
  @Get()
  @RequirePermission(PERMISSIONS.ORGANIZATION_READ)
  summary(
    @OrganizationId() organizationId: string,
    @Query('since') since?: string,
  ) {
    const sinceDate = since ? parseDate(since) : startOfCurrentMonth();

    return this.usageService.summary(organizationId, sinceDate);
  }

  @Get('by-agent')
  @RequirePermission(PERMISSIONS.ORGANIZATION_READ)
  summaryByAgent(
    @OrganizationId() organizationId: string,
    @Query('since') since?: string,
  ) {
    const sinceDate = since ? parseDate(since) : startOfCurrentMonth();

    return this.usageService.summaryByAgent(organizationId, sinceDate);
  }

  // Default window is 14 trailing days, not the current calendar month —
  // this feeds a dashboard trend line, where "how has usage moved lately"
  // matters more than a billing-style month boundary (near the 1st of the
  // month, "this month" would be almost empty).
  @Get('daily')
  @RequirePermission(PERMISSIONS.ORGANIZATION_READ)
  dailySeries(
    @OrganizationId() organizationId: string,
    @Query('since') since?: string,
  ) {
    const sinceDate = since
      ? parseDate(since)
      : startOfDaysAgo(DAILY_TREND_DEFAULT_DAYS);

    return this.usageService.dailyTokenSeries(organizationId, sinceDate);
  }
}
