import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { FIXTURES } from './global-setup';

interface Fixtures {
  password: string;
  owner: string;
  cashier: string;
  groupName: string;
  tag: string;
}

const fixtures = (): Fixtures => JSON.parse(readFileSync(FIXTURES, 'utf8')) as Fixtures;
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(250); // let color transitions finish
  await page.screenshot({ path: `e2e/screenshots/${test.info().project.name}-${name}.png` });
};
const brand = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim(),
  );

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email yoki telefon').fill(email);
  await page.getByLabel('Parol', { exact: true }).fill(fixtures().password);
  await page.getByRole('button', { name: 'Kirish' }).click();
}

/** Owner: two organizations → pick Jony → pick Termiz → dashboard. */
async function ownerToDashboard(page: Page): Promise<void> {
  await signIn(page, fixtures().owner);
  await expect(page).toHaveURL(/select-organization/);
  await page.getByRole('button', { name: /Jony Math Academy/ }).click();
  await expect(page).toHaveURL(/select-branch/);
  await page.getByRole('button', { name: /Termiz/ }).click();
  await expect(page.getByRole('heading', { name: 'Salom, Xusanjon' })).toBeVisible();
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('login validates fields and explains a wrong password', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await shot(page, 'login');
    await page.getByRole('button', { name: 'Kirish' }).click();
    await expect(page.getByText('Bu maydon to‘ldirilishi shart')).toHaveCount(2);
    await page.getByLabel('Email yoki telefon').fill(fixtures().owner);
    await page.getByLabel('Parol', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Kirish' }).click();
    await expect(page.getByRole('alert')).toContainText('Email/telefon yoki parol noto‘g‘ri');
  });

  test('organization → branch selection → branded dashboard, switching from the header', async ({
    page,
  }) => {
    await signIn(page, fixtures().owner);
    await expect(page).toHaveURL(/select-organization/);
    await shot(page, 'select-organization');
    await page.getByRole('button', { name: /Jony Math Academy/ }).click();
    await expect(page.getByRole('button', { name: /Barcha filiallar/ })).toBeVisible();
    await shot(page, 'select-branch');
    await page.getByRole('button', { name: /Termiz/ }).click();

    await expect(page.getByRole('heading', { name: 'Salom, Xusanjon' })).toBeVisible();
    expect(await brand(page)).toBe('#38B266'); // Jony's own color, not the default indigo
    await expect(page.getByRole('link', { name: 'Bosh sahifa' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('ishlayotgan guruh')).toBeVisible();
    await shot(page, 'dashboard-light');

    // Branch switch in the header (no page reload, data refetched).
    await page.getByRole('button', { name: /Filial: Termiz/ }).click();
    await page.getByRole('menuitemradio', { name: 'Denov' }).click();
    await expect(page.getByRole('button', { name: /Filial: Denov/ })).toBeVisible();

    // Organization switch → ABC has a single branch → straight back to the dashboard, new brand.
    await page.getByRole('button', { name: /Markaz: Jony/ }).click();
    await page.getByRole('menuitemradio', { name: /ABC Education/ }).click();
    await expect(page.getByRole('button', { name: /Markaz: ABC/ })).toBeVisible();
    await expect.poll(() => brand(page)).toBe('#4F46E5');
  });

  test('language and theme change instantly, without a reload', async ({ page }) => {
    await ownerToDashboard(page);
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 42));

    await page.getByRole('button', { name: 'Hisob' }).click();
    await page.getByRole('menuitemradio', { name: 'Русский' }).click();
    await expect(
      page.getByRole('navigation', { name: 'Главное меню' }).getByRole('link', { name: 'Ученики' }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

    await page.getByRole('button', { name: 'Аккаунт' }).click();
    await page.getByRole('menuitemradio', { name: 'Тёмная' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(42);
    await shot(page, 'dashboard-dark-ru');

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/); // preference persisted
    await expect(
      page.getByRole('navigation', { name: 'Главное меню' }).getByRole('link', { name: 'Ученики' }),
    ).toBeVisible();
  });

  test('session survives a reload; an expired access token is refreshed and the request retried', async ({
    page,
  }) => {
    await ownerToDashboard(page);
    let refreshes = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/auth/refresh')) refreshes++;
    });
    let rejected = false;
    await page.route('**/api/v1/dashboard/overview**', async (route) => {
      if (!rejected) {
        rejected = true;
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' }),
        });
      } else {
        await route.continue();
      }
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Salom, Xusanjon' })).toBeVisible();
    await expect(page.getByText('ishlayotgan guruh')).toBeVisible();
    expect(rejected).toBe(true);
    expect(refreshes).toBe(2); // one to restore the session after reload, one after the 401
  });

  test('brand settings preview live and save for the organization', async ({ page }) => {
    await ownerToDashboard(page);
    await page.getByRole('link', { name: 'Sozlamalar' }).click();
    await page.getByRole('link', { name: 'Brend' }).first().click();
    const color = page.getByRole('textbox', { name: 'Asosiy rang' });
    await color.fill('#E11D48');
    await expect.poll(() => brand(page)).toBe('#E11D48'); // live preview
    await shot(page, 'brand-settings');
    await color.fill('green');
    await page.getByRole('button', { name: 'Saqlash' }).click();
    await expect(page.getByText('Rangni #4F46E5 ko‘rinishida kiriting')).toBeVisible();
    await color.fill('#E11D48');
    await page.getByRole('button', { name: 'Saqlash' }).click();
    await expect(page.getByText('Brend yangilandi')).toBeVisible();
    await page.reload();
    await expect.poll(() => brand(page)).toBe('#E11D48');
  });

  test('cashier: no selectors to answer, a reduced menu, forbidden sections blocked', async ({
    page,
  }) => {
    await signIn(page, fixtures().cashier);
    await expect(page.getByRole('heading', { name: 'Salom, Bekzod' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Asosiy menyu' });
    await expect(nav.getByRole('link', { name: 'Moliya' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Lidlar' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Xodimlar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Markaz:/ })).toHaveCount(0);
    await shot(page, 'cashier-dashboard');
    await page.goto('/leads');
    await expect(page.getByRole('heading', { name: 'Ruxsat yo‘q' })).toBeVisible();
  });
});

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('bottom navigation, menu drawer and context sheet', async ({ page }) => {
    await signIn(page, fixtures().owner);
    await shot(page, 'select-organization');
    await page.getByRole('button', { name: /Jony Math Academy/ }).click();
    await page.getByRole('button', { name: /Termiz/ }).click();
    await expect(page.getByRole('heading', { name: 'Salom, Xusanjon' })).toBeVisible();

    const tabBar = page.getByRole('navigation', { name: 'Asosiy menyu' }).last();
    await expect(tabBar.getByRole('link', { name: 'Bosh sahifa' })).toBeVisible();
    await expect(page.locator('aside')).toBeHidden(); // no desktop sidebar squeezed in
    await shot(page, 'dashboard');

    await page.getByRole('button', { name: 'Yana' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('link', { name: 'Sozlamalar' })).toBeVisible();
    await shot(page, 'menu-drawer');
    await drawer.getByRole('button', { name: 'Yopish' }).click();

    await page.getByRole('button', { name: /Markazni almashtirish/ }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Denov' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Denov' }).click();
    await expect(page.getByRole('banner')).toContainText('Denov');
  });
});
