<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { appConfig } from '@/app/config/app.config';
import { P } from '@/app/config/permissions';
import FormError from '@/components/forms/FormError.vue';
import FormField from '@/components/forms/FormField.vue';
import AppAlert from '@/components/ui/AppAlert.vue';
import AppBadge from '@/components/ui/AppBadge.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import BrandLogo from '@/components/ui/BrandLogo.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { organizationsApi } from '@/features/organizations/api';
import { applyBrand, needsContrastFallback } from '@/lib/brand';
import { isHexColor, normalizeHex } from '@/lib/color';
import { isApiError } from '@/services/api/api-error';
import { useSessionStore } from '@/stores/session.store';
import { useToastStore } from '@/stores/toast.store';
import SettingsPanel from './SettingsPanel.vue';

const { t } = useI18n();
const session = useSessionStore();
const toast = useToastStore();
const canEdit = computed(() => session.can(P.ORGANIZATION_UPDATE));
const formError = ref<string | null>(null);

const optionalUrl = () =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), t('validation.url'));
const schema = computed(() =>
  toTypedSchema(
    z.object({
      primaryColor: z.string().trim().refine(isHexColor, t('validation.hexColor')),
      secondaryColor: z
        .string()
        .trim()
        .refine((v) => v === '' || isHexColor(v), t('validation.hexColor')),
      logoUrl: optionalUrl(),
      faviconUrl: optionalUrl(),
    }),
  ),
);
const { defineField, handleSubmit, errors, isSubmitting, values, resetForm, setErrors } = useForm({
  validationSchema: schema,
  initialValues: {
    primaryColor: session.organization?.primaryColor ?? appConfig.defaultBrandColor,
    secondaryColor: session.organization?.secondaryColor ?? '',
    logoUrl: session.organization?.logoUrl ?? '',
    faviconUrl: session.organization?.faviconUrl ?? '',
  },
});
const [primaryColor, colorAttrs] = defineField('primaryColor');
const [secondaryColor, secondaryAttrs] = defineField('secondaryColor');
const [logoUrl, logoAttrs] = defineField('logoUrl');
const [faviconUrl, faviconAttrs] = defineField('faviconUrl');

// Live preview: the whole UI takes the color while editing; leaving without saving restores it.
watch(
  () => [values.primaryColor, values.secondaryColor] as const,
  ([color, secondary]) => {
    if (color && isHexColor(color)) applyBrand(document.documentElement, color, appConfig.defaultBrandColor, secondary || null);
  },
);
onBeforeUnmount(() =>
  applyBrand(
    document.documentElement,
    session.organization?.primaryColor ?? appConfig.defaultBrandColor,
    appConfig.defaultBrandColor,
    session.organization?.secondaryColor,
  ),
);
const paleColor = computed(() => needsContrastFallback(values.primaryColor ?? ''));

const colorPicker = computed({
  get: () => (isHexColor(primaryColor.value ?? '') ? normalizeHex(primaryColor.value ?? '') : appConfig.defaultBrandColor),
  set: (value: string) => (primaryColor.value = value.toUpperCase()),
});

const submit = handleSubmit(async (form) => {
  const organizationId = session.organizationId;
  if (!organizationId) return;
  formError.value = null;
  try {
    await organizationsApi.update(organizationId, {
      primaryColor: normalizeHex(form.primaryColor),
      // An emptied field is cleared on the server (null), not silently kept.
      secondaryColor: form.secondaryColor ? normalizeHex(form.secondaryColor) : null,
      logoUrl: form.logoUrl || null,
      faviconUrl: form.faviconUrl || null,
    });
    await session.reloadContext();
    resetForm({ values: form });
    toast.success(t('settings.brand.saved'));
  } catch (error) {
    if (isApiError(error) && error.isValidation) {
      setErrors(Object.fromEntries(Object.keys(error.fieldErrors).map((field) => [field, t('validation.invalid')])));
    }
    formError.value = apiErrorMessage(error);
  }
});
</script>

<template>
  <SettingsPanel :title="$t('settings.brand.title')" :description="$t('settings.brand.text')">
    <AppAlert v-if="!canEdit" class="mb-4">{{ $t('settings.brand.readOnly') }}</AppAlert>
    <form class="grid gap-6 lg:grid-cols-[1fr_16rem]" novalidate @submit="submit">
      <fieldset class="flex flex-col gap-4" :disabled="!canEdit">
        <FormField v-slot="field" :label="$t('settings.brand.primaryColor')" :hint="$t('settings.brand.primaryColorHint')" :error="errors.primaryColor">
          <div class="flex items-center gap-3">
            <input
              v-model="colorPicker"
              type="color"
              class="size-11 shrink-0 cursor-pointer rounded-xl border border-border-strong bg-surface p-1"
              :aria-label="$t('settings.brand.pickColor')"
            />
            <div class="min-w-0 flex-1">
            <AppInput
              :id="field.id"
              v-model="primaryColor"
              v-bind="colorAttrs"
              placeholder="#4F46E5"
              maxlength="7"
              autocapitalize="characters"
              spellcheck="false"
              :invalid="field.invalid"
              :described-by="field.describedBy"
            />
            </div>
          </div>
        </FormField>
        <AppAlert v-if="paleColor" tone="warning">{{ $t('settings.brand.paleColor') }}</AppAlert>
        <FormField v-slot="field" :label="$t('settings.brand.secondaryColor')" :hint="$t('settings.brand.secondaryHint')" optional :error="errors.secondaryColor">
          <AppInput :id="field.id" v-model="secondaryColor" v-bind="secondaryAttrs" placeholder="#0EA5E9" maxlength="7" autocapitalize="characters" spellcheck="false" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormField v-slot="field" :label="$t('settings.brand.logoUrl')" optional :error="errors.logoUrl">
          <AppInput :id="field.id" v-model="logoUrl" v-bind="logoAttrs" type="url" inputmode="url" placeholder="https://…" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormField v-slot="field" :label="$t('settings.brand.faviconUrl')" optional :error="errors.faviconUrl">
          <AppInput :id="field.id" v-model="faviconUrl" v-bind="faviconAttrs" type="url" inputmode="url" placeholder="https://…" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormError :message="formError" />
        <div v-if="canEdit"><AppButton type="submit" :loading="isSubmitting">{{ $t('common.save') }}</AppButton></div>
      </fieldset>

      <section :aria-label="$t('settings.brand.preview')" class="flex flex-col gap-4 rounded-2xl border border-border bg-surface-muted p-4">
        <p class="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{{ $t('settings.brand.preview') }}</p>
        <div class="flex items-center gap-3">
          <BrandLogo :name="session.organization?.name ?? ''" :logo-url="logoUrl || null" />
          <span class="truncate font-semibold text-fg">{{ session.organization?.name }}</span>
        </div>
        <AppButton type="button" tabindex="-1">{{ $t('settings.brand.previewButton') }}</AppButton>
        <div class="flex items-center gap-3">
          <AppBadge tone="brand" dot>{{ $t('settings.brand.previewBadge') }}</AppBadge>
          <span class="text-sm font-medium text-primary-text underline">{{ $t('settings.brand.previewLink') }}</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
          <div class="h-full w-2/3 rounded-full bg-primary" />
        </div>
      </section>
    </form>
  </SettingsPanel>
</template>
