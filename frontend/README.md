# XN CRM — Frontend (Phase 1–3, production-ready)

Vue 3 SPA for the XN CRM backend (`../` — NestJS, `/api/v1`). Principle: **UX first, architecture second, visual design third** — staff should need almost no training.

## Stack

Vue 3 (`<script setup>`, TypeScript strict) · Vite · Vue Router · Pinia · TanStack Query · Axios · VueUse · VeeValidate + Zod · vue-i18n · Tailwind CSS 4 · Lucide · Vitest · Playwright.

## Ishga tushirish

```bash
npm install                 # .env.development tayyor: /api → http://localhost:3000
npm run dev                 # http://localhost:5173 — backend: http://localhost:3000 (../ da npm run start:dev)
```

| Buyruq              | Vazifasi                                                                  |
| ------------------- | ------------------------------------------------------------------------- |
| `npm run dev`       | Dev server (HMR, `/api` → backend proxy)                                   |
| `npm run build`     | Typecheck (`vue-tsc`) + production build (`dist/`, `.env.production`)      |
| `npm run build:staging` | Staging build (`.env.staging`)                                         |
| `npm run typecheck` | Faqat TypeScript                                                           |
| `npm run lint`      | ESLint (`any`, `console`, `v-html` taqiqlangan)                            |
| `npm test`          | Unit: rang/brand, API client + token refresh, tarjimalar (kalit/placeholder/kod ichidagi har `t()` kaliti), validatsiya, formatlar |
| `npm run api:types` | `openapi.json` → `src/services/api/schema.gen.ts` (backend tiplari). Avval backend'da `npm run openapi:export` |
| `npm run test:e2e`  | Brauzer testlari: smoke + kunlik ish oqimlari (`e2e/crm.spec.ts`) (o‘z API va Vite instance'ini 3100/5174 da ko‘taradi; dev Postgres ishlab turishi kerak, backend `npm run build` qilingan bo‘lishi kerak) |

## Arxitektura

```
src/
├── app/            router (routes, guards), providers (http, query client), config (app, navigation, permissions)
├── components/
│   ├── ui/         design system: Button, Input, Select, Textarea, Checkbox, Switch, Badge, Avatar, Dropdown,
│   │               Modal, Drawer, Tooltip, Tabs, Table, Pagination, DatePicker, SearchInput, GlassPanel, Card…
│   ├── layout/     AppShell, Sidebar, Header, MobileTabBar, NavDrawer, context switchers, UserMenu, PageHeader
│   ├── forms/      FormField (label/hint/error + aria), FormError
│   └── feedback/   Loading/Empty/Error/QueryState, ConfirmDialog, ToastHost, ComingSoon
├── components/data/ DataTable (sort, skeleton, row link, mobil kartalar), ListToolbar (qidiruv + filtrlar; mobil'da drawer),
│                   ListPage, StatusBadge, DetailHeader, InfoList, SectionCard, CapacityBar
├── components/forms/ FormModal (mobil'da to‘liq ekran), EntityPicker (async combobox), MoneyInput
├── features/<x>/   api.ts (endpointlar) · queries.ts (TanStack hook'lar) · components/ · views/
│                   dashboard, families, students, enrollments, courses, groups, teachers, rooms, schedule,
│                   attendance, finance, leads, hr, tasks, notifications, search, settings, audit
├── services/api/   Axios instance, ApiError, envelope unwrap, 401 → refresh → retry, schema.gen.ts (OpenAPI'dan)
├── services/query/ useApiQuery / useApiMutation (tenant kalitda), useListState (filtrlar URL'da)
├── stores/         auth (tokenlar, profil), session (tashkilot/filial/permission), preferences, toast
├── composables/    useBrand, useTheme, usePermission, useNavigation, useContextSwitch, useFormatters, useConfirm…
├── i18n/           locales/ (umumiy) + messages/<feature>.ts (uch til yonma-yon, `defineMessages` kalitlar mosligini majburlaydi);
│                   faqat `uz` asosiy bundle'da, ru/en birinchi tanlanganda yuklanadi
├── lib/            color (OKLCH palitra, WCAG kontrast), brand, single-flight
├── types/          API va domen tiplari
└── styles/         design tokenlar (light/dark), glass utility'lar
```

**Kirish oqimi:** `/login` → (bir nechta bo‘lsa) tashkilot tanlash → (bir nechta bo‘lsa) filial tanlash yoki «Barcha filiallar» → CRM. Bitta tashkilot/filial bo‘lsa, savol berilmaydi. Keyin header'dan (mobil'da — sarlavhaga bosib) almashtiriladi.

