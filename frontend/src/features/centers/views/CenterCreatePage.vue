<script setup lang="ts">
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, ExternalLink, Plus, WandSparkles } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { z } from 'zod';
import InfoList, { type InfoItem } from '@/components/data/InfoList.vue';
import SectionCard from '@/components/data/SectionCard.vue';
import FormError from '@/components/forms/FormError.vue';
import FormField from '@/components/forms/FormField.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppAlert from '@/components/ui/AppAlert.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppSwitch from '@/components/ui/AppSwitch.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { useFormatters } from '@/composables/useFormatters';
import { generateTemporaryPassword } from '@/features/directors/temporary-password';
import ModulePicker from '@/features/directors/components/ModulePicker.vue';
import { permissionsOf } from '@/features/directors/permission-modules';
import CredentialsCard from '@/features/shared/CredentialsCard.vue';
import { orgDay } from '@/lib/dates';
import { zOptionalEmail, zOptionalPhone, zOptionalText, zText } from '@/lib/validation';
import { isApiError } from '@/services/api/api-error';
import type { CreateCenterDto, CreatedCenterDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { centersApi } from '../api';
import { useRegionalOptions, zHexColor, zOptionalHexColor, zOptionalSlug, zOptionalUrl } from '../options';

/**
 * Center → Brand → Director → Activation → Review → Create → Success.
 * Each step is checked before moving on; the API checks everything again.
 */
const { t } = useI18n();
const router = useRouter();
const format = useFormatters();
const regional = useRegionalOptions();
const STEPS = ['info', 'brand', 'director', 'period', 'review'] as const;
type Step = (typeof STEPS)[number];
const step = ref<Step>('info');
const stepIndex = computed(() => STEPS.indexOf(step.value));

const form = reactive({
  name: '',
  slug: '',
  phone: '',
  email: '',
  address: '',
  timezone: 'Asia/Tashkent',
  currency: 'UZS',
  language: 'uz',
  primaryColor: '#4F46E5',
  secondaryColor: '',
  logoUrl: '',
  faviconUrl: '',
  withDirector: true,
  directorName: '',
  directorEmail: '',
  directorPhone: '',
  temporaryPassword: '',
  access: 'full',
  modules: [] as string[],
  activeFrom: orgDay('Asia/Tashkent'),
  activeUntil: '',
});
const errors = reactive<Record<string, string | undefined>>({});
const formError = ref<string | null>(null);
const created = ref<CreatedCenterDto | null>(null);

const schemas = computed(() => ({
  info: z.object({
    name: zText(160),
    slug: zOptionalSlug(),
    phone: zOptionalPhone(),
    email: zOptionalEmail(),
    address: zOptionalText(500),
    timezone: zText(64),
    currency: zText(3),
    language: z.enum(['uz', 'ru', 'en']),
  }),
  brand: z.object({
    primaryColor: zHexColor(),
    secondaryColor: zOptionalHexColor(),
    logoUrl: zOptionalUrl(),
    faviconUrl: zOptionalUrl(),
  }),
  director: form.withDirector
    ? z
        .object({
          directorName: zText(120),
          directorEmail: zOptionalEmail(),
          directorPhone: zOptionalPhone(),
          temporaryPassword: z
            .string()
            .trim()
            .refine((v) => v === '' || (v.length >= 8 && v.length <= 128), () => ({ message: t('validation.min', { min: 8 }) }))
            .transform((v) => v || undefined),
          access: z.enum(['full', 'custom']),
          modules: z.array(z.string()),
        })
        .superRefine((value, context) => {
          if (!value.directorEmail && !value.directorPhone) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['directorEmail'], message: t('validation.login') });
          }
          if (value.access === 'custom' && value.modules.length === 0) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['modules'], message: t('validation.choose') });
          }
        })
    : z.object({}),
  period: z
    .object({ activeFrom: z.string(), activeUntil: z.string() })
    .superRefine((value, context) => {
      if (value.activeFrom && value.activeUntil && value.activeFrom > value.activeUntil) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['activeUntil'], message: t('errors.INVALID_DATE_RANGE') });
      }
    }),
  review: z.object({}),
}));

function check(target: Step): boolean {
  const result = schemas.value[target].safeParse(form);
  for (const key of Object.keys(errors)) errors[key] = undefined;
  if (result.success) return true;
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    errors[field] ??= issue.message;
  }
  return false;
}

function next(): void {
  if (!check(step.value)) return;
  step.value = STEPS[Math.min(stepIndex.value + 1, STEPS.length - 1)] ?? 'review';
}
function back(): void {
  step.value = STEPS[Math.max(stepIndex.value - 1, 0)] ?? 'info';
}

