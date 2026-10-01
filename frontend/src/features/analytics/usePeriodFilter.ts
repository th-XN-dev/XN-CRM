import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormatters } from '@/composables/useFormatters';
import { addDays, orgDay } from '@/lib/dates';
import { useListState } from '@/services/query/useListState';

export const ANALYTICS_PERIODS = ['week', 'month', 'quarter', 'year', 'custom'] as const;

/**
 * Period (+ any extra filters) for analytics screens, kept in the URL.
 * "Custom" starts as the last 30 days so the screen is never empty.
 */
export function usePeriodFilter<T extends Record<string, string>>(extra: T, timeZone?: () => string | undefined) {
  const { t } = useI18n();
  const format = useFormatters();
  const list = useListState({ period: 'month', from: '', to: '', ...extra });

  const periods = computed(() => ANALYTICS_PERIODS.map((key) => ({ key, label: t(`dashboard.period.${key}`) })));
  const periodModel = computed({
    get: () => list.state.period,
    set: (value: string) => {
      const today = orgDay(timeZone?.());
      const next =
        value === 'custom'
          ? { period: value, from: list.state.from || addDays(today, -29), to: list.state.to || today }
          : { period: value, from: '', to: '' };
      list.set(next as Parameters<typeof list.set>[0]);
    },
  });
  const label = computed(() =>
    list.state.period === 'custom' && list.state.from && list.state.to
      ? `${format.dayShort(list.state.from)} — ${format.dayShort(list.state.to)}`
      : t(`dashboard.period.${list.state.period}`).toLowerCase(),
  );
  /** What the API takes: a named period, or `from`/`to` for a custom one. */
  const params = computed(() =>
    list.state.period === 'custom' ? { from: list.state.from || undefined, to: list.state.to || undefined } : { period: list.state.period },
  );
  return { list, periods, periodModel, label, params };
}

export type PeriodFilter = ReturnType<typeof usePeriodFilter>;
