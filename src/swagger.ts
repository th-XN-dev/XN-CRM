import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from './app.setup';

/** The OpenAPI document of every `/api/v1` route (also asserted by the e2e tests). */
export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('XN CRM API')
    .setDescription(
      [
        'Multi-tenant Education CRM.',
        '',
        '**Envelope:** success → `{ success: true, data }`, error → `{ success: false, message, code }`.',
        '',
        '**Tenant context:** organization-scoped routes take the organization from the URL or the',
        '`X-Organization-Id` header; `X-Branch-Id` selects a branch. Both are verified against the',
        "caller's membership on every request.",
        '',
        '**Versioning:** every route is under `/api/v1` (except `GET /health`).',
        '',
        '**Errors:** 400 business rule, 401 unauthenticated, 403 no access / permission,',
        "404 not found (also for other tenants' ids), 409 conflict, 422 DTO validation",
        '(`details` lists the fields), 429 rate limit, 500 internal (no details leak).',
        'Every response carries `X-Request-ID`; error bodies repeat it as `requestId`.',
        '',
        '**Lists:** `?page=&limit=` (limit ≤ 100) → `{ items, meta: { page, limit, total, totalPages } }`.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  return SwaggerModule.createDocument(app, config);
}

/** Interactive docs at `/api/v1/docs` (JSON at `/api/v1/docs-json`); not mounted in production. */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, createSwaggerDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });
}
