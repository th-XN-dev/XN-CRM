import { watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { appConfig } from '@/app/config/app.config';
import { applyBrand } from '@/lib/brand';
import { useSessionStore } from '@/stores/session.store';

const DEFAULT_FAVICON = '/favicon.svg';

/**
 * Applies the current organization's branding to the whole document: accent
 * palette (CSS variables), tab title and favicon. Called once in App.vue.
 */
export function useBrand(): void {
  const session = useSessionStore();
  const route = useRoute();
  const { t } = useI18n();
  // The owner's area is XN CRM's own, never a center's brand.
  const brandOf = () => (route.matched.some((record) => record.meta.platform) ? null : session.organization);

  watchEffect(() => {
    applyBrand(
      document.documentElement,
      brandOf()?.primaryColor ?? appConfig.defaultBrandColor,
      appConfig.defaultBrandColor,
      brandOf()?.secondaryColor,
    );
  });

  watchEffect(() => {
    const titleKey = route.meta.titleKey;
    const page = titleKey ? t(titleKey) : null;
    const org = brandOf()?.name ?? appConfig.name;
    document.title = page ? `${page} · ${org}` : org;
  });

  watchEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.append(link);
    }
    link.href = brandOf()?.faviconUrl ?? DEFAULT_FAVICON;
  });
}