function payload(): CreateCenterDto {
  const info = schemas.value.info.parse(form);
  const brand = schemas.value.brand.parse(form);
  const body: CreateCenterDto = {
    ...info,
    ...brand,
    activeFrom: form.activeFrom || undefined,
    activeUntil: form.activeUntil || undefined,
  };
  if (form.withDirector) {
    const d = schemas.value.director.parse(form) as {
      directorName: string;
      directorEmail?: string;
      directorPhone?: string;
      temporaryPassword?: string;
    };
    body.director = {
      name: d.directorName,
      email: d.directorEmail,
      phone: d.directorPhone,
      temporaryPassword: d.temporaryPassword,
      permissions: form.access === 'custom' ? (permissionsOf(form.modules) as NonNullable<CreateCenterDto['director']>['permissions']) : undefined,
    };
  }
  return body;
}

const create = useApiMutation({
  fn: (body: CreateCenterDto) => centersApi.create(body),
  invalidates: [['owner']],
  onSuccess: (result) => {
    created.value = result;
  },
});

async function submit(): Promise<void> {
  formError.value = null;
  for (const target of STEPS) {
    if (!check(target)) {
      step.value = target;
      return;
    }
  }
  try {
    await create.mutateAsync(payload());
  } catch (error) {
    if (isApiError(error) && error.code === 'ORGANIZATION_SLUG_TAKEN') {
      step.value = 'info';
      errors.slug = apiErrorMessage(error);
      return;
    }
    formError.value = apiErrorMessage(error);
  }
}

function restart(): void {
  router.go(0);
}