**API client:** har so‘rov `{ success, data }` dan ochiladi; xato — `ApiError { status, code, message, details, requestId }`. `X-Organization-Id` / `X-Branch-Id` avtomatik. 401 → bitta umumiy refresh (single-flight) → asl so‘rov qayta yuboriladi; refresh ishlamasa — login (`?expired=1`).

**Tokenlar:** access token faqat xotirada; refresh token `localStorage` da (reload'dan keyin sessiya tiklanadi), har refresh'da aylanadi, logout'da serverda bekor qilinadi.

**Server holati:** TanStack Query; kalitlarga tashkilot/filial kiradi. Tashkilot almashsa kesh tozalanadi, filial almashsa qayta so‘raladi. 4xx qayta urinilmaydi.

**RBAC UI:** menyu, tugma va route'lar `GET /organizations/:id/context` dagi permission'larga qarab ko‘rsatiladi/yashiriladi (`usePermission().can(P.X)`, route `meta.permission`). Bu faqat UI — xavfsizlik manbai backend.

**Brending:** tashkilotning `primaryColor` idan butun 50–950 palitra (OKLCH) hisoblanib CSS o‘zgaruvchilarga yoziladi; ustidagi matn rangi WCAG kontrastiga qarab tanlanadi. Komponentlarda xom rang yo‘q — faqat token'lar (`bg-primary`, `text-fg`, `border-border`…). Logo, favicon va tab sarlavhasi ham tashkilotdan. Default rang (`#4F46E5`) faqat `app.config.ts` da.

**Mavzu:** Light / Dark / System (qurilmada saqlanadi); dark — alohida token to‘plami, invert emas. Glass faqat "suzuvchi" elementlarda (sidebar, header) va overlay'larda (menyu, modal, drawer — deyarli shaffof emas, matn aralashmaydi); kontent — to‘liq fonli kartalarda.

**Til:** foydalanuvchi tanlovi → tashkilot tili → brauzer tili → `uz`. Reload'siz almashadi, `<html lang>` yangilanadi. Kalitlar va `{placeholder}` lar uch tilda testda solishtiriladi, har bir xabar vue-i18n bilan kompilyatsiya qilinadi (`@`, `|` kabi belgilar sahifani buzmasligi uchun).

**Responsive:** mobile-first. Telefon: ixcham header, pastki tab bar (4 asosiy bo‘lim + «Yana»), drawer menyu, 44px touch target'lar, jadvallar kartaga aylanadi, safe-area inset'lar. `lg` dan: suzuvchi glass sidebar (yig‘iladi) + header.

**Accessibility:** semantik landmark'lar (bitta `banner`, `navigation`, `main` + «skip to content»), native `<dialog>` (focus trap, Esc, inert fon), menyularda klaviatura (↑/↓/Home/End/Esc), `aria-current`, `aria-invalid` + `aria-describedby` formalarda, `prefers-reduced-motion`, ko‘rinadigan focus ring.

**Ma'lumot oqimi:** `View → queries.ts (useApiQuery/useApiMutation) → api.ts → Axios → NestJS`. Komponent ichida to‘g‘ridan-to‘g‘ri so‘rov yo‘q. Server holati — faqat TanStack Query; Pinia — faqat global client holati (sessiya, sozlamalar, toast).

**Tiplar:** DTO tiplari backend OpenAPI hujjatidan generatsiya qilinadi (`schema.gen.ts`) — qo‘lda yozilmaydi, backend o‘zgarsa `api:types` ularni yangilaydi.

**Ro‘yxatlar:** qidiruv (debounce), filtr, saralash va sahifa URL'da (`useListState`) — orqaga qaytganda va havola ulashilganda aynan shu ko‘rinish tiklanadi. Desktop — jadval (sticky header, saralanadigan ustunlar, skeleton), telefon — ixcham kartalar; filtrlar telefonda drawer'da.

**Formalar:** VeeValidate + Zod (`useEntityForm`). Zod xabarlari joriy tilda (`lib/validation.ts`); telefon `90 123 45 67` → `+998901234567`. Backend xatolari: ma'lum kod tegishli maydon ostida (masalan `ROOM_SCHEDULE_CONFLICT` → «Bu vaqtda xona band»), 422 tafsilotlari maydonlarga, qolgani forma tepasida — barcha backend kodlari 3 tilda tarjima qilingan. To‘lov `transactionId` bilan yuboriladi (ikki marta bosish — ikki marta to‘lov emas).

**Optimistic UI:** faqat xavfsiz joylarda — bildirishnomani o‘qilgan qilish, bildirishnoma sozlamalari (xatoda qaytariladi). To‘lov, yozilish, qaytarish, status o‘zgarishlari server javobini kutadi, keyin tegishli ro‘yxatlar yangilanadi.

**Global qidiruv:** `Ctrl/⌘ K` yoki `/` — o‘quvchi, oila, guruh, lid, xodim, vazifa (faqat ruxsat berilgan bo‘limlar, parallel). Yangi bo‘lim — `features/search/providers.ts` ga bitta yozuv.

## Production (Phase 3)

**Muhitlar.** `.env.development` / `.env.staging` / `.env.production` (`vite --mode`). Ularda faqat **ochiq** `VITE_*` qiymatlar (bundle ichiga tushadi) — sir saqlanmaydi. `VITE_APP_ENV`, `VITE_API_BASE_URL` (default `/api/v1`, bir xil origin), `VITE_ERROR_REPORTING_URL` (ixtiyoriy). Lokal o‘zgartirish — `.env.*.local` (git'ga kirmaydi).

**Deploy.** `frontend/Dockerfile` → nginx (root bo‘lmagan, 8080): SPA fallback, `/assets/*` 1 yil `immutable`, `index.html` `no-cache` (yangi reliz darhol), gzip, xavfsizlik header'lari (CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`), `/api` → `api:3000` proxy (bir origin: CORS yo‘q), `/healthz`. Source map'lar build qilinadi, lekin bundle'dan bog‘lanmaydi va serve qilinmaydi. HTTPS/HSTS — oldidagi TLS proxy'da (Caddy/Traefik). Ildizdagi `docker-compose.prod.yml` da `web` servisi. `robots.txt` va `noindex` — CRM ochiq indekslanmaydi.

**Monitoring.** `services/monitoring` — kutilmagan xatolar (Vue, `window.onerror`, unhandled rejection) `VITE_ERROR_REPORTING_URL` ga JSON bo‘lib yuboriladi (`sendBeacon`): xabar, stack, route **pattern** (`/students/:id` — id/query/shaxsiy ma'lumotsiz), release, muhit. API xatolari yuborilmaydi (ular kutilgan holat, UI tushuntiradi). URL bo‘lmasa — o‘chiq.

**Xatolar (markaziy).** `errorMessage(code, status)`: avval backend kodi (barcha kodlar 3 tilda), bo‘lmasa HTTP status (400/401/403/404/409/422/429/500/503), bo‘lmasa umumiy jumla — hech qachon `undefined`/`Error`/server matni emas. Sahifa xatolari — `ErrorState` (network, 401, 403 sababi bilan, 404, 429, 5xx + so‘rov raqami). Forma xatolari — maydon ostida.

**Offline.** Banner + yozish so‘rovlari darhol rad etiladi (navbatga qo‘yilmaydi — to‘lov keyinroq, bilmasdan yuborilmaydi); aloqa tiklanganda eskirgan ma'lumotlar o‘zi yangilanadi.

**Auth.** Access token — xotirada; refresh token — `localStorage`, har refresh'da aylanadi. Bir nechta tab: refresh **Web Locks** bilan ketma-ket (bir xil token ikki marta ishlatilib, server hamma joydan chiqarib yubormasligi uchun), bir tabda chiqish — boshqalarida ham chiqish, bir tabda kirish — login sahifasidagi boshqa tab davom etadi. 401 → bitta refresh → so‘rov qayta; refresh muvaffaqiyatsiz — sessiya tozalanadi, `/login`. Ro‘yxatdan o‘tish — `/register`.

**Moliyaviy xavfsizlik.** To‘lov, qaytarish va kassani yopish — ikki bosqich: kiritish → tekshirish (summa katta, valyuta, hisob, usul, keyin qoladigan qarz) → tasdiqlash. To‘lov idempotent (`transactionId`). Hisobni bekor qilish, o‘quvchi holati, xodimni bo‘shatish — alohida tasdiqlash oynasi (fokus «Bekor qilish» da).

**Formalar.** Tahrirlangan formani yopishda (X, Esc, fon, «Bekor qilish») — «Saqlanmagan o‘zgarishlar bor» so‘raladi; saqlash vaqtida tugma «Saqlanmoqda…» va qayta bosilmaydi.

**Server holati (TanStack Query).** Kalit: `[feature, …params, {organizationId, branchId}]` (tenant avtomatik). `staleTime` default 30 s, `gcTime` 5 min; ma'lumotnomalar (kurs, xona, o‘qituvchi, lavozim ro‘yxatlari) 1–5 min; dashboard 1 min. Mutatsiyadan keyin faqat tegishli prefikslar yangilanadi (`invalidates`, masalan pul uchun `MONEY_KEYS`); tashkilot almashsa kesh to‘liq tozalanadi, filial almashsa tenant kaliti boshqa bo‘ladi — eski filial ma'lumoti ko‘rinmaydi. Bildirishnomalar — `NotificationChannel` (hozir polling, ko‘rinmas tabda to‘xtaydi; WebSocket/SSE — shu interfeysning yangi implementatsiyasi).

**Xavfsizlik ko‘rigi.** Kodda va bundle'da sir yo‘q; `npm audit` — 0; `v-html`/`innerHTML`/`eval` yo‘q (Vue escape qiladi); storage'da faqat refresh token, tanlangan tashkilot/filial id, UI sozlamalari; qidiruv tarixi — `sessionStorage` (tab yopilganda o‘chadi, chiqishda tozalanadi). Ruxsatlar UI'da faqat yashirish — avtorizatsiya har doim backend'da.

**Testlar.** Unit (Vitest): API client/refresh, rang/brand, validatsiya, formatlar, tarjimalar (kalitlar mosligi, kodda ishlatilgan har kalit, shablonlarda qattiq yozilgan matn yo‘qligi). E2E (Playwright, desktop + mobil): smoke, kunlik ish oqimlari, rollar (CEO/menejer/kassir/o‘qituvchi), CRUD, to‘lov/qaytarish, bir nechta tab, saqlanmagan forma, offline, 404/403, telefonda gorizontal siljish yo‘qligi.

## Boshqaruv ierarxiyasi (Owner → Center → Sub-Center → Branch)

- **Owner paneli** — `/owner/*`, alohida layout ([features/owner/OwnerShell.vue](src/features/owner/OwnerShell.vue)), XN CRM'ning o‘z brendi, markaz/filial konteksti yo‘q. Menyu: Bosh sahifa, Markazlar, Direktorlar, Umumiy tahlil, Platforma (boshqaruv tarixi), Profil. So‘rovlar `useAccountQuery` orqali (markaz tanlanmagan bo‘lsa ham ishlaydi, kesh user bo‘yicha) va `skipTenant`.
- **Feature'lar:** `owner/` (shell, dashboard, platforma), `centers/` (ro‘yxat, yaratish wizard'i: Markaz → Brend → Direktor → Faollik → Tekshirish → muvaffaqiyat + kirish ma'lumotlari, markaz sahifasi: tahrir, muzlatish/faollashtirish/arxiv, direktorlar, tahlil, tarix), `directors/` (ro‘yxat, yaratish, modul bo‘yicha ruxsatlar, parolni tiklash, to‘xtatish), `analytics/` (global va markaz tahlili, umumiy `MetricsComparison`), `center/`, `sub-centers/`, `branches/`, `staff/` (xodimlar va rollar — Sozlamalar ichida), `profile/` (ism, login, parol, qurilmalar).
- **Router:** `meta.platform` — faqat `platformRole = OWNER`; markazi yo‘q owner `/` dan `/owner` ga o‘tadi. `mustChangePassword` → avval `/change-password` (`stage: 'account'`). Faqat `availability = ACTIVE` markazlar avtomatik tanlanadi va almashtirgichda chiqadi; boshqalari tanlash sahifasida holati bilan ko‘rinadi.
- **Muzlatilgan markaz:** login sahifasi va har so‘rov serverdan kelgan sababni ko‘rsatadi ("Ushbu markaz vaqtincha muzlatilgan. Administrator bilan bog‘laning."). Ish vaqtida markaz muzlatilsa, HTTP qatlami (`onAccessBlocked`) foydalanuvchini markaz tanlash sahifasiga sababi bilan o‘tkazadi; `PASSWORD_CHANGE_REQUIRED` → parol sahifasi.
- **Vaqtinchalik parol** faqat yaratish/tiklash javobida bir marta ko‘rsatiladi ([CredentialsCard](src/features/shared/CredentialsCard.vue)), hech qayerda saqlanmaydi.
- **Navigatsiya role-aware:** Director uchun "Boshqaruv" bo‘limi (Markaz, Sub-markazlar, Filiallar) va "Tahlil"; staff'ga faqat ruxsatlari ochgan bandlar ko‘rinadi. Bosh sahifada director uchun sub-markaz/filial taqqoslamasi.
- **E2E:** [e2e/management.spec.ts](e2e/management.spec.ts) — wizard, muzlatish/faollashtirish, direktorning birinchi kirishi, sub-markaz va filial, xodim qo‘shish, owner paneli yopiqligi, mobil ko‘rinish.

## Phase 2 modullari

| Bo‘lim | Route | Asosiy imkoniyatlar |
| --- | --- | --- |
| Dashboard | `/` | «Bugun» (tushum, davomat, qo‘ng‘iroqlar, vazifalarim) + bo‘limlar (o‘quvchilar, moliya, guruhlar/bo‘sh o‘rinlar, lidlar, vazifalar, oilalar) |
| Oilalar | `/families`, `/families/:id` | ro‘yxat, yaratish/tahrirlash, faolsizlantirish; o‘quvchilar, moliya, faoliyat (audit) |
| O‘quvchilar | `/students`, `/students/:id` | yangi oila bilan bir qadamda yaratish; holat (muzlatish/bitirgan/ketgan — o‘chirilmaydi); guruh tarixi, davomat, moliya |
| Yozilish | dialoglar | guruhga yozish (bo‘sh o‘rinlar, to‘lgan guruh tanlanmaydi), ko‘chirish, guruhdan chiqarish |
| Kurslar | `/courses`, `/courses/:id` | kurs → daraja ierarxiyasi, tartiblash, faollashtirish |
| Guruhlar | `/groups`, `/groups/:id` | sig‘im paneli, o‘qituvchi/xona, haftalik jadval, davomat statistikasi, tarix, pauza/yakunlash/bekor qilish |
| O‘qituvchilar, Xonalar | `/teachers`, `/rooms` | CRM hisobini bog‘lash, guruhlari, haftalik jadvali, oylik davomat |
| Dars jadvali | `/schedule` | hafta/kun, o‘qituvchi/xona/guruh filtrlari; telefon — kunlik ro‘yxat |
| Davomat | `/attendance` | bugungi darslar → bir bosish → saqlash (bulk API), «Hamma keldi», saqlanmagan o‘zgarish himoyasi |
| Moliya | `/finance/*` | umumiy, hisob-fakturalar, to‘lovlar, qarzdorlar (oila bo‘yicha), kassa (ochish → kutilgan qoldiq → yopish → farq), xarajatlar, qaytarishlar |
| Lidlar | `/leads`, `/leads/:id` | jadval + voronka (drag-and-drop va klaviatura), qo‘ng‘iroqlar (bugun/kechikkan), faoliyat, o‘quvchiga aylantirish |
| Xodimlar | `/hr/*` | xodimlar, lavozimlar, bo‘limlar, filiallar, vazifalar statistikasi |
| Vazifalar | `/tasks`, `/tasks/:id` | mening/barcha/kechikkan/bajarilgan, bir bosishda bajarish, izohlar, tarix |
| Bildirishnomalar | `/notifications` | o‘qilmagan/barchasi, tegishli yozuvga o‘tish, sozlamalar (kanallar) |

Hisobotlar (`/reports`) — keyingi bosqich.

## Yangi feature qo‘shish

1. `features/<name>/api.ts` — endpointlar (`schema.gen.ts` tiplari bilan); `queries.ts` — `useApiQuery({ key: ['<name>', …] })` (tenant avtomatik qo‘shiladi), yozish — `useApiMutation({ invalidates })`.
2. Ro‘yxat: `PageHeader` + `ListToolbar` + `ListPage` + `DataTable` (+ `useListState`). Yozuv: `DetailHeader` + `SectionCard`/`InfoList`. Forma: `FormModal` + `useEntityForm`.
3. `app/router/routes.ts` — route (`meta.titleKey`, `meta.permission`); menyu — `app/config/navigation.ts` (bo‘lim bilan).
4. Matnlar: `i18n/messages/<name>.ts` (`defineMessages({ en, uz, ru })`) va `locales/*.ts` ga ulash. `npm test` kodda ishlatilgan, lekin tarjimasi yo‘q kalitni ko‘rsatadi.
