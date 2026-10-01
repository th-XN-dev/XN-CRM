import { VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { appConfig } from './app/config/app.config';
import { setupHttp } from './app/providers/http';
import { queryClient } from './app/providers/query-client';
import { router } from './app/router';
import { i18n, setLocale } from './i18n';
import { applyBrand } from './lib/brand';
import { installValidationMessages } from './lib/validation';
import { installMonitoring } from './services/monitoring';
import { usePreferencesStore } from './stores/preferences.store';
import './styles/main.css';

// Default accent before any organization is known (avoids a colorless first paint).
applyBrand(document.documentElement, appConfig.defaultBrandColor, appConfig.defaultBrandColor);

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(i18n);
// The chosen language is loaded before the first paint (no flash of another language).
await setLocale(usePreferencesStore(pinia).resolveLocale());
installValidationMessages();
setupHttp(router);
app.use(VueQueryPlugin, { queryClient });
app.use(router);
installMonitoring(app, router);
app.mount('#app');
