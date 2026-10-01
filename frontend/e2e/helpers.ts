import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { FIXTURES } from './global-setup';

export interface Fixtures {
  password: string;
  /** Self-service creator of Jony: the center's DIRECTOR. */
  owner: string;
  /** XN CRM platform owner (owner area). */
  platformOwner: string;
  cashier: string;
  manager: string;
  teacher: string;
  groupName: string;
  tag: string;
}

export const fixtures = (): Fixtures => JSON.parse(readFileSync(FIXTURES, 'utf8')) as Fixtures;

/** A unique suffix per test run (the dev database keeps earlier runs). */
export const unique = () => Math.random().toString(36).slice(2, 7);

export async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `e2e/screenshots/${test.info().project.name}-${name}.png`, fullPage: false });
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email yoki telefon').fill(email);
  await page.getByLabel('Parol', { exact: true }).fill(fixtures().password);
  await page.getByRole('button', { name: 'Kirish' }).click();
}

/** Owner → Jony Math Academy → Termiz → dashboard. */
export async function ownerInTermiz(page: Page): Promise<void> {
  await signIn(page, fixtures().owner);
  await page.getByRole('button', { name: /Jony Math Academy/ }).click();
  await page.getByRole('button', { name: /Termiz/ }).click();
  await expect(page.getByRole('heading', { name: 'Salom, Xusanjon' })).toBeVisible();
}

/** Picks an option of an <EntityPicker> by typing into it. */
export async function pick(page: Page, label: string | RegExp, search: string, option: string | RegExp): Promise<void> {
  const box = page.getByRole('combobox', { name: label });
  await box.click();
  await box.fill(search);
  await page.getByRole('option', { name: option }).first().click();
}

export const toast = (page: Page) => page.getByRole('status').filter({ hasNotText: /^$/ });
