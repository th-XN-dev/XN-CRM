# XN CRM — Backend V1.0

Ko‘p tashkilotli (multi-tenant) ta'lim markazlari CRM'i uchun backend: o‘quvchilar va oilalar, kurslar/guruhlar/dars jadvali, davomat, moliya (invoice, to‘lov, qarz, kassa, xarajat), leadlar (CRM voronka), HR va vazifalar, bildirishnomalar, hisobotlar, dashboard va audit. Frontend (Vue 3) — [frontend/](frontend/README.md).

## Tech stack

| Qatlam        | Texnologiya                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| Runtime / API | Node.js 22, NestJS 11 (Express 5), TypeScript (strict)                         |
| Ma'lumotlar   | PostgreSQL 17, Prisma 6 (migratsiyalar + qo‘lda yozilgan CHECK/trigger/indeks) |
| Navbat        | Redis 7 + BullMQ (bildirishnomalar yetkazish; dev/test'da in-process navbat)   |
| Auth          | JWT (15 daqiqalik access + rotatsiya qilinadigan refresh), Argon2id            |
| Kuzatuv       | pino (structured JSON log), X-Request-ID, `/health`                            |
| Hujjat / test | Swagger (OpenAPI), Jest (unit), supertest + haqiqiy PostgreSQL (e2e)           |

## Papkalar tuzilmasi

```
src/
├── auth/ users/ organizations/ branches/ roles/ permissions/ tenancy/   # kirish, a'zolik, RBAC, tenant konteksti
├── families/ students/ courses/ groups/ enrollments/                    # academic core (levels → courses/)
├── teachers/ rooms/ schedules/ attendance/                              # o‘qitish
├── finance/        # invoices/ payments/ (refund) cash-sessions/ expenses/ common/
├── leads/          # leads, lead-sources, lead-pipelines/stages, konversiya
├── hr/             # employees/ positions/ departments/
├── tasks/          # vazifalar, tarix, izohlar, statistika
├── notifications/  # inbox, preferences, templates, policies, delivery (queue + providers), telegram
├── reports/        # finance/ academic/ (students, attendance) crm/ (leads, tasks) — har biri alohida servis
├── dashboard/      # /dashboard/overview — report servislarini birlashtiradi
├── audit/          # AuditLog: event handler + interceptor, faqat o‘qish API
├── health/         # /health (API, DB, Redis)
├── common/         # context (request id), errors, events, filters, interceptors, pagination, utils, validation
├── config/         # env validatsiyasi, logger, throttler
├── database/       # PrismaService, row lock, seed
└── main.ts         # bootstrap + graceful shutdown
frontend/           # Vue 3 SPA (alohida package, frontend/README.md)
prisma/             # schema.prisma + migrations/
test/               # e2e (haqiqiy PostgreSQL) + utils
docs/operations/    # backup.md
scripts/            # backup-postgres.sh, restore-postgres.sh
```

## O‘rnatish (development)

```bash
cp .env.example .env              # secretlarni almashtiring
cp .env.test.example .env.test
npm install
colima start                      # macOS: bepul Docker (pastga qarang)
npm run db:up                     # PostgreSQL (+ xn_crm_test) va Redis
npm run prisma:deploy             # migratsiyalar
npm run db:seed                   # permission katalogi + system role'lar
npm run start:dev                 # http://localhost:3000/api/v1, docs: /api/v1/docs
```

macOS'da bepul Docker — [Colima](https://github.com/abiosoft/colima) (open-source, tijoratda ham bepul): `brew install colima docker docker-compose`, keyin `colima start` (yoki avtomatik: `brew services start colima`).

Docker'siz variant (Homebrew):

```bash
brew install postgresql@17 redis
brew services start postgresql@17 && brew services start redis
psql -d postgres -c "CREATE ROLE xn_crm LOGIN CREATEDB PASSWORD 'xn_crm_dev_password'"
psql -d postgres -c "CREATE DATABASE xn_crm OWNER xn_crm" -c "CREATE DATABASE xn_crm_test OWNER xn_crm"
```

## Environment o‘zgaruvchilari

Ilova ishga tushishda barcha o‘zgaruvchilarni tekshiradi ([env.validation.ts](src/config/env.validation.ts)); noto‘g‘ri yoki yetishmayotgan qiymat bo‘lsa **ishga tushmaydi**. `NODE_ENV=production`da qo‘shimcha: `REDIS_URL` majburiy, `CORS_ORIGIN` da `*` taqiqlangan, JWT secret'lar namunaviy qiymatda bo‘lmasligi kerak.

| O‘zgaruvchi                                                | Majburiy      | Default                      | Izoh                                           |
| ---------------------------------------------------------- | ------------- | ---------------------------- | ---------------------------------------------- |
| `NODE_ENV`                                                 | —             | `development`                | `development` / `production` / `test`          |
| `PORT`                                                     | —             | `3000`                       |                                                |
| `DATABASE_URL`                                             | ✅            | —                            | `postgresql://…`                               |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                  | ✅            | —                            | ≥ 32 belgi, bir-biridan farqli                 |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`          | —             | `15m`, `30d`                 |                                                |
| `CORS_ORIGIN`                                              | ✅            | —                            | vergul bilan ajratilgan aniq origin'lar        |
| `REDIS_URL`                                                | production'da | —                            | berilsa BullMQ navbati, aks holda in-process   |
| `TRUST_PROXY`                                              | —             | —                            | reverse proxy ortida: `1` (haqiqiy client IP)  |
| `LOG_LEVEL`                                                | —             | `info`                       |                                                |
| `THROTTLE_TTL_MS`, `THROTTLE_LIMIT`, `AUTH_THROTTLE_LIMIT` | —             | `60000`, `120`, `10`         | IP bo‘yicha; auth endpointlari uchun qat'iyroq |
| `SHUTDOWN_TIMEOUT_MS`                                      | —             | `15000`                      | graceful shutdown chegarasi                    |
| `NOTIFICATION_*`, `TELEGRAM_*`                             | —             | [.env.example](.env.example) | navbat, retry, scanner, providerlar            |
| `CENTER_CREATION`                                          | —             | `open`                       | `open` — har kim markaz yarata oladi (self-service), `owner` — faqat platforma egasi (`/owner/centers`); production namunasi `owner` |
| `CENTER_URL_TEMPLATE`                                      | —             | —                            | masalan `https://{slug}.xn-crm.uz` — egasiga markaz manzili sifatida ko‘rsatiladi (DNS/SSL alohida) |
| `CENTER_EXPIRY_SCAN_INTERVAL_MS`                           | —             | `3600000`                    | muddati tugagan markazlarni muzlatish sikli; `0` — o‘chiq |

Namunalar: [.env.example](.env.example) (development), [.env.production.example](.env.production.example) (production). Haqiqiy `.env*` fayllar git'ga tushmaydi.

## Database: migratsiya va seed

- `npm run prisma:deploy` (`prisma migrate deploy`) — faqat mavjud migratsiyalarni qo‘llaydi; production'da ham shu. Yangi migratsiya: `npx prisma migrate dev --name <nom>`.
- Prisma ifodalay olmaydigan invariantlar migratsiyalarda qo‘lda yozilgan: CHECK constraint'lar, partial unique indekslar (bitta aktiv enrollment, kassir uchun bitta ochiq smena, bitta primary filial…), `audit_logs` uchun append-only trigger.
- `npm run db:seed` — **faqat** permission katalogi va system role'larni sinxronlaydi (idempotent, test ma'lumoti yo‘q) — production'da ham har deploy'da ishlaydi. Demo/test ma'lumotlari seed'da yo‘q.
- `npm run platform:owner` (prod: `node dist/database/create-owner.js`) — platforma egasini yaratadi yoki mavjud hisobni egaga ko‘taradi. Parol **faqat** `PLATFORM_OWNER_PASSWORD` orqali beriladi (12+ belgi, default yo‘q), birinchi kirishda almashtirish majburiy: `PLATFORM_OWNER_EMAIL=… PLATFORM_OWNER_NAME=… PLATFORM_OWNER_PASSWORD=… npm run platform:owner`.
- `npm run db:seed:demo` — faqat development: Owner → Jony → (Jony Kids English: 2 filial, Jony Math Academy: 1 filial), director, menejer va kassir. `NODE_ENV=production` da ishlamaydi; parol `DEMO_PASSWORD` dan yoki bir martalik tasodifiy (konsolga chiqariladi).

