<script setup lang="ts">
import { ChevronRight, MapPin, Network, Palette } from 'lucide-vue-next';
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { P } from '@/app/config/permissions';
import InfoList, { type InfoItem } from '@/components/data/InfoList.vue';
import SectionCard from '@/components/data/SectionCard.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import FormError from '@/components/forms/FormError.vue';
import FormField from '@/components/forms/FormField.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppAlert from '@/components/ui/AppAlert.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { useManagedBranches } from '@/features/branches/api';
import { useRegionalOptions } from '@/features/centers/options';
import { organizationsApi, type UpdateOrganizationInput } from '@/features/organizations/api';
import { useSubCenters } from '@/features/sub-centers/api';
import { normalizePhone, zOptionalText, zText } from '@/lib/validation';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';

/** The director's center: profile (editable), status and period (owner-managed), structure. */
const { t } = useI18n();
const { can } = usePermission();
const session = useSessionStore();
const format = useFormatters();
const regional = useRegionalOptions();
const org = computed(() => session.organization);
const canEdit = computed(() => can(P.ORGANIZATION_UPDATE));
const subCenters = useSubCenters(() => can(P.SUB_CENTERS_READ));
const branches = useManagedBranches();

const schema = z
  .object({
    name: zText(160),
    phone: z.string().trim(),
    email: z.string().trim(),
    address: zOptionalText(500),
    timezone: zText(64),
    currency: zText(3),
    language: z.enum(['uz', 'ru', 'en']),
  })
  .superRefine((value, context) => {
    if (value.phone && !normalizePhone(value.phone)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: t('validation.phone') });
    if (value.email && !z.string().email().safeParse(value.email).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: t('validation.email') });
    }
  });
