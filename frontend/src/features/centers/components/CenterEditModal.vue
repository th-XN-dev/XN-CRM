<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { normalizePhone, zOptionalText, zText } from '@/lib/validation';
import type { CenterDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { centersApi, type UpdateCenterInput } from '../api';
import { useRegionalOptions, zHexColor, zOptionalHexColor, zOptionalSlug, zOptionalUrl } from '../options';

/** The owner edits everything about a center: profile, brand, address and activation period. */
const props = defineProps<{ center: CenterDto }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const regional = useRegionalOptions();
/** Emptied optional fields are sent as null so they are really cleared. */
const orNull = (value: string | undefined) => value || null;

const schema = z
  .object({
    name: zText(160),
    slug: zOptionalSlug(),
    phone: z.string().trim(),
    email: z.string().trim(),
    address: zOptionalText(500),
    timezone: zText(64),
    currency: zText(3),
    language: z.enum(['uz', 'ru', 'en']),
    primaryColor: zHexColor(),
    secondaryColor: zOptionalHexColor(),
    logoUrl: zOptionalUrl(),
    faviconUrl: zOptionalUrl(),
    activeFrom: z.string(),
    activeUntil: z.string(),
  })
  .superRefine((value, context) => {
    if (value.phone && !normalizePhone(value.phone)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: t('validation.phone') });
    if (value.email && !z.string().email().safeParse(value.email).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: t('validation.email') });
    }
    if (value.activeFrom && value.activeUntil && value.activeFrom > value.activeUntil) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['activeUntil'], message: t('errors.INVALID_DATE_RANGE') });
    }
  });

const save = useApiMutation({
  fn: (body: UpdateCenterInput) => centersApi.update(props.center.id, body),
  invalidates: [['owner']],
  success: () => t('owner.centers.saved'),
  onSuccess: () => {
    open.value = false;
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    name: props.center.name,
    slug: props.center.slug,
    phone: props.center.phone ?? '',
    email: props.center.email ?? '',
    address: props.center.address ?? '',
    timezone: props.center.timezone,
    currency: props.center.currency,
    language: props.center.language as 'uz' | 'ru' | 'en',
    primaryColor: props.center.primaryColor,
    secondaryColor: props.center.secondaryColor ?? '',
    logoUrl: props.center.logoUrl ?? '',
    faviconUrl: props.center.faviconUrl ?? '',
    activeFrom: props.center.activeFrom?.slice(0, 10) ?? '',
    activeUntil: props.center.activeUntil?.slice(0, 10) ?? '',
  }),
  submit: (v) =>
    save.mutateAsync({
      name: v.name,
      slug: v.slug,
      phone: v.phone ? (normalizePhone(v.phone) ?? v.phone) : null,
      email: orNull(v.email),
      address: orNull(v.address),
      timezone: v.timezone,
      currency: v.currency,
      language: v.language,
      primaryColor: v.primaryColor,
      secondaryColor: orNull(v.secondaryColor),
      logoUrl: orNull(v.logoUrl),
      faviconUrl: orNull(v.faviconUrl),
      activeFrom: v.activeFrom || null,
      activeUntil: v.activeUntil || null,
    }),
  fieldCodes: { ORGANIZATION_SLUG_TAKEN: 'slug', INVALID_DATE_RANGE: 'activeUntil' },
});
const [name] = defineField('name');
const [slug] = defineField('slug');
const [phone] = defineField('phone');
const [email] = defineField('email');
const [address] = defineField('address');
const [timezone] = defineField('timezone');
const [currency] = defineField('currency');
const [language] = defineField('language');
const [primaryColor] = defineField('primaryColor');
const [secondaryColor] = defineField('secondaryColor');
const [logoUrl] = defineField('logoUrl');
const [faviconUrl] = defineField('faviconUrl');
const [activeFrom] = defineField('activeFrom');
const [activeUntil] = defineField('activeUntil');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal v-model:open="open" :title="$t('owner.centers.edit')" size="lg" :loading="isSubmitting" :error="formError" @submit="onSubmit">
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('owner.centers.name')" :error="errors.name">
        <AppInput :id="field.id" v-model="name" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('owner.centers.slug')" :hint="$t('owner.centers.slugHint')" :error="errors.slug">
        <AppInput :id="field.id" v-model="slug" autocapitalize="none" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('owner.centers.fields.phone')" :error="errors.phone" optional>
        <AppInput :id="field.id" v-model="phone" type="tel" inputmode="tel" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('owner.centers.fields.email')" :error="errors.email" optional>
        <AppInput :id="field.id" v-model="email" type="email" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-slot="field" :label="$t('owner.centers.fields.address')" :error="errors.address" optional>
      <AppInput :id="field.id" v-model="address" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <div class="grid gap-4 sm:grid-cols-3">
      <FormField v-slot="field" :label="$t('owner.centers.fields.timezone')" :error="errors.timezone">
        <AppSelect :id="field.id" v-model="timezone" :options="regional.timezones" />
      </FormField>
      <FormField v-slot="field" :label="$t('owner.centers.fields.currency')" :error="errors.currency">
        <AppSelect :id="field.id" v-model="currency" :options="regional.currencies" />
      </FormField>
      <FormField v-slot="field" :label="$t('owner.centers.fields.language')" :error="errors.language">
        <AppSelect :id="field.id" v-model="language" :options="regional.languages.value" />
      </FormField>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('owner.centers.fields.primaryColor')" :error="errors.primaryColor">
        <AppInput :id="field.id" v-model="primaryColor" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('owner.centers.fields.secondaryColor')" :error="errors.secondaryColor" optional>
        <AppInput :id="field.id" v-model="secondaryColor" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('owner.centers.fields.logoUrl')" :error="errors.logoUrl" optional>
        <AppInput :id="field.id" v-model="logoUrl" type="url" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('owner.centers.fields.faviconUrl')" :error="errors.faviconUrl" optional>
        <AppInput :id="field.id" v-model="faviconUrl" type="url" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <p class="text-sm text-fg-muted">{{ $t('owner.centers.periodHint') }}</p>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('owner.centers.from')" :error="errors.activeFrom" optional>
        <AppDatePicker :id="field.id" v-model="activeFrom" :max="activeUntil || undefined" />
      </FormField>
      <FormField v-slot="field" :label="$t('owner.centers.until')" :error="errors.activeUntil" optional>
        <AppDatePicker :id="field.id" v-model="activeUntil" :min="activeFrom || undefined" />
      </FormField>
    </div>
  </FormModal>
</template>