const accessOptions = computed(() => [
  { value: 'full', label: t('owner.wizard.permissionsFull') },
  { value: 'custom', label: t('owner.wizard.permissionsCustom') },
]);
const review = computed<InfoItem[]>(() => [
  { key: 'name', label: t('owner.centers.name'), value: form.name },
  { key: 'slug', label: t('owner.centers.slug'), value: form.slug || null },
  { key: 'contacts', label: t('owner.centers.sections.contacts'), value: [form.phone, form.email, form.address].filter(Boolean).join(' · ') || null },
  { key: 'regional', label: t('owner.centers.sections.regional'), value: `${form.timezone} · ${form.currency} · ${t(`language.${form.language}`)}` },
  { key: 'brand', label: t('owner.centers.sections.brand'), value: [form.primaryColor, form.secondaryColor].filter(Boolean).join(' / ') },
  {
    key: 'director',
    label: t('owner.wizard.steps.director'),
    value: form.withDirector ? `${form.directorName} · ${form.directorEmail || form.directorPhone}` : t('owner.wizard.noDirector'),
  },
  {
    key: 'access',
    label: t('owner.wizard.permissions'),
    value: form.withDirector ? (form.access === 'full' ? t('owner.wizard.permissionsFull') : form.modules.map((m) => t(`owner.modules.${m}`)).join(', ')) : null,
  },
  {
    key: 'period',
    label: t('owner.centers.period'),
    value: `${form.activeFrom ? format.day(form.activeFrom) : '…'} — ${form.activeUntil ? format.day(form.activeUntil) : t('owner.centers.openEnded')}`,
  },
]);
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <RouterLink to="/owner/centers" class="focus-ring mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-primary-text">
      <ArrowLeft class="size-4" aria-hidden="true" />{{ $t('owner.centers.title') }}
    </RouterLink>
    <PageHeader :title="$t('owner.wizard.title')" />

    <!-- Success -->
    <SectionCard v-if="created">
      <div class="flex flex-col gap-5">
        <p class="flex items-center gap-2 text-lg font-semibold text-fg" role="status">
          <CheckCircle2 class="size-6 text-success" aria-hidden="true" />{{ $t('owner.wizard.success') }}
        </p>
        <div>
          <h2 class="mb-2 text-sm font-semibold text-fg-muted">{{ $t('owner.wizard.accessTitle') }}</h2>
          <InfoList
            :items="[
              { key: 'name', label: $t('owner.centers.name'), value: created.center.name },
              { key: 'slug', label: $t('owner.centers.slug'), value: created.center.slug },
              { key: 'url', label: $t('owner.centers.accessUrl'), value: created.center.accessUrl ?? $t('owner.centers.noAccessUrl') },
            ]"
            :columns="1"
          />
        </div>
        <CredentialsCard
          v-if="created.director"
          :credentials="{ name: created.director.director.user.name, login: created.director.login, temporaryPassword: created.director.temporaryPassword }"
        />
        <div class="flex flex-wrap gap-2">
          <AppButton :icon="ExternalLink" @click="router.push({ name: 'owner-center', params: { id: created.center.id } })">{{ $t('owner.wizard.open') }}</AppButton>
          <AppButton variant="secondary" :icon="Plus" @click="restart">{{ $t('owner.wizard.another') }}</AppButton>
        </div>
      </div>
    </SectionCard>

    <template v-else>
      <ol class="mb-5 flex gap-1 overflow-x-auto" :aria-label="$t('owner.wizard.step', { current: stepIndex + 1, total: STEPS.length })">
        <li v-for="(key, index) in STEPS" :key="key" class="min-w-24 flex-1">
          <span
            class="block h-1.5 rounded-full"
            :class="index <= stepIndex ? 'bg-primary' : 'bg-surface-muted'"
            aria-hidden="true"
          />
          <span class="mt-1.5 block truncate text-xs" :class="index === stepIndex ? 'font-semibold text-fg' : 'text-fg-muted'" :aria-current="index === stepIndex ? 'step' : undefined">
            {{ $t(`owner.wizard.steps.${key}`) }}
          </span>
        </li>
      </ol>

      <form class="glass flex flex-col gap-4 rounded-3xl p-5 sm:p-6" novalidate @submit.prevent="step === 'review' ? submit() : next()">
        <h2 class="text-lg font-semibold text-fg">{{ $t(`owner.wizard.steps.${step}`) }}</h2>

        <template v-if="step === 'info'">
          <FormField v-slot="field" :label="$t('owner.centers.name')" :error="errors.name">
            <AppInput :id="field.id" v-model="form.name" :placeholder="$t('owner.centers.namePlaceholder')" :invalid="field.invalid" :described-by="field.describedBy" />
          </FormField>
          <FormField v-slot="field" :label="$t('owner.centers.slug')" :hint="$t('owner.centers.slugHint')" :error="errors.slug" optional>
            <AppInput :id="field.id" v-model="form.slug" placeholder="jony" autocapitalize="none" :invalid="field.invalid" :described-by="field.describedBy" />
          </FormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <FormField v-slot="field" :label="$t('owner.centers.fields.phone')" :error="errors.phone" optional>
              <AppInput :id="field.id" v-model="form.phone" type="tel" inputmode="tel" :invalid="field.invalid" :described-by="field.describedBy" />
            </FormField>
            <FormField v-slot="field" :label="$t('owner.centers.fields.email')" :error="errors.email" optional>
              <AppInput :id="field.id" v-model="form.email" type="email" :invalid="field.invalid" :described-by="field.describedBy" />
            </FormField>
          </div>
          <FormField v-slot="field" :label="$t('owner.centers.fields.address')" :error="errors.address" optional>
            <AppInput :id="field.id" v-model="form.address" :invalid="field.invalid" :described-by="field.describedBy" />
          </FormField>
          <div class="grid gap-4 sm:grid-cols-3">
            <FormField v-slot="field" :label="$t('owner.centers.fields.timezone')" :error="errors.timezone">
              <AppSelect :id="field.id" v-model="form.timezone" :options="regional.timezones" />
            </FormField>
            <FormField v-slot="field" :label="$t('owner.centers.fields.currency')" :error="errors.currency">
              <AppSelect :id="field.id" v-model="form.currency" :options="regional.currencies" />
            </FormField>
            <FormField v-slot="field" :label="$t('owner.centers.fields.language')" :error="errors.language">
              <AppSelect :id="field.id" v-model="form.language" :options="regional.languages.value" />
            </FormField>
          </div>
        </template>

        <template v-else-if="step === 'brand'">
          <div class="grid gap-4 sm:grid-cols-2">
            <FormField v-slot="field" :label="$t('owner.centers.fields.primaryColor')" :error="errors.primaryColor">
              <div class="flex items-center gap-2">
                <input v-model="form.primaryColor" type="color" class="size-11 shrink-0 cursor-pointer rounded-xl border border-border bg-surface" :aria-label="$t('settings.brand.pickColor')" />
                <AppInput :id="field.id" v-model="form.primaryColor" :invalid="field.invalid" :described-by="field.describedBy" />
              </div>
            </FormField>
            <FormField v-slot="field" :label="$t('owner.centers.fields.secondaryColor')" :error="errors.secondaryColor" optional>
              <AppInput :id="field.id" v-model="form.secondaryColor" placeholder="#0EA5E9" :invalid="field.invalid" :described-by="field.describedBy" />
            </FormField>
          </div>
          <FormField v-slot="field" :label="$t('owner.centers.fields.logoUrl')" :error="errors.logoUrl" optional>
            <AppInput :id="field.id" v-model="form.logoUrl" type="url" placeholder="https://…" :invalid="field.invalid" :described-by="field.describedBy" />
          </FormField>
          <FormField v-slot="field" :label="$t('owner.centers.fields.faviconUrl')" :error="errors.faviconUrl" optional>
            <AppInput :id="field.id" v-model="form.faviconUrl" type="url" placeholder="https://…" :invalid="field.invalid" :described-by="field.describedBy" />
          </FormField>
          <div class="flex items-center gap-3 rounded-2xl border border-border p-3">
            <span class="inline-flex size-10 items-center justify-center rounded-xl text-white" :style="{ background: form.primaryColor }">
              <Building2 class="size-5" aria-hidden="true" />
            </span>
            <span class="font-medium text-fg">{{ form.name }}</span>
          </div>
        </template>

        <template v-else-if="step === 'director'">
          <AppSwitch v-model="form.withDirector" :label="$t('owner.wizard.withDirector')" />
          <template v-if="form.withDirector">
            <p class="text-sm text-fg-muted">{{ $t('owner.wizard.directorHint') }}</p>
            <FormField v-slot="field" :label="$t('owner.directors.name')" :error="errors.directorName">
              <AppInput :id="field.id" v-model="form.directorName" autocomplete="off" :invalid="field.invalid" :described-by="field.describedBy" />
            </FormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <FormField v-slot="field" :label="$t('owner.directors.email')" :error="errors.directorEmail">
                <AppInput :id="field.id" v-model="form.directorEmail" type="email" autocomplete="off" :invalid="field.invalid" :described-by="field.describedBy" />
              </FormField>
              <FormField v-slot="field" :label="$t('owner.directors.phone')" :error="errors.directorPhone" optional>
                <AppInput :id="field.id" v-model="form.directorPhone" type="tel" inputmode="tel" autocomplete="off" :invalid="field.invalid" :described-by="field.describedBy" />
              </FormField>
            </div>
            <FormField v-slot="field" :label="$t('owner.wizard.temporaryPassword')" :hint="$t('owner.wizard.temporaryPasswordHint')" :error="errors.temporaryPassword" optional>
              <div class="flex gap-2">
                <AppInput :id="field.id" v-model="form.temporaryPassword" autocomplete="new-password" spellcheck="false" class="font-mono" :invalid="field.invalid" :described-by="field.describedBy" />
                <AppButton variant="secondary" :icon="WandSparkles" @click="form.temporaryPassword = generateTemporaryPassword()">{{ $t('owner.wizard.generate') }}</AppButton>
              </div>
            </FormField>
            <div class="flex flex-col gap-2">
              <p class="text-sm font-medium text-fg" aria-hidden="true">{{ $t('owner.wizard.permissions') }}</p>
              <AppRadioGroup v-model="form.access" :options="accessOptions" :label="$t('owner.wizard.permissions')" name="director-access" />
              <ModulePicker v-if="form.access === 'custom'" v-model="form.modules" />
              <p v-if="errors.modules" class="text-sm text-danger" role="alert">{{ errors.modules }}</p>
            </div>
          </template>
          <AppAlert v-else tone="info">{{ $t('owner.wizard.noDirector') }}</AppAlert>
        </template>

        <template v-else-if="step === 'period'">
          <p class="text-sm text-fg-muted">{{ $t('owner.centers.periodHint') }}</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <FormField v-slot="field" :label="$t('owner.centers.from')" :error="errors.activeFrom" optional>
              <AppDatePicker :id="field.id" v-model="form.activeFrom" :max="form.activeUntil || undefined" />
            </FormField>
            <FormField v-slot="field" :label="$t('owner.centers.until')" :error="errors.activeUntil" optional>
              <AppDatePicker :id="field.id" v-model="form.activeUntil" :min="form.activeFrom || undefined" />
            </FormField>
          </div>
        </template>

        <template v-else>
          <InfoList :items="review" :columns="1" />
        </template>

        <FormError :message="formError" />

        <div class="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
          <AppButton v-if="stepIndex > 0" variant="ghost" :icon="ArrowLeft" @click="back">{{ $t('owner.wizard.back') }}</AppButton>
          <span v-else />
          <AppButton v-if="step !== 'review'" type="submit" :icon="ArrowRight">{{ $t('owner.wizard.next') }}</AppButton>
          <AppButton v-else type="submit" :loading="create.isPending.value">
            {{ create.isPending.value ? $t('owner.wizard.creating') : $t('owner.wizard.create') }}
          </AppButton>
        </div>
      </form>
    </template>
  </div>
</template>