const save = useApiMutation({
  fn: (body: UpdateOrganizationInput) => organizationsApi.update(session.organizationId ?? '', body),
  success: () => t('management.center.saved'),
  onSuccess: () => session.reloadContext(),
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting, meta } = useEntityForm({
  schema,
  initialValues: () => ({
    name: org.value?.name ?? '',
    phone: org.value?.phone ?? '',
    email: org.value?.email ?? '',
    address: org.value?.address ?? '',
    timezone: org.value?.timezone ?? 'Asia/Tashkent',
    currency: org.value?.currency ?? 'UZS',
    language: (org.value?.language ?? 'uz') as 'uz' | 'ru' | 'en',
  }),
  submit: (v) =>
    save.mutateAsync({
      name: v.name,
      phone: v.phone ? (normalizePhone(v.phone) ?? v.phone) : null,
      email: v.email || null,
      address: v.address ?? null,
      timezone: v.timezone,
      currency: v.currency,
      language: v.language,
    }),
});
const [name] = defineField('name');
const [phone] = defineField('phone');
const [email] = defineField('email');
const [address] = defineField('address');
const [timezone] = defineField('timezone');
const [currency] = defineField('currency');
const [language] = defineField('language');
watch(org, () => reset());

const lifecycle = computed<InfoItem[]>(() => [
  {
    key: 'period',
    label: t('management.center.period'),
    value: org.value?.activeUntil
      ? `${org.value.activeFrom ? format.day(org.value.activeFrom) : '…'} — ${format.day(org.value.activeUntil)}`
      : t('management.center.openEnded'),
  },
]);
const direct = computed(() => (branches.data.value ?? []).filter((b) => !b.subCenterId));
</script>

<template>
  <PageHeader :title="org?.name ?? $t('management.center.title')" :description="$t('management.center.subtitle')" />
  <div class="grid gap-4 lg:grid-cols-3">
    <SectionCard :title="$t('management.center.profile')" class="lg:col-span-2">
      <AppAlert v-if="!canEdit" tone="info" class="mb-4">{{ $t('management.center.readOnly') }}</AppAlert>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
        <fieldset :disabled="!canEdit" class="flex flex-col gap-4">
          <FormField v-slot="field" :label="$t('management.center.name')" :error="errors.name">
            <AppInput :id="field.id" v-model="name" :invalid="field.invalid" :described-by="field.describedBy" />
          </FormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <FormField v-slot="field" :label="$t('management.center.phone')" :error="errors.phone" optional>
              <AppInput :id="field.id" v-model="phone" type="tel" inputmode="tel" :invalid="field.invalid" :described-by="field.describedBy" />
            </FormField>
            <FormField v-slot="field" :label="$t('management.center.email')" :error="errors.email" optional>
              <AppInput :id="field.id" v-model="email" type="email" :invalid="field.invalid" :described-by="field.describedBy" />
            </FormField>
          </div>
          <FormField v-slot="field" :label="$t('management.center.address')" :error="errors.address" optional>
            <AppInput :id="field.id" v-model="address" :invalid="field.invalid" :described-by="field.describedBy" />
          </FormField>
          <div class="grid gap-4 sm:grid-cols-3">
            <FormField v-slot="field" :label="$t('management.center.timezone')" :error="errors.timezone">
              <AppSelect :id="field.id" v-model="timezone" :options="regional.timezones" />
            </FormField>
            <FormField v-slot="field" :label="$t('management.center.currency')" :error="errors.currency">
              <AppSelect :id="field.id" v-model="currency" :options="regional.currencies" />
            </FormField>
            <FormField v-slot="field" :label="$t('management.center.language')" :error="errors.language">
              <AppSelect :id="field.id" v-model="language" :options="regional.languages.value" />
            </FormField>
          </div>
        </fieldset>
        <FormError :message="formError" />
        <div v-if="canEdit" class="flex flex-wrap gap-2">
          <AppButton type="submit" :loading="isSubmitting" :disabled="!meta.dirty">{{ $t('common.save') }}</AppButton>
          <AppButton variant="ghost" :icon="Palette" to="/settings/brand">{{ $t('management.center.brandLink') }}</AppButton>
        </div>
      </form>
    </SectionCard>

    <div class="flex flex-col gap-4">
      <SectionCard :title="$t('management.center.status')">
        <StatusBadge kind="center" :value="org?.status ?? 'ACTIVE'" />
        <InfoList class="mt-3" :items="lifecycle" :columns="1" />
        <p class="mt-2 text-xs text-fg-muted">{{ $t('management.center.periodHint') }}</p>
      </SectionCard>

      <SectionCard :title="$t('management.center.structure')">
        <ul class="flex flex-col gap-3 text-sm">
          <li v-for="sub in subCenters.data.value ?? []" :key="sub.id">
            <p class="flex items-center gap-2 font-medium text-fg">
              <Network class="size-4 text-fg-subtle" aria-hidden="true" />{{ sub.name }}
              <StatusBadge v-if="sub.status !== 'ACTIVE'" kind="center" :value="sub.status" />
            </p>
            <ul class="mt-1 ml-6 flex flex-col gap-0.5 text-fg-muted">
              <li v-for="b in sub.branches" :key="b.id" class="flex items-center gap-1.5"><MapPin class="size-3.5" aria-hidden="true" />{{ b.name }}</li>
              <li v-if="!sub.branches.length" class="text-xs">{{ $t('management.subCenters.noBranches') }}</li>
            </ul>
          </li>
          <li v-if="direct.length">
            <p class="font-medium text-fg">{{ $t('management.center.direct') }}</p>
            <ul class="mt-1 ml-6 flex flex-col gap-0.5 text-fg-muted">
              <li v-for="b in direct" :key="b.id" class="flex items-center gap-1.5"><MapPin class="size-3.5" aria-hidden="true" />{{ b.name }}</li>
            </ul>
          </li>
        </ul>
        <div class="mt-4 flex flex-col gap-1">
          <RouterLink v-if="can(P.SUB_CENTERS_READ)" to="/sub-centers" class="focus-ring flex min-h-10 items-center justify-between rounded-lg text-sm font-medium text-primary-text">
            {{ $t('management.subCenters.title') }}<ChevronRight class="size-4" aria-hidden="true" />
          </RouterLink>
          <RouterLink to="/branches" class="focus-ring flex min-h-10 items-center justify-between rounded-lg text-sm font-medium text-primary-text">
            {{ $t('management.branches.title') }}<ChevronRight class="size-4" aria-hidden="true" />
          </RouterLink>
        </div>
      </SectionCard>
    </div>
  </div>
</template>
