import { type Prisma } from '@prisma/client';

/**
 * CRM defaults seeded when an organization is created (inside the org-create
 * transaction), so the funnel is never hardcoded in the application: an
 * organization can rename, deactivate or extend any of these afterwards.
 */
export const DEFAULT_LEAD_SOURCES: { name: string; code: string }[] = [
  { name: 'Instagram', code: 'INSTAGRAM' },
  { name: 'Telegram', code: 'TELEGRAM' },
  { name: 'Facebook', code: 'FACEBOOK' },
  { name: 'Referral', code: 'REFERRAL' },
  { name: 'Walk-in', code: 'WALK_IN' },
  { name: 'Website', code: 'WEBSITE' },
  { name: 'Google', code: 'GOOGLE' },
  { name: 'Advertisement', code: 'ADVERTISEMENT' },
  { name: 'Other', code: 'OTHER' },
];

export const DEFAULT_PIPELINE = {
  name: 'Sales Pipeline',
  stages: [
    { name: 'New', code: 'NEW', order: 1 },
    { name: 'Contacted', code: 'CONTACTED', order: 2 },
    { name: 'Qualified', code: 'QUALIFIED', order: 3 },
    { name: 'Trial', code: 'TRIAL', order: 4 },
    { name: 'Negotiation', code: 'NEGOTIATION', order: 5 },
  ],
} as const;

/**
 * Creates the default sources and the default pipeline (with its stages) for a
 * new organization. Idempotent per organization only in the sense that it is
 * meant to run exactly once, from organization creation.
 */
export async function seedLeadDefaults(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.leadSource.createMany({
    data: DEFAULT_LEAD_SOURCES.map((source) => ({ ...source, organizationId })),
  });

  const pipeline = await tx.leadPipeline.create({
    data: { organizationId, name: DEFAULT_PIPELINE.name, isDefault: true },
    select: { id: true },
  });

  await tx.leadStage.createMany({
    data: DEFAULT_PIPELINE.stages.map((stage) => ({
      ...stage,
      organizationId,
      pipelineId: pipeline.id,
    })),
  });
}
