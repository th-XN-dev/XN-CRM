import { expect, type Page, test } from '@playwright/test';
import { fixtures, ownerInTermiz, pick, shot, signIn, unique } from './helpers';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Asosiy menyu' }).first();

test.describe('roles (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('CEO: dashboard → branch → students → finance → debtors → reports', async ({ page }) => {
    await ownerInTermiz(page);
    await expect(page.getByRole('heading', { name: 'E’tibor talab qiladi' })).toBeVisible();
    await expect(page.getByText('Tushum', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Filial: Termiz/ }).click();
    await page.getByRole('menuitemradio', { name: 'Barcha filiallar' }).click();
    await expect(page.getByLabel('Filial', { exact: true })).toBeVisible(); // dashboard branch filter appears for "all branches"

    for (const [link, heading] of [
      ['Talabalar', 'Talabalar'],
      ['Moliya', 'Moliya'],
    ] as const) {
      await nav(page).getByRole('link', { name: link }).click();
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }
    await page.getByRole('link', { name: 'Qarzdorlar' }).click();
    await expect(page.getByText('Jami qarz')).toBeVisible();
    await nav(page).getByRole('link', { name: 'Hisobotlar' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('manager: day-to-day sections, no organization settings', async ({ page }) => {
    await signIn(page, fixtures().manager);
    await expect(page.getByRole('heading', { name: 'Salom, Malika' })).toBeVisible();
    for (const link of ['Talabalar', 'Guruhlar', 'Davomat', 'Lidlar', 'Vazifalar', 'Moliya']) {
      await expect(nav(page).getByRole('link', { name: link })).toBeVisible();
    }
    await page.goto('/groups');
    await expect(page.getByRole('link', { name: fixtures().groupName })).toBeVisible();
    await page.goto('/settings/brand');
    await expect(page.getByText('Brendni faqat administratorlar o‘zgartira oladi.')).toBeVisible();
  });

  test('teacher: only their own groups, schedule and attendance; money and sales are closed', async ({ page }) => {
    await signIn(page, fixtures().teacher);
    await expect(page.getByRole('heading', { name: 'Salom, Dilnoza' })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Moliya' })).toHaveCount(0);
    await expect(nav(page).getByRole('link', { name: 'Lidlar' })).toHaveCount(0);
    await expect(nav(page).getByRole('link', { name: 'Xodimlar' })).toHaveCount(0);

    await nav(page).getByRole('link', { name: 'Guruhlar' }).click();
    await expect(page.getByRole('link', { name: fixtures().groupName })).toBeVisible();
    await expect(page.getByText(`Math B2 ${fixtures().tag}`)).toHaveCount(0); // someone else's group

    await nav(page).getByRole('link', { name: 'Dars jadvali' }).click();
    await expect(page.getByRole('link', { name: new RegExp(fixtures().groupName) }).first()).toBeVisible();
    await nav(page).getByRole('link', { name: 'Davomat' }).click();
    await expect(page.getByRole('heading', { name: 'Davomat', level: 1 })).toBeVisible();
    await shot(page, 'teacher-attendance');

    await page.goto('/finance');
    await expect(page.getByRole('heading', { name: 'Ruxsat yo‘q' })).toBeVisible();
  });
});

test.describe('safety (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('signing out in one tab signs the other tab out', async ({ page, context }) => {
    await ownerInTermiz(page);
    const second = await context.newPage();
    await second.goto('/students');
    await expect(second.getByRole('heading', { name: 'Talabalar', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Hisob' }).click();
    await page.getByRole('menuitem', { name: 'Chiqish' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(second).toHaveURL(/\/login/);
    await expect(second.getByText('Boshqa oynada tizimdan chiqdingiz.')).toBeVisible();
  });

  test('a half-filled form asks before closing; unchanged forms close at once', async ({ page }) => {
    await ownerInTermiz(page);
    await page.goto('/families');
    await page.getByRole('button', { name: 'Yangi oila' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yangi oila' });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Yangi oila' }).click();
    await dialog.getByLabel('Oila nomi').fill('Yarim');
    await page.keyboard.press('Escape');
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: 'Saqlanmagan o‘zgarishlar bor' }));
    await expect(confirm).toBeVisible();
    await shot(page, 'unsaved-guard');
    await confirm.getByRole('button', { name: 'Bekor qilish' }).click();
    await expect(dialog.getByLabel('Oila nomi')).toHaveValue('Yarim'); // still there
  });

  test('family and group CRUD, refund with review, 404 and forbidden messages', async ({ page }) => {
    const id = unique();
    await ownerInTermiz(page);

    // Family: create → edit.
    await page.goto('/families');
    await page.getByRole('button', { name: 'Yangi oila' }).click();
    let dialog = page.getByRole('dialog', { name: 'Yangi oila' });
    await dialog.getByLabel('Oila nomi').fill(`Saidovlar ${id}`);
    await dialog.getByLabel('Telefon', { exact: true }).fill('93 111 22 33');
    await dialog.getByRole('button', { name: 'Saqlash' }).click();
    await expect(page.getByRole('heading', { name: `Saidovlar ${id}` })).toBeVisible();
    await page.getByRole('button', { name: 'Tahrirlash' }).click();
    dialog = page.getByRole('dialog', { name: 'Oilani tahrirlash' });
    await dialog.getByLabel('Manzil').fill('Termiz, Navoiy 5');
    await dialog.getByRole('button', { name: 'Saqlash' }).click();
    await expect(page.getByText('Termiz, Navoiy 5')).toBeVisible();

    // Group: create.
    await page.goto('/groups');
    await page.getByRole('button', { name: 'Yangi guruh' }).click();
    dialog = page.getByRole('dialog', { name: 'Yangi guruh' });
    await dialog.getByLabel('Guruh nomi').fill(`Evening ${id}`);
    await dialog.getByLabel('Kurs').selectOption({ label: 'English' });
    await dialog.getByRole('button', { name: 'Saqlash' }).click();
    await expect(page.getByRole('heading', { name: `Evening ${id}` })).toBeVisible();
    await expect(page.getByText('0 / 12')).toBeVisible();

    // Invoice + card payment + refund (with its own review step).
    await page.goto('/finance/invoices');
    await page.getByRole('button', { name: 'Yangi hisob-faktura' }).click();
    dialog = page.getByRole('dialog', { name: 'Yangi hisob-faktura' });
    await pick(page, 'Oila', `Saidovlar ${id}`, new RegExp(`Saidovlar ${id}`));
    await dialog.getByLabel('Summa').fill('300000');
    await dialog.getByRole('button', { name: 'Hisob yaratish' }).click();
    await expect(page.getByRole('heading', { name: /^INV-/ })).toBeVisible();
    await page.getByRole('button', { name: 'To‘lov qabul qilish' }).click();
    const pay = page.getByRole('dialog', { name: 'To‘lov qabul qilish' });
    await pay.getByText('Karta').click();
    await pay.getByRole('button', { name: 'Davom etish' }).click();
    await pay.getByRole('button', { name: 'Tasdiqlash va qabul qilish' }).click();
    await expect(page.getByText(/Hisob holati: To‘langan/)).toBeVisible();

    await page.getByRole('button', { name: 'Qaytarish' }).first().click();
    const refund = page.getByRole('dialog', { name: 'To‘lovni qaytarish' });
    await refund.getByLabel('Summa').fill('50000');
    await refund.getByLabel('Sababi').fill('Bir dars bo‘lmadi');
    await refund.getByRole('button', { name: 'Davom etish' }).click();
    await expect(refund.getByText('Qaytariladi')).toBeVisible();
    await shot(page, 'refund-review');
    await refund.getByRole('button', { name: 'Qaytarishni tasdiqlash' }).click();
    await expect(page.getByText(/50\s000\s+so‘m qaytarildi/)).toBeVisible();
    await expect(page.getByText('Qisman to‘langan').first()).toBeVisible(); // debt re-opened

    // Unknown page and a record of another organization.
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { name: 'Sahifa topilmadi' })).toBeVisible();
    await page.goto('/students/00000000-0000-7000-8000-000000000000');
    await expect(page.getByRole('heading', { name: 'Sahifa topilmadi' })).toBeVisible();
  });

  test('offline: a banner explains it, writes are refused with a clear message', async ({ page, context }) => {
    await ownerInTermiz(page);
    await page.goto('/families');
    await page.waitForLoadState('networkidle'); // the dev server may reload once after optimizing dependencies
    await context.setOffline(true);
    await expect(page.getByText('Internet aloqasi uzildi')).toBeVisible();
    await page.getByRole('button', { name: 'Yangi oila' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yangi oila' });
    await dialog.getByLabel('Oila nomi').fill('Offline');
    await dialog.getByLabel('Telefon', { exact: true }).fill('93 000 00 00');
    await dialog.getByRole('button', { name: 'Saqlash' }).click();
    await expect(dialog.getByText(/Server bilan aloqa yo‘q/)).toBeVisible();
    await shot(page, 'offline');
    await context.setOffline(false);
    await expect(page.getByText('Aloqa tiklandi')).toBeVisible();
  });
});

test.describe('mobile layouts', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('no horizontal scrolling on the screens staff use on phones', async ({ page }) => {
    await ownerInTermiz(page);
    const routes = ['/', '/students', '/groups', '/attendance', '/finance', '/finance/debtors', '/finance/cash', '/leads', '/leads?view=pipeline', '/tasks', '/notifications', '/schedule', '/center', '/sub-centers', '/branches', '/analytics', '/profile', '/settings/users', '/settings/roles'];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      // The pipeline board scrolls inside its own container, never the page.
      expect({ route, overflow }).toEqual({ route, overflow: 0 });
    }
    await page.goto('/students');
    await page.getByRole('link', { name: /Karimov/ }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    await shot(page, 'student-detail');
  });
});
