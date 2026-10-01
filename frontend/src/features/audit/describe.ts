import { useI18n } from 'vue-i18n';

/** Audit action → sentence after the actor's name; unknown codes → a verb by suffix, never the raw code. */
export function useDescribeAction() {
  const { t, te } = useI18n();
  return (action: string): string => {
    if (te(`activity.actions.${action}`)) return t(`activity.actions.${action}`);
    if (/(^|_)CREATE(D)?$/.test(action)) return t('activity.generic.CREATED');
    if (/(^|_)(UPDATE|UPDATED)$/.test(action)) return t('activity.generic.UPDATED');
    if (/(^|_)(DELETE|DELETED)$/.test(action)) return t('activity.generic.DELETED');
    return t('activity.generic.CHANGED');
  };
}
