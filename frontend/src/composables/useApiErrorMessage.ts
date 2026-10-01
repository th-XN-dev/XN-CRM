import { errorMessage } from '@/i18n';
import { isApiError } from '@/services/api/api-error';

/** A translated, human message for any thrown value. */
export function apiErrorMessage(error: unknown): string {
  return isApiError(error) ? errorMessage(error.code, error.status) : errorMessage(undefined);
}
