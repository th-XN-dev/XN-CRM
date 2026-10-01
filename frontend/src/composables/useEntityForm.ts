import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { ref } from 'vue';
import type { z } from 'zod';
import { i18n } from '@/i18n';
import { isApiError } from '@/services/api/api-error';
import { apiErrorMessage } from './useApiErrorMessage';

/**
 * Maps a failed request onto the form: a known conflict code goes to its field
 * ("Code already taken" under Code), 422 details mark the named fields, the
 * rest becomes the form-level message. Returns that message (or null).
 */
export function applyServerError(
  error: unknown,
  setFieldError: (field: string, message: string) => void,
  fieldCodes: Record<string, string> = {},
): string | null {
  if (isApiError(error)) {
    const field = fieldCodes[error.code];
    if (field) {
      setFieldError(field, apiErrorMessage(error));
      return null;
    }
    const fields = Object.keys(error.fieldErrors);
    if (error.isValidation && fields.length > 0) {
      for (const name of fields) setFieldError(name, i18n.global.t('validation.invalid'));
      return i18n.global.t('errors.VALIDATION_ERROR');
    }
  }
  return apiErrorMessage(error);
}

interface EntityFormOptions<TSchema extends z.ZodTypeAny> {
  schema: TSchema;
  initialValues: () => z.input<TSchema>;
  submit: (values: z.output<TSchema>) => Promise<unknown>;
  /** Backend error code → field it belongs to. */
  fieldCodes?: Record<string, string>;
}

/**
 * vee-validate + Zod for create/edit dialogs: typed fields, field-level and
 * server errors, and `reset()` to start clean each time the dialog opens.
 */
export function useEntityForm<TSchema extends z.ZodTypeAny>(options: EntityFormOptions<TSchema>) {
  // No casting: vee-validate would otherwise replace the initial values with the schema's
  // *output* (amount "450000" → 450000, "" → undefined) and break the inputs bound to them.
  // Fields hold what the user typed; the transformed output is only what gets submitted.
  const typed = toTypedSchema(options.schema);
  const form = useForm({
    validationSchema: { ...typed, cast: undefined },
    initialValues: options.initialValues(),
  });
  const formError = ref<string | null>(null);

  const onSubmit = form.handleSubmit(async (values) => {
    formError.value = null;
    try {
      await options.submit(values as z.output<TSchema>);
    } catch (error) {
      formError.value = applyServerError(
        error,
        (field, message) => form.setFieldError(field as never, message),
        options.fieldCodes,
      );
    }
  });

  function reset(): void {
    formError.value = null;
    form.resetForm({ values: options.initialValues() });
  }

  return { ...form, formError, onSubmit, reset };
}
