import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_PREFIX } from './app.setup';
import { createSwaggerDocument } from './swagger';

/**
 * Writes the OpenAPI document to a file without serving traffic:
 * `npm run openapi:export` → the web app generates its API types from it.
 */
async function exportOpenApi(target: string): Promise<void> {
  // Preview mode builds the module graph without instantiating providers (no DB/Redis).
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  app.setGlobalPrefix(API_PREFIX, { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  const document = createSwaggerDocument(app);
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`OpenAPI: ${Object.keys(document.paths).length} paths → ${target}`);
}

void exportOpenApi(resolve(process.argv[2] ?? 'openapi.json'));