## Development va test

```bash
npm run start:dev     # watch rejimi
npm run lint          # ESLint (0 error)
npx tsc --noEmit      # TypeScript
npm test              # unit: biznes qoidalari, hisob-kitoblar (period, template, sanitizer, env…)
npm run test:e2e      # integration + e2e: haqiqiy PostgreSQL (.env.test), migratsiya + seed avtomatik
```

E2E to‘plami ([test/](test)) har bir modul oqimini, tranzaksiya/konkurrensiya holatlarini (parallel to‘lov, gap-free raqamlash, rollback), **ikki tomonlama tenant isolation** ([tenant-isolation.e2e-spec.ts](test/tenant-isolation.e2e-spec.ts)), to‘liq V1 biznes oqimini ([v1-flow.e2e-spec.ts](test/v1-flow.e2e-spec.ts)), platforma talablarini (health, xato formati, header'lar, Swagger to‘liqligi) va Redis bo‘lsa BullMQ navbatini tekshiradi.

## Docker

- **Development:** [docker-compose.yml](docker-compose.yml) — faqat PostgreSQL + Redis (API lokal ishlaydi).
- **Production:** [docker-compose.prod.yml](docker-compose.prod.yml) — `api` + `postgres` + `redis` + bir martalik `migrate` job. DB va Redis tashqariga ochilmaydi, Redis parol bilan.

## Production

```bash
cp .env.production.example .env.production        # haqiqiy secret'lar bilan to‘ldiring
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

1. `migrate` job `prisma migrate deploy` + RBAC seed'ni bajaradi va tugaydi; `api` faqat u muvaffaqiyatli tugagach ishga tushadi.
2. `api` — non-root user, `init: true` (tini), `HEALTHCHECK` → `/health`. Swagger production'da o‘chirilgan.
3. **Graceful shutdown** (SIGTERM/SIGINT): yangi ulanishlarni qabul qilish to‘xtaydi → faol so‘rovlar va event handler'lar tugaydi → BullMQ/Redis → Prisma yopiladi → exit ([main.ts](src/main.ts)). Navbatdagi delivery'lar DB'da PENDING bo‘lib qoladi va qayta ishga tushganda davom etadi.
4. `web` — frontend (nginx, 8080): SPA + `/api` → `api:3000` proxy, cache va xavfsizlik header'lari ([frontend/README.md](frontend/README.md#production-phase-3)). Tashqariga faqat `web` chiqariladi; oldida TLS proxy (Caddy/Traefik), `TRUST_PROXY=1`.
5. **Backup:** [docs/operations/backup.md](docs/operations/backup.md) — kunlik `pg_dump` (tekshiriladi), 7 kunlik / 4 haftalik / 12 oylik saqlash, tiklash protsedurasi va oylik tiklash mashqi.

**Health:** `GET /health` (prefix'siz) → `healthy` (hammasi ishlaydi), `degraded` (Redis ishlamaydi — API ishlaydi, bildirishnomalar kechikadi), `unhealthy` (DB yo‘q → 503). Faqat `up/down` bayroqlari — host, versiya, xato matni chiqmaydi.

**Log:** har so‘rov uchun bitta JSON qator: `req.id` (= `X-Request-ID`), `method`, `path`, `res.statusCode`, `responseTime`, `userId`, `organizationId`, `branchId`. Authorization, cookie, password, token, secret'lar redaksiya qilinadi. Xato javobi va audit yozuvi shu request id bilan bog‘lanadi.

## API

- **Versiya:** barcha endpointlar `/api/v1/...` ostida (faqat `GET /health` ildizda). V2 yonma-yon qo‘shiladi.
- **Hujjat:** Swagger — `/api/v1/docs` (JSON: `/api/v1/docs-json`), development'da.
- **Muvaffaqiyat:** `{ "success": true, "data": … }`; ro‘yxatlar: `{ "success": true, "data": { "items": [], "meta": { "page", "limit", "total", "totalPages" } } }`, `limit` ≤ 100 (default 20) — kattasi `422`.
- **Xato:** `{ "success": false, "message": "…", "code": "ERROR_CODE" }` (+ validatsiyada `details`). Statuslar: 400 biznes qoidasi, 401, 403 (ruxsat/filial), 404 (boshqa tenant ID'lari ham), 409 konflikt, 422 DTO validatsiyasi, 429 rate limit, 500 (ichki tafsilotsiz — stack faqat log'da), 503 health.
- **Tenant konteksti:** `X-Organization-Id` (yoki URL), ixtiyoriy `X-Branch-Id` — har so‘rovda DB'dan tekshiriladi. Client uchun `GET /organizations/:id/context` — branding, rol, permission'lar va kira oladigan filiallar (UI shunga qarab quriladi; avtorizatsiya baribir har endpointda).
- **Branding:** `Organization.primaryColor` (`#RRGGBB`, default `#4F46E5`), `secondaryColor`, `logoUrl`, `faviconUrl`, `language` (`uz|ru|en`), `timezone`, `currency` — `PATCH /organizations/:id` (`organization.update`); format DB `CHECK` bilan ham kafolatlangan.
- **Hisobot davri:** `?period=today|week|month|quarter|year` (default `month`) yoki `?from=YYYY-MM-DD&to=YYYY-MM-DD`; kunlar tashkilot timezone'ida.

## Xavfsizlik

| Nazorat              | Qanday                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret'lar           | faqat `.env` orqali; `.env*` git/docker-ignore; production'da namunaviy secret bilan ishga tushmaydi                                                           |
| Parol                | Argon2id; hash hech qachon javobda qaytmaydi                                                                                                                   |
| JWT                  | HS256 qat'iy, 15 daqiqa; har so‘rovda user aktivligi DB'dan tekshiriladi                                                                                       |
| Refresh token        | faqat SHA-256 hash saqlanadi, rotatsiya, qayta ishlatilsa butun sessiya bekor, logout'da revoke, muddatli                                                      |
| Rate limiting        | IP bo‘yicha global + `register/login/refresh`, Telegram link-code'ga qat'iy limit (`@StrictThrottle()`; kelajakdagi `forgot-password` ham shu dekorator bilan) |
| CORS / Helmet        | aniq origin'lar, xavfsizlik header'lari, `X-Powered-By` yo‘q                                                                                                   |
| Validatsiya          | global `ValidationPipe` (whitelist + forbidNonWhitelisted) → 422                                                                                               |
| SQL injection        | Prisma query builder; raw SQL faqat tagged template (parametrlangan)                                                                                           |
| IDOR / multi-tenant  | har query `organizationId` bilan; composite FK'lar DB darajasida tashkilotni kafolatlaydi; e2e isolation testi                                                 |
| Filial izolyatsiyasi | `allBranches`/`BranchMembership`; `assertBranchAccess`, `branchListFilter`                                                                                     |
| RBAC                 | `@RequirePermissions` / `@RequireAnyPermission` (`*_own` variantlar), permission DB'da                                                                         |
| Xato oqishi          | global filter: 5xx da umumiy xabar; Prisma/parser tafsilotlari yashirin                                                                                        |
| Audit                | append-only (DB trigger), sensitive maydonlar olib tashlanadi, faqat `audit.read`                                                                              |
| Log                  | secret'lar redaksiya, query string log'ga yozilmaydi                                                                                                           |

## Multi-tenancy va arxitektura

```
Platform OWNER (User.platformRole) ── barcha markazlar (/owner/*)
User ─┬─ OrganizationMembership ── Organization (= Center) ─┬─ SubCenter ── Branch
      │     ├─ Role ── RolePermission ── Permission       └─ Branch (to‘g‘ridan-to‘g‘ri markazda)
      │     └─ BranchMembership ── Branch
      └─ RefreshToken
```

- **Center = `Organization`.** Alohida jadval yaratilmagan: slug, brend, valyuta, til, timezone va barcha CRM ma'lumotlari allaqachon `organizationId` ga bog‘langan edi. Markazga faqat lifecycle qo‘shildi (`status`, `activeFrom`, `activeUntil`).
- **OrganizationMembership** — foydalanuvchining markazdagi roli (UserRole vazifasini bajaradi) va filial ruxsatlari (`allBranches` yoki `BranchMembership`).
- `branch_memberships` va `branches.sub_center_id` composite FK'lar orqali membership, sub-markaz va filial **bir xil** markazga tegishli bo‘lishini DB darajasida kafolatlaydi.
- Role'lar: `organizationId = null` → system role (DIRECTOR, ADMIN, MANAGER, CASHIER, TEACHER, HR). Markazga xos DIRECTOR role — egasi direktor ruxsatlarini cheklaganda yaratiladi.

### Boshqaruv ierarxiyasi: OWNER → DIRECTOR → STAFF

| Daraja       | Kim                                                    | Doirasi                                                    | API                                   |
| ------------ | ------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------- |
| **OWNER**    | `users.platform_role = 'OWNER'` (markaz a'zosi emas)   | Barcha markazlar: yaratish, muzlatish, arxiv, direktorlar | `/owner/*` (`@PlatformScoped`)         |
| **DIRECTOR** | `DIRECTOR` roli, `allBranches`                          | O‘z markazi, sub-markazlari, filiallari, xodimlari         | mavjud markaz route'lari + `/sub-centers`, `/analytics/center`, `/organizations/:id/staff` |
| **STAFF**    | ADMIN, MANAGER, CASHIER, TEACHER, HR                    | Biriktirilgan filiallar, rolning granular ruxsatlari        | mavjud markaz route'lari               |

- **Platform permission'lar** (`platform.read`, `centers.*`, `directors.*`, `analytics.global.read` — [platform-permissions.ts](src/platform/platform-permissions.ts)) markaz role'lariga hech qachon berilmaydi; `PlatformGuard` ularni DB'dan (har so‘rovda) o‘qilgan platform role bo‘yicha tekshiradi. Owner markaz ichidagi staff ruxsatlariga bog‘liq emas.
- **Markaz lifecycle:** `ACTIVE → FROZEN → ARCHIVED` (o‘chirish yo‘q, moliya va tarix saqlanadi). `TenantGuard` har so‘rovda markazning mavjudligini hisoblaydi ([center-availability.ts](src/platform/center-availability.ts)): muzlatilgan → `CENTER_FROZEN`, muddati tugagan → `CENTER_EXPIRED`, hali boshlanmagan → `CENTER_NOT_STARTED` (403, o‘qish va yozish birdek). Kunlar markaz timezone'ida, `activeUntil` — oxirgi ishlash kuni (inclusive). Login ham bloklanadi (barcha markazlari yopiq foydalanuvchi uchun); owner kira oladi. `CenterLifecycleService` muddati o‘tgan markazlarni `FROZEN` ga o‘tkazadi va `CENTER_EXPIRED` audit yozadi (actor = system). Muddati tugagan markazni faollashtirish yangi `activeUntil` talab qiladi (`CENTER_PERIOD_ENDED`).
- **Butunlay o‘chirish (hard delete)** — yagona aniq belgilangan holat: faqat `ARCHIVED` markaz, faqat owner (`centers.delete`), yozma tasdiq bilan. `DELETE /owner/centers/:id` (`confirm` = markaz slug'i) yoki `POST /owner/centers/bulk` (`action: archive|delete`, ≤100 ta id, delete uchun `confirm` = markazlar soni; har markaz alohida natija qaytaradi). Bitta tranzaksiyada markazning barcha ma'lumotlari o‘chadi; faqat shu markazda bo‘lgan hisoblar ham o‘chiriladi (boshqa joyda ishlaydiganlar qoladi). Audit append-only bo‘lgani uchun `CENTER_DELETED` yozuvi (nomi, sonlar) va markazning oldingi tarixi saqlanadi ([center-purge.service.ts](src/platform/centers/center-purge.service.ts)).
- **Sub-markaz:** `ACTIVE/FROZEN/ARCHIVED`; faol bo‘lmagan sub-markazning filiallarini `X-Branch-Id` sifatida tanlab ham, unga yozib ham bo‘lmaydi (kontekst ro‘yxatidan ham chiqadi).
- **Vaqtinchalik parollar** (direktor/xodim yaratish va reset): API'da yaratiladi yoki owner kiritadi, javobda **bir marta** qaytariladi, DB'da faqat Argon2id hash. `users.must_change_password` → `TenantGuard`/`PlatformGuard` `PASSWORD_CHANGE_REQUIRED` qaytaradi, faqat `/auth/*` ochiq. Mavjud hisob (email/telefon bo‘yicha) bog‘lanadi va paroli o‘zgarmaydi. Xodim parolini faqat shu markazdagina ishlaydigan hisob uchun tiklash mumkin.
- **Eskalatsiya yo‘q:** xodimga faqat chaqiruvchida bor ruxsatlar to‘plamidan iborat staff roli beriladi (`ROLE_NOT_ASSIGNABLE`), faqat o‘z filiallari; DIRECTOR rolini va direktorlar/o‘z a'zoligini faqat owner boshqaradi.
- **Hisob:** `PATCH /auth/me` (login o‘zgarsa joriy parol kerak), `POST /auth/change-password` (boshqa sessiyalar yopiladi), `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/sessions/revoke-others`. Access token'da `sid` (refresh family) bor — "shu qurilma"ni ajratish uchun.
- **Tahlil** — barcha agregatsiya SQL'da, bitta servis ([hierarchy-metrics.service.ts](src/analytics/hierarchy-metrics.service.ts)) markaz yoki filial kesimida: faol/yangi o‘quvchilar va oldingi teng davrga o‘sish, oilalar, guruhlar, davomat `(PRESENT+LATE)/TOTAL`, tushum `to‘lovlar − qaytarishlar`, joriy qarz, lidlar va konversiya, vazifalar. `GET /owner/analytics` — markazlar qatorlari + jami, `GET /analytics/center` (`analytics.center.read`) va `GET /owner/centers/:id/analytics` — sub-markaz → filial.
- **Audit:** CENTER_CREATED/UPDATED/FROZEN/ACTIVATED/ARCHIVED/EXPIRED, BRAND_SETTINGS_CHANGED, DIRECTOR_CREATED/PERMISSIONS_CHANGED/STATUS_CHANGED/PASSWORD_RESET, SUB_CENTER_*, BRANCH_CREATED/UPDATED, STAFF_CREATED/UPDATED — domain event orqali (who, what, when, target), parolsiz. Owner: `GET /owner/audit`.
- **Migratsiya** ([20261001150000_management_hierarchy](prisma/migrations/20261001150000_management_hierarchy/migration.sql)): `is_active` → `status` (o‘chirilgan → ARCHIVED, nofaol → FROZEN), mavjud filiallar markaz ostida qoladi, `OWNER` system roli shu qatorning o‘zida `DIRECTOR` ga qayta nomlanadi (a'zoliklar va ruxsatlar o‘zgarmaydi). Oldin `pg_dump` oling.
- **Testlar:** [test/management.e2e-spec.ts](test/management.e2e-spec.ts) — owner oqimlari, muzlatilgan/muddati tugagan markaz, direktor ruxsatlari, sub-markaz/filial, eskalatsiya va markazlar orasidagi izolyatsiya.

### Request pipeline

```
RequestContext (X-Request-ID) → Helmet/CORS → ThrottlerGuard → JwtAuthGuard → PlatformGuard → TenantGuard → PermissionsGuard
  → ValidationPipe → Controller → Service → Prisma → DomainEvent (commit'dan keyin) → Audit / Notifications
```

| Qatlam                  | Vazifasi                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JwtAuthGuard` (global) | Har bir route token talab qiladi, `@Public()` bundan mustasno. User aktivligi DB'dan tekshiriladi.                                                                                 |
| `PlatformGuard`         | `@PlatformScoped()` route'larda (`/owner/*`) platform role va platform permission'larni tekshiradi. |
| `TenantGuard`           | `@OrganizationScoped()` route'larda org ID'ni URL yoki `X-Organization-Id` dan oladi, **DB'dan membership'ni va markaz holatini tekshiradi**, `X-Branch-Id` ni tekshiradi, `req.tenant` ni o‘rnatadi. |
| `PermissionsGuard`      | `@RequirePermissions('branch.create')` ni tenant ruxsatlariga qarab tekshiradi.                                                                                                    |
| Service'lar             | Har bir query `tenant.organizationId` bilan filtrlanadi — boshqa tashkilot ID'lari hech qachon mos kelmaydi (IDOR himoyasi).                                                       |

### Refresh token

- Refresh token — alohida secret bilan imzolangan JWT. DB'da faqat uning **SHA-256** hash'i saqlanadi.
- Har bir `/auth/refresh` eski token'ni bekor qilib, yangisini beradi (rotation).
- Ishlatilgan token qayta yuborilsa, butun sessiya (token family) bekor qilinadi (`REFRESH_TOKEN_REUSED`).

## Domen modullari

### Phase 2 — Academic core

```
Organization ─┬─ Family ── Student ── Enrollment ── Group ─┬─ Course ── Level
              └─ Branch ───────────────────────────────────┘
```

- **Student ↔ Group faqat Enrollment orqali.** Transfer eski enrollment'ni `TRANSFERRED` qilib yopadi va yangisini ochadi (`transferredFromId` zanjiri). Hech narsa o‘chirilmaydi.
- **DB darajasidagi izolyatsiya:** barcha bog‘lanishlar `organizationId` ni o‘z ichiga olgan composite FK. `Group(levelId, courseId) → Level(id, courseId)` boshqa kursning level'ini DB'ning o‘zi rad etadi. `Enrollment(groupId, organizationId, branchId) → Group` esa enrollment filiali doim guruh filiali bilan bir xil bo‘lishini kafolatlaydi.
- **Concurrency:** enrollment create/transfer/cancel va student status o‘zgarishi tranzaksiya ichida `SELECT … FOR UPDATE` bilan ishlaydi (tartib: student → group). Qo‘shimcha himoya — partial unique index `enrollments_one_active_per_student`.
- **Filial kirish qoidalari** (`allBranches = false` bo‘lgan a'zolar uchun):
  - Student, Group, Enrollment — `branchId` bo‘yicha. Student'ning `branchId` si uning _hozirgi_ filiali; boshqa filial guruhiga yozilsa yoki transfer bo‘lsa, u ham o‘zgaradi.
  - Family — `primaryBranchId` yoki farzandlaridan biri a'zoning filialida bo‘lsa.
  - Course/Level — tashkilot bo‘yicha umumiy.
- **List filtrlari:** `?branchId=` → aks holda tanlangan `X-Branch-Id` → aks holda ruxsat etilgan barcha filiallar.
- **Soft delete:** `DELETE` family/course/level → `isActive=false`, group → `CANCELLED`, student → `LEFT` (aktiv enrollment `CANCELLED` bo‘ladi). Aktiv bog‘liqliklar bo‘lsa, `409`.
- **Sanalar** (`startedAt`, `birthDate`, ...) `YYYY-MM-DD` ko‘rinishida qabul qilinadi. Default "bugun" tashkilot timezone'i bo‘yicha hisoblanadi. **Pul** `DECIMAL(14,2)`, javobda string.
- **Audit tayyorgarligi:** servislar commit'dan keyin domain event chiqaradi (`student.created`, `enrollment.transferred`, ...; [domain-events.ts](src/common/events/domain-events.ts)). Audit moduli `@OnEvent('**')` bilan ulanadi.

### Phase 3 — Teacher, Room, Schedule, Attendance

- **Teacher** — minimal profil (`userId` ixtiyoriy login). Kelajakdagi HR moduli `Employee` modelini qo‘shib, shu jadvalga bog‘laydi; jadvalni almashtirmaydi. Group'ning `teacherId` si — asosiy o‘qituvchi (co-teacher'lar keyin `GroupTeacher` join-jadvali orqali qo‘shiladi).
- **Room** — filialga tegishli, `code` filial ichida unique. `Group.roomId` va `Schedule.roomId` composite FK orqali **faqat guruh filialidagi** xonaga ishora qila oladi.
- **Schedule** — haftalik slot (`dayOfWeek` + `TIME` ustunlar, `"HH:MM"`, tashkilot timezone'idagi mahalliy vaqt). Yaratish/o‘zgartirish/qayta faollashtirish va guruhga yangi o‘qituvchi tayinlashda quyidagi to‘qnashuvlar tekshiriladi: guruhning o‘zi, xona (`ROOM_SCHEDULE_CONFLICT`), o‘qituvchi (`TEACHER_SCHEDULE_CONFLICT`). Faqat ishlayotgan (ACTIVE/PAUSED) va sana oralig‘i kesishgan guruhlar hisobga olinadi; bir-biriga tegib turgan slotlar (18:30–20:00 va 20:00–21:30) to‘qnashmaydi. Race condition'ga qarshi: group → room → teacher qatorlari `FOR UPDATE` bilan qulflanadi.
- **Attendance** — bitta enrollment uchun bir sanada bitta belgi (`UNIQUE(organizationId, enrollmentId, date)`). `POST /attendance/group/:groupId` idempotent: yo‘q belgilarni yaratadi, borlarini yangilaydi, hammasi bitta tranzaksiyada. Kelajakdagi sana uchun `attendance.mark_future` kerak. `checkInAt` faqat PRESENT/LATE uchun.
- **Statistika:** `attendancePercentage = (PRESENT + LATE) / TOTAL × 100` (TOTAL barcha belgilarni, shu jumladan EXCUSED'ni o‘z ichiga oladi; EXCUSED alohida ko‘rsatiladi).
- **O‘qituvchi huquqlari (`*_own` permission'lar):** TEACHER roli `groups.read_own`, `students.read_own`, `attendance.read_own`, `attendance.mark_own` ga ega. Ular faqat `Teacher.userId = joriy user` bo‘lgan guruhlarga amal qiladi (DB'dan tekshiriladi). Begona guruh → `403 GROUP_ACCESS_DENIED`. Keng huquqlar (`groups.read` va h.k.) OWNER/ADMIN/MANAGER'da.
- **Seed'dagi `revoked`:** system role'dan olib tashlangan default'lar ([roles.catalog.ts](src/roles/roles.catalog.ts)) seed paytida o‘chiriladi (Phase 2'dagi TEACHER'ning filial bo‘yicha keng o‘qish huquqlari shu yo‘l bilan olib tashlandi).

### Phase 4 — Finance

```
Family ─┬─ Invoice ── Payment ── Refund
Student ┘     │          │         │
              └── CashSession ─────┘ ── Expense
```

- **Invoice** — oilaga (ixtiyoriy ravishda bitta farzandga) yoziladigan hisob. `finalAmount = amount − discount` (DB `CHECK`). Raqam — tashkilot bo‘yicha yil kesimida uzluksiz: `INV-2026-000042` (`document_counters`, invoice bilan bitta tranzaksiyada `INSERT … ON CONFLICT` orqali; rollback bo‘lsa raqam yonmaydi).
- **Balans saqlanmaydi.** `paid = Σ payments`, `refunded = Σ refunds`, `debt = finalAmount − (paid − refunded)` — har doim tarixdan hisoblanadi ([invoice-balances.ts](src/finance/common/invoice-balances.ts)). Saqlanadigan `status` (PENDING/PARTIAL/PAID/CANCELLED) har bir payment/refund'dan keyin qayta chiqariladi; **OVERDUE** saqlanmaydi — `dueDate < bugun` va to‘lanmagan bo‘lsa javobda va filtrda hosil qilinadi.
- **Payment** — doim invoice filialida (composite FK). Invoice qatori `FOR UPDATE` bilan qulflanadi: qoldiq qarzdan oshiq to‘lov (`PAYMENT_EXCEEDS_BALANCE`), bekor qilingan invoice (`INVOICE_CANCELLED`), kelajak sana (`PAYMENT_DATE_IN_FUTURE`) rad etiladi. `transactionId` — tashkilot bo‘yicha unique idempotency kaliti; takroriy so‘rov `409 PAYMENT_ALREADY_EXISTS` (asl to‘lov `details` da) oladi, ikki marta yechilmaydi.
- **Refund** — to‘lovning o‘zi o‘zgarmaydi; refund alohida yozuv, to‘lov summasidan oshmaydi (`REFUND_EXCEEDS_PAYMENT`) va qarzni qayta ochadi.
- **Invoice tahriri/bekor qilish:** `finalAmount` to‘langan summadan pastga tushmaydi (`INVOICE_AMOUNT_BELOW_PAID`); bekor qilish faqat invoice'da pul qolmaganda (`INVOICE_HAS_PAYMENTS` — avval refund).
- **CashSession (kassa smenasi)** — kassir bo‘yicha bitta OPEN smena (partial unique index). CASH to‘lov, CASH to‘lov refund'i va CASH xarajat kassirning **shu filialdagi** ochiq smenasiga bog‘lanadi, aks holda `CASH_SESSION_REQUIRED`. Yopishda `expected = opening + cashIn − refundsOut − expensesOut`, `difference = counted − expected`. Faqat ochgan kassir yopadi (`CASH_SESSION_NOT_OWNER`). Lock tartibi: `invoices → cash_sessions`; smena qatori qulflangani uchun yopilish paytida unga pul yozilib qolmaydi.
- **Expense** — filial xarajati. Yopilgan smenadagi CASH xarajat summasi o‘zgarmaydi (`CASH_SESSION_CLOSED`); to‘lov usuli va filial o‘zgarmaydi.
- **Hisobot** (`GET /finance/reports/summary?from=&to=&branchId=`): income, refunds, netIncome, expenses, profit, to‘lov usuli va xarajat kategoriyasi bo‘yicha taqsimot, joriy `outstandingDebt`/`overdueDebt`. `GET /invoices/summary?familyId=|studentId=` — oila/o‘quvchi bo‘yicha billed/paid/debt.
- **RBAC:** `finance.*`. OWNER/ADMIN/MANAGER — hammasi. CASHIER — o‘qish, to‘lov qabul qilish va o‘z kassasi; invoice/xarajat/refund faqat alohida berilsa. TEACHER — yo‘q.

### Phase 5 — Leads & CRM Sales

```
LeadSource ─┐
LeadPipeline ── LeadStage ─┐
                           ├─ Lead ── LeadActivity  (append-only tarix)
               Branch ─────┘   │
                               └─ convert → Family + Student + Enrollment
```

- **Lead hech qachon Student emas.** Lead — enrollment'gacha bo‘lgan voronka yozuvi. `POST /leads/:id/convert` yangi (yoki mavjud) `Family`, `Student` va ixtiyoriy `Enrollment` yaratadi va lead'ni `CONVERTED` qiladi — hammasi bitta tranzaksiyada. Enrollment qismi Phase 2'dagi bir xil lock/capacity mantig‘ini qayta ishlatadi (`EnrollmentsService.enrollWithinTx`).
- **Voronka hardcoded emas.** Manba (`LeadSource`), pipeline (`LeadPipeline`) va bosqichlar (`LeadStage`) — har bir tashkilot uchun sozlanadigan konfiguratsiya. Tashkilot yaratilganda oqilona default'lar seed qilinadi ([leads.defaults.ts](src/leads/leads.defaults.ts)) va keyin to‘liq tahrirlanadi. `status` (enum) — voronkaning kanonik holati; `stageId` — ixtiyoriy board pozitsiyasi.
- **Duplicate detection.** Telefon `phoneNormalized` (faqat raqamlar, davlat kodisiz 9 xonali; `+998901234567`, `998901234567`, `90 123 45 67` → `901234567`) bo‘yicha solishtiriladi. Ochiq (CONVERTED/LOST emas, o‘chirilmagan) lead topilsa → `409 DUPLICATE_LEAD`. Race'ga qarshi partial unique index `leads_one_active_per_phone` backstop bo‘ladi.
- **Assignment.** Lead faqat: tashkilot a'zosi bo‘lgan, lead branch'iga kira oladigan va `leads.read` huquqiga ega userga biriktiriladi (`assertAssignee`). Cross-org/cross-branch assign taqiqlanadi.
- **Follow-up.** `nextFollowUpAt` saqlanadi; `GET /leads/follow-ups?filter=today|overdue|upcoming` (tashkilot timezone'i bo‘yicha) voronkadagi ochiq lead'larni qaytaradi.
- **Activity.** Har bir muhim harakat (`CALL`, `MESSAGE`, `MEETING`, `TRIAL`, `NOTE`, va tizim yozuvlari `STATUS_CHANGED`, `ASSIGNED`, `FOLLOW_UP`) `LeadActivity`'ga yoziladi va **o‘chirilmaydi**. Lead `DELETE` — soft delete (`deletedAt`), tarix saqlanadi.
- **Statistika** ([lead-stats.service.ts](src/leads/lead-stats.service.ts)): status bo‘yicha sonlar, `conversionRate = converted / qualified'ga yetganlar × 100`, `trialAttendanceRate = trial attended'ga yetganlar / trial booked'ga yetganlar × 100` (nolga bo‘lish 0 qaytaradi), manba bo‘yicha taqsimot. Faqat service/API — UI yo‘q.
- **RBAC:** `leads.*`, `lead_sources.*`, `lead_pipeline.*` huquqlari. OWNER/ADMIN/MANAGER to‘liq; TEACHER default holatda lead'larni **ko‘rmaydi**.

### Phase 6 — HR & Task Management

```
Position ──┐
Department ┼─ Employee ── EmployeeBranch ── Branch
User ──────┘     │
                 └─ assignee of Task ─┬─ TaskActivity (append-only tarix)
                                      └─ TaskComment
```

- **Employee ≠ User.** `Employee` — tashkilotdagi xodim yozuvi; `userId` ixtiyoriy (hamma xodimda CRM login bo‘lishi shart emas). Bog‘langan user tashkilotning aktiv a'zosi bo‘lishi kerak (`EMPLOYEE_USER_NOT_MEMBER`), bitta user — tashkilotda bitta employee (`EMPLOYEE_USER_TAKEN`). Kirish huquqlari avvalgidek `OrganizationMembership`/`BranchMembership` orqali; HR ma'lumotlari auth ma'lumotlari bilan aralashmaydi.
- **Position / Department** — har bir tashkilot o‘zi yaratadi (hardcode yo‘q), `code` tashkilot ichida unique. `DELETE` → `isActive=false`; nofaol lavozim/bo‘limni yangi xodimga berib bo‘lmaydi (`POSITION_INACTIVE`/`DEPARTMENT_INACTIVE`), mavjud xodimlarda qoladi.
- **EmployeeBranch** — xodim bir nechta filialda ishlaydi. `UNIQUE(employeeId, branchId)` va partial unique index orqali **aynan bitta primary**; `Employee.primaryBranchId` shu qator bilan bitta tranzaksiyada sinxron. Primary filialni o‘chirib bo‘lmaydi (`EMPLOYEE_PRIMARY_BRANCH_REQUIRED`) — avval `PATCH /employees/:id/branches/:branchId/primary`. Xodim yaratish (employee + filiallar) bitta tranzaksiyada.
- **Xodim ko‘rinishi:** filial bilan cheklangan a'zo faqat o‘z filiallaridan birida ishlaydigan xodimlarni ko‘radi. `DELETE /employees/:id` → `TERMINATED` + `terminationDate` (soft delete).
- **Task** — filialga tegishli; `assignedToId` → **Employee** (logini bo‘lmagan xodimga ham task berish mumkin). Biriktirish (`tasks.assign`): xodim shu tashkilotda, `ACTIVE`/`ON_LEAVE` holatida (`EMPLOYEE_NOT_ASSIGNABLE`) va task filialida ishlashi shart (`TASK_ASSIGNEE_NO_BRANCH_ACCESS`). Tranzaksiya ichida lock tartibi: `tasks → employees`. Kelajakda bir nechta ijrochi uchun `TaskAssignee` join-jadvali qo‘shiladi.
- **relatedType/relatedId** (`LEAD`, `STUDENT`, `FAMILY`, `GROUP`, `EMPLOYEE`) — FK'siz polymorphic bog‘lanish, shuning uchun backend tekshiradi: resurs shu tashkilotda bo‘lishi, filialga tegishli bo‘lsa (lead/student/group) — chaqiruvchi kira oladigan filialda bo‘lishi kerak (`TASK_RELATED_NOT_FOUND`). Juftlik DB `CHECK` bilan kafolatlangan.
- **Status:** ochiq statuslar orasida erkin o‘tish; `COMPLETED`/`CANCELLED` yopiq — faqat `TODO`/`IN_PROGRESS` ga qayta ochiladi. `completedAt` faqat `COMPLETED` da (DB `CHECK`). Yopiq taskni tahrirlab/biriktirib bo‘lmaydi (`TASK_CLOSED`).
- **Overdue** saqlanmaydi: `dueDate < now AND status NOT IN (COMPLETED, CANCELLED)`. `GET /tasks/overdue`, `?overdue=true|false`, javobda `isOverdue`.
- **Tarix** (`TaskActivity`): `CREATED`, `ASSIGNED`, `STATUS_CHANGED`, `PRIORITY_CHANGED`, `DEADLINE_CHANGED`, `COMMENTED`, `COMPLETED`, `CANCELLED`, `UPDATED`, `DELETED` — o‘zgarish bilan **bitta tranzaksiyada** yoziladi, hech qachon o‘zgartirilmaydi yoki o‘chirilmaydi. `DELETE /tasks/:id` — soft delete (`deletedAt`), tarix va izohlar saqlanadi.
- **Kim nimani ko‘radi:** `tasks.read` — o‘z filiallaridagi barcha tasklar (MANAGER, OWNER/ADMIN). `tasks.read_own` — o‘ziga biriktirilgan (employee.userId = user) yoki o‘zi yaratgan tasklar. `tasks.update_own` — ijrochi o‘z taskini `TODO/IN_PROGRESS/BLOCKED/COMPLETED` ga o‘tkaza oladi, lekin bekor qila yoki qayta ocha olmaydi (`TASK_ACCESS_DENIED`). CASHIER/TEACHER/HR'da `read_own` + `update_own` + `comment`.
- **Statistika** ([task-rules.ts](src/tasks/task-rules.ts)): `GET /tasks/statistics?branchId=&from=&to=&assignedToId=` — status bo‘yicha sonlar va overdue. `GET /tasks/statistics/employees/:employeeId` — xodim bo‘yicha sonlar va `completionRate = completed / (completed + cancelled) × 100` (hech narsa yopilmagan bo‘lsa 0). Bu performance rating emas, faqat faktlar.
- **RBAC:** `employees.*`, `employee.branches.manage`, `positions.read|manage`, `departments.read|manage` — HR, OWNER/ADMIN; MANAGER faqat o‘qiydi. TEACHER'da HR ma'lumotlariga kirish yo‘q. `tasks.*` — MANAGER, OWNER/ADMIN.

### Phase 7 — Notifications & Communication

```
Business module ─→ DomainEvent (commit'dan keyin) ─→ Handler ─→ NotificationsService.notify()
                                                                   │  policy → recipients → preferences → template
                                                                   ├─ Notification (+ IN_APP delivery: DELIVERED)
                                                                   └─ NotificationDelivery (PENDING) ─→ NotificationQueue ─→ Provider
                                                                                                          (BullMQ | in-process)
```

- **Biznes modullar notificationni bilmaydi.** Finance/Tasks/Attendance/Leads faqat domain event chiqaradi (commit'dan keyin). `src/notifications/handlers/*` ularni `NotificationsService.notify()` ga aylantiradi — bu notification yaratishning **yagona** yo‘li. Payment tranzaksiyasi ichida hech qanday tashqi so‘rov yo‘q: tashqi kanallar faqat navbatga qo‘yiladi.
- **Eventlar:** `task.created`/`task.assigned` → `TASK_ASSIGNED` (ijrochi employee'ning login'iga); `payment.created` → `PAYMENT_RECEIVED`; `attendance.marked`/`attendance.updated` (ABSENT/LATE) → `ATTENDANCE_*`; `lead.created`/`lead.assigned` → `LEAD_ASSIGNED`. Vaqtga bog‘liqlari (`TASK_DUE`, `TASK_OVERDUE`, `PAYMENT_DUE`, `PAYMENT_OVERDUE`, `LEAD_FOLLOW_UP`) — [scanner](src/notifications/scanner/notification-scanner.service.ts) har `NOTIFICATION_SCAN_INTERVAL_MS` da (invoice'lar uchun "bugun" tashkilot timezone'i bo‘yicha).
- **Idempotency:** `UNIQUE(organizationId, recipientUserId, eventKey)`. Kalitlar: `PAYMENT_RECEIVED:<paymentId>`, `ATTENDANCE_ABSENT:<attendanceId>`, `TASK_DUE:<taskId>:<dueDate>` (muddat o‘zgarsa — yangi eslatma), `TASK_ASSIGNED:<eventId>` (har bir domain event'da endi `eventId` bor). Takroriy event e'tiborsiz qoldiriladi (`duplicates` hisoblanadi); poyga holatini unique index hal qiladi. Scanner bir nechta instance'da ham xavfsiz.
- **Kim oladi — type policy** ([notification-types.catalog.ts](src/notifications/core/notification-types.catalog.ts) default'lari + `NotificationPolicy` bilan tashkilot override'i): type yoqilgan/o‘chirilganmi, `recipientPermission` (masalan `PAYMENT_*` → `finance.*`, `ATTENDANCE_*` → `attendance.read`; shu huquqli va **filialga kira oladigan** a'zolar), default va **locked** kanallar. Event subyekti (ijrochi, lead egasi) tashkilotning aktiv a'zosi bo‘lsagina oladi; harakatni bajargan user o‘zi haqida xabar olmaydi. `critical` type (SYSTEM) o‘chirilmaydi va IN_APP undan olib tashlanmaydi.
- **Preferences:** user har bir type uchun kanallarni tanlaydi; qator yo‘q bo‘lsa policy default'i. Locked kanalni o‘chirish → `400 NOTIFICATION_CHANNEL_LOCKED`. IN_APP o‘chirilib, tashqi kanal yoqilgan bo‘lsa, notification inbox'da ko‘rinmaydi, lekin yuboriladi.
- **Templates:** `NotificationTemplate` (type × channel) → yo‘q bo‘lsa shu type'ning IN_APP template'i → yo‘q bo‘lsa katalogdagi default. Faqat `{{o‘zgaruvchi}}` almashtiriladi, har bir type uchun **allow-list** (`studentName`, `familyName`, `amount`, `dueDate`, `groupName`, `teacherName`, ...); ro‘yxatdan tashqari o‘zgaruvchi saqlashda rad etiladi (`NOTIFICATION_TEMPLATE_INVALID_VARIABLE`). Hech qanday ifoda bajarilmaydi, Telegram'ga oddiy matn ketadi (`parse_mode` yo‘q).
- **Delivery va retry:** har bir (notification, kanal) — bitta `NotificationDelivery` qatori (`PENDING → SENT | FAILED | CANCELLED`, `attempts`, `errorMessage`, `provider`, `providerMessageId`). Provider xato bersa — exponential backoff bilan qayta urinish, jami `NOTIFICATION_MAX_ATTEMPTS` (default 3), keyin `FAILED`; cheksiz retry yo‘q. Admin `POST /notification-deliveries/:id/retry` bilan qayta urinishi mumkin. Manzili bo‘lmagan kanal (bog‘lanmagan Telegram) uchun delivery umuman yaratilmaydi.
- **Queue:** `REDIS_URL` berilsa — BullMQ (Redis `docker compose`da), aks holda in-process navbat (dev/test). Ikkalasida retry qoidalari bir xil. Qayta ishga tushishda yo‘qolgan `PENDING` delivery'larni scanner qayta navbatga qo‘yadi.
- **Providerlar** `NotificationProvider` interfeysi ortida ([notification-provider.ts](src/notifications/delivery/notification-provider.ts)): `TelegramProvider` (Bot API, `TELEGRAM_BOT_TOKEN` bo‘lsa), `mock` email/SMS (`NOTIFICATION_EMAIL_PROVIDER=mock`). Haqiqiy SMTP/SMS gateway shu interfeysni implement qilib, modul factory'siga qo‘shiladi — biznes kod o‘zgarmaydi.
- **Telegram bog‘lash:** `POST /telegram/link-code` → 15 daqiqalik bir martalik kod (bazada faqat SHA-256 hash) va `https://t.me/<bot>?start=<kod>`. Bot webhook'i (`POST /telegram/webhook`, `X-Telegram-Bot-Api-Secret-Token` bilan himoyalangan) `/start <kod>` ni tekshiradi va `UserTelegramAccount` ni verified qiladi. `telegramUserId` unique — bitta Telegram akkaunt bitta CRM user'ga (`TELEGRAM_ACCOUNT_TAKEN`).
- **Xavfsizlik:** har bir inbox so‘rovi `(organizationId, recipientUserId = joriy user)` ga qadalgan — begona notification `404`. Qabul qiluvchi yaratish paytida DB'dan tekshiriladi (a'zolik, permission, filial). `relatedType/relatedId` — faqat ID; resursning o‘zi uning endpointi orqali, odatiy access tekshiruvi bilan ochiladi. `GET /notifications/unread-count` partial index (`notifications_unread_badge`) bilan faqat son qaytaradi.
- **RBAC:** `notifications.read`, `notification_preferences.read|update` — barcha rollar (o‘z inbox'i). `notification_templates.read`, `notification_delivery.read` — MANAGER. `notifications.manage` (system xabar, policy, retry), `notification_templates.manage`, `notification_providers.manage` — OWNER/ADMIN.

### Phase 8 — Reports, Dashboard, Audit

- **Hisobotlar** ([src/reports/](src/reports)) — har domen uchun alohida servis, umumiy filtr: tashkilot (kontekstdan), `branchId`, davr. Mavjud statistika qayta ishlatiladi (`LeadStatsService`, `TaskStatsService`, attendance formulasi) — bir metrika ikki joyda hisoblanmaydi.
  - `GET /reports/finance/summary|revenue|expenses|debt|payments` (`finance.report.read`): invoiced/paid/refunded/expenses, `netRevenue = paid − refunds − expenses`, har bir to‘lov usuli (0 bo‘lsa ham), kunlik/oylik qatorlar, qarz aging (current, 1-30, 31-60, 61-90, 90+) va eng katta qarzdor oilalar.
  - `GET /reports/students/summary|growth|status`, `GET /reports/attendance/summary|groups|students` (`reports.academic.read`): `course`/`group`/`teacher` filtrlari; davomat `(PRESENT + LATE) / TOTAL × 100`, reytinglar eng past foizdan.
  - `GET /reports/leads/summary|sources|pipeline` (`leads.report.read`), `GET /reports/tasks/summary|employees` (`tasks.statistics.read`).
- **Dashboard** — `GET /dashboard/overview?period=` (`dashboard.read`): o‘quvchilar, oilalar, guruhlar, o‘qituvchilar, davomat (bugun + davr), moliya (bugungi to‘lovlar, tushum, xarajat, qarz), leadlar, vazifalar, o‘qilmagan bildirishnomalar. Har bo‘lim faqat tegishli domen permission'i bo‘lsa to‘ldiriladi, aks holda `null`.
- **Audit** ([src/audit/](src/audit)) — `Request → Controller → Service → DomainEvent → AuditEventsHandler → AuditLog`. Har domain event (PAYMENT_CREATED, REFUND_CREATED, INVOICE_CANCELLED, ENROLLMENT_TRANSFERRED, TASK_ASSIGNED, EMPLOYEE_CREATED…) avtomatik yoziladi; event chiqarmaydigan mutatsiyalar (kurs, xona, filial…) `AuditInterceptor` orqali `CREATE/UPDATE/DELETE` sifatida; LOGIN/LOGOUT/REGISTER/TOKEN_REFRESHED — account event'lar (`organizationId = null`). Har yozuvda actor, IP, user-agent, `requestId`. `oldData/newData` dan password/token/secret/hash kalitlari olib tashlanadi. **Append-only**: DB trigger UPDATE/DELETE'ni rad etadi; FK yo‘q (audit yozuvlari o‘zlari tasvirlagan ma'lumotdan uzoq yashaydi). `GET /audit-logs`, `GET /audit-logs/:id` (`audit.read`, OWNER/ADMIN) — `userId/action/entityType/entityId/branchId/from/to` filtrlari.

### Frontend uchun read-model'lar

Web ilova ekranlari uchun qo‘shilgan, faqat o‘qiladigan endpointlar (har biri tenant va ruxsat bilan cheklangan, e2e: `test/frontend-support.e2e-spec.ts`):

- `GET /debtors` (`finance.read` — kassir ham ko‘radi): qarzdor oilalar, eng katta qarz birinchi, har oila ichida o‘quvchilar bo‘yicha taqsimot; filtrlar `branchId`, `overdue`, `partial`, `dueTo`, `minAmount`, `search`; javobda filtrga mos jami va muddati o‘tgan qarz.
- `GET /schedules` (`groups.read` yoki `groups.read_own`): barcha guruhlarning haftalik darslari (guruh, kurs, o‘qituvchi, xona bilan), `branchId/groupId/teacherId/roomId` filtrlari; o‘qituvchi faqat o‘z guruhlarini ko‘radi.
- `GET /refunds` (`finance.payment.read`): qaytarishlar — to‘lov, hisob, oila va kim qaytargani bilan.
- `GET /organizations/:id/members` (`users.read` yoki `leads.assign`): faol a'zolar (ism, rol, filiallar) — "kimga biriktirish" ro‘yxatlari uchun; kontakt ma'lumotlari qaytarilmaydi.
- `GET /dashboard/overview` kengaytirildi: graduated/left, oilalar jami, guruhlar sig‘imi va band o‘rinlar, muddati o‘tgan hisoblar soni, sinov darsi va bugungi/kechikkan qo‘ng‘iroqlar, vazifalar (bugun muddati, davrda bajarilgan) va `myTasks`.
- `npm run openapi:export` — OpenAPI hujjatini DB/Redis'siz (Nest preview mode) `frontend/openapi.json` ga yozadi; frontend tiplari undan generatsiya qilinadi.

### Yangi domain modul qo‘shish (masalan, `students`)

1. `schema.prisma` ga model qo‘shing: `organizationId` (majburiy), kerak bo‘lsa `branchId` + `@@index([organizationId, ...])`, branch uchun composite FK `[branchId, organizationId] → Branch[id, organizationId]`.
2. `permissions.catalog.ts` ga `students.read` va hokazolarni qo‘shing, `roles.catalog.ts` da default'larni belgilang → `npm run db:seed`.
3. `src/students/` modul: controller'da `@OrganizationScoped({ branch: 'required' })` + `@RequirePermissions(...)`, service'da `@CurrentTenant()` dan `organizationId`/`branchId` bilan filtrlang.
