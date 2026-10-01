import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  DASHBOARD_WIDGETS,
  type DashboardLayoutDto,
  type DashboardWidgetDto,
} from './dashboard-analytics.dto';

/** The professional default: what matters most first; breakdowns available but quieter. */
export const DEFAULT_WIDGETS: DashboardWidgetDto[] = DASHBOARD_WIDGETS.map((key) => ({
  key,
  visible: true,
  chart: key === 'attendance' ? 'line' : 'bar',
}));

/**
 * A member's own dashboard in a center: widget order, visibility, chart type
 * and saved filters. Only known widgets are kept; widgets added in a later
 * release appear (visible) at the end.
 */
@Injectable()
export class DashboardLayoutService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenant: TenantContext) {
    const row = await this.prisma.dashboardLayout.findUnique({
      where: {
        organizationId_userId: { organizationId: tenant.organizationId, userId: tenant.userId },
      },
      select: { widgets: true, filters: true, updatedAt: true },
    });
    return {
      widgets: normalize((row?.widgets as unknown as DashboardWidgetDto[] | undefined) ?? []),
      filters: (row?.filters as Record<string, string> | undefined) ?? {},
      customized: !!row,
    };
  }

  async save(tenant: TenantContext, dto: DashboardLayoutDto) {
    const widgets = normalize(dto.widgets) as unknown as Prisma.InputJsonValue;
    const filters = clean(dto.filters) as Prisma.InputJsonValue;
    await this.prisma.dashboardLayout.upsert({
      where: {
        organizationId_userId: { organizationId: tenant.organizationId, userId: tenant.userId },
      },
      create: { organizationId: tenant.organizationId, userId: tenant.userId, widgets, filters },
      update: { widgets, filters },
    });
    return this.get(tenant);
  }

  /** Back to the default layout. */
  async reset(tenant: TenantContext) {
    await this.prisma.dashboardLayout.deleteMany({
      where: { organizationId: tenant.organizationId, userId: tenant.userId },
    });
    return this.get(tenant);
  }
}

function normalize(widgets: DashboardWidgetDto[]): DashboardWidgetDto[] {
  const known = widgets.filter(
    (w, i) =>
      (DASHBOARD_WIDGETS as readonly string[]).includes(w.key) &&
      widgets.findIndex((x) => x.key === w.key) === i,
  );
  const missing = DEFAULT_WIDGETS.filter((d) => !known.some((w) => w.key === d.key));
  return [
    ...known.map((w) => ({ key: w.key, visible: w.visible, chart: w.chart ?? 'bar' })),
    ...missing,
  ];
}

function clean(filters: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
    ),
  );
}
