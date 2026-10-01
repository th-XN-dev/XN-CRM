import { expect, type Page, test } from '@playwright/test';
import { fixtures, shot, signIn, unique } from './helpers';

const NEW_PASSWORD = 'director-own-password';

async function signInAs(page: Page, login: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email yoki telefon').fill(login);
  await page.getByLabel('Parol', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Kirish' }).click();
}

async function signInOwner(page: Page): Promise<void> {
  await signIn(page, fixtures().platformOwner);
  await expect(page).toHaveURL(/\/owner$/);
}

/**
 * Owner → Center → Director → Sub-center → Branch → Staff, the center
 * lifecycle as members experience it, and the owner area staying closed.
 */
test.describe.serial('management hierarchy (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');
  const id = unique();
  const centerName = `E2E Center ${id}`;
  const directorEmail = `director.${id}@e2e.xn.uz`;
  let temporaryPassword = '';

  test('owner creates a center with its director in the wizard', async ({ page }) => {
    await signIn(page, fixtures().platformOwner);
    await expect(page).toHaveURL(/\/owner$/);
    await expect(page.getByRole('heading', { name: 'Salom, Platform' })).toBeVisible();
    await shot(page, 'owner-dashboard');

    await page.getByRole('button', { name: 'Yangi markaz' }).first().click();
    await page.getByLabel('Markaz', { exact: true }).fill(centerName);
    await page.getByLabel(/Manzil \(slug\)/).fill(`e2e-${id}`);
    await page.getByRole('button', { name: 'Keyingi' }).click();
    await expect(page.getByLabel('Asosiy rang')).toHaveValue('#4F46E5');
    await page.getByRole('button', { name: 'Keyingi' }).click();

    // Director step: an email or phone is required.
    await page.getByRole('button', { name: 'Keyingi' }).click();
    await expect(page.getByText('Majburiy maydon').or(page.getByText(/to‘ldirilishi shart/)).first()).toBeVisible();
    await page.getByLabel('To‘liq ism').fill(`Director ${id}`);
    await page.getByLabel('Email', { exact: true }).fill(directorEmail);
    await page.getByRole('button', { name: 'Keyingi' }).click();
    await page.getByRole('button', { name: 'Keyingi' }).click(); // activation period: from today, open-ended
    await expect(page.getByText(centerName)).toBeVisible(); // review
    await page.getByRole('button', { name: 'Markazni yaratish' }).click();

    await expect(page.getByText('Markaz muvaffaqiyatli yaratildi.')).toBeVisible();
    await expect(page.getByTestId('credentials-login')).toHaveText(directorEmail);
    temporaryPassword = (await page.getByTestId('credentials-password').textContent())?.trim() ?? '';
    expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    await shot(page, 'owner-center-created');

    await page.getByRole('button', { name: 'Markazni ochish' }).click();
    await expect(page.getByRole('heading', { name: centerName })).toBeVisible();
    await expect(page.getByText('Ishlamoqda').first()).toBeVisible();
  });

  test('a frozen center locks its people out until the owner activates it', async ({ page, browser }) => {
    await signInOwner(page);
    await page.goto('/owner/centers');
    await page.getByRole('link', { name: new RegExp(centerName) }).click();
    await page.getByRole('button', { name: 'Muzlatish' }).click();
    const freeze = page.getByRole('dialog', { name: `${centerName} muzlatilsinmi?` });
    await freeze.getByLabel(/Sabab/).fill('E2E: to‘lov kechikdi');
    await freeze.getByRole('button', { name: 'Muzlatish' }).click();
    await expect(page.getByText('Muzlatilgan').first()).toBeVisible();

    const director = await browser.newPage();
    await signInAs(director, directorEmail, temporaryPassword);
    await expect(director.getByText('Ushbu markaz vaqtincha muzlatilgan. Administrator bilan bog‘laning.')).toBeVisible();
    await shot(director, 'frozen-center-login');
    await director.close();

    await page.getByRole('button', { name: 'Faollashtirish' }).click();
    await page.getByRole('dialog', { name: `${centerName} faollashtirilsinmi?` }).getByRole('button', { name: 'Faollashtirish' }).click();
    await expect(page.getByText('Ishlamoqda').first()).toBeVisible();
  });

  test('the director replaces the temporary password and builds the structure', async ({ page }) => {
    await signInAs(page, directorEmail, temporaryPassword);
    await expect(page.getByRole('heading', { name: 'Parolingizni tanlang' })).toBeVisible();
    await page.getByLabel('Joriy parol').fill(temporaryPassword);
    await page.getByLabel('Yangi parol', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Yangi parolni takrorlang').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Saqlash va davom etish' }).click();

    // A brand-new center has no branches yet: the first one is added on the spot.
    await expect(page.getByRole('heading', { name: 'Bu markazda hali filial yo‘q' })).toBeVisible();
    await page.getByLabel('Filial nomi').fill('Bosh ofis');
    await page.getByLabel('Qisqa kod').fill('HQ');
    await page.getByRole('button', { name: 'Filial qo‘shish' }).click();
    await expect(page.getByRole('heading', { name: `Salom, Director` })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Asosiy menyu' }).first();
    for (const link of ['Markaz', 'Sub-markazlar', 'Filiallar', 'Tahlil']) {
      await expect(nav.getByRole('link', { name: link, exact: true })).toBeVisible();
    }

    await nav.getByRole('link', { name: 'Sub-markazlar' }).click();
    await page.getByRole('button', { name: 'Yangi sub-markaz' }).first().click();
    let dialog = page.getByRole('dialog', { name: 'Yangi sub-markaz' });
    await dialog.getByLabel('Nomi').fill('Kids English');
    await dialog.getByLabel('Kod').fill('KIDS');
    await dialog.getByRole('button', { name: 'Saqlash' }).click();
    await expect(page.getByRole('heading', { name: 'Kids English' })).toBeVisible();

    await page.getByRole('button', { name: 'Filial qo‘shish' }).click();
    dialog = page.getByRole('dialog', { name: 'Yangi filial' });
    await dialog.getByLabel('Filial nomi').fill('Kids 1');
    await dialog.getByLabel('Kod').fill('KD1');
    await expect(dialog.getByLabel('Sub-markaz')).toHaveValue(/.+/);
    await dialog.getByRole('button', { name: 'Saqlash' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Kids 1' }).first()).toBeVisible();
    await shot(page, 'sub-centers');

    await nav.getByRole('link', { name: 'Filiallar' }).click();
    await expect(page.getByRole('cell', { name: 'Kids English' }).or(page.getByText('Kids English')).first()).toBeVisible();

    await nav.getByRole('link', { name: 'Tahlil' }).click();
    await expect(page.getByRole('heading', { name: 'Tahlil', level: 1 })).toBeVisible();
    await expect(page.getByText('Filiallar bo‘yicha')).toBeVisible();
    await shot(page, 'center-analytics');
  });

  test('the director adds a staff member, who gets a one-time password', async ({ page }) => {
    await signInAs(page, directorEmail, NEW_PASSWORD);
    // Two branches now: the director chooses where to work (here: all of them).
    await page.getByRole('button', { name: /Barcha filiallar/ }).click();
    await expect(page.getByRole('heading', { name: 'Salom, Director' })).toBeVisible();
    await page.goto('/settings/users');
    await page.getByRole('button', { name: 'Xodim qo‘shish' }).click();
    const dialog = page.getByRole('dialog', { name: 'Xodim qo‘shish' });
    await dialog.getByLabel('To‘liq ism').fill(`Manager ${id}`);
    await dialog.getByLabel('Email', { exact: true }).fill(`manager.${id}@e2e.xn.uz`);
    await dialog.getByLabel('Rol').selectOption('MANAGER');
    await dialog.getByLabel('Kids 1').check();
    await dialog.getByRole('button', { name: 'Saqlash' }).click();
    const credentials = page.getByRole('dialog', { name: 'Kirish ma’lumotlari' });
    await expect(credentials.getByTestId('credentials-password')).toHaveText(/^[A-Za-z0-9]{12}$/);
    await credentials.getByRole('button', { name: 'Tayyor' }).click();
    await expect(page.getByRole('cell', { name: new RegExp(`Manager ${id}`) })).toBeVisible();
  });

  test('the owner area stays closed to center people', async ({ page }) => {
    await signIn(page, fixtures().manager);
    await expect(page.getByRole('heading', { name: 'Salom, Malika' })).toBeVisible();
    await page.goto('/owner/centers');
    await expect(page).not.toHaveURL(/\/owner/);
    await expect(page.getByRole('heading', { name: 'Salom, Malika' })).toBeVisible();
  });

  test('owner selects the center, archives it and deletes it permanently', async ({ page }) => {
    await signInOwner(page);
    await page.goto('/owner/centers');
    await page.getByRole('searchbox').first().fill(centerName);
    const row = page.getByRole('checkbox', { name: `Tanlash: ${centerName}` });
    await row.check();
    await expect(page.getByText('1 ta tanlandi')).toBeVisible();

    // Deleting an active center first asks to archive it.
    await page.getByRole('button', { name: 'Butunlay o‘chirish' }).click();
    let dialog = page.getByRole('dialog', { name: `${centerName} butunlay o‘chirilsinmi?` });
    await expect(dialog.getByText('Faqat arxivlangan markazni o‘chirish mumkin. Avval arxivlang.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Avval ularni arxivlash' }).click();
    await expect(page.getByText('1 ta markaz arxivlandi')).toBeVisible();

    dialog = page.getByRole('dialog', { name: `${centerName} butunlay o‘chirilsinmi?` });
    const submit = dialog.getByRole('button', { name: 'Butunlay o‘chirish' });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel(/Tasdiqlash uchun/).fill(`e2e-${id}`);
    await shot(page, 'delete-center');
    await submit.click();
    await expect(page.getByText(`${centerName} o‘chirildi`)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: `Tanlash: ${centerName}` })).toHaveCount(0);
  });

  test('profile: the owner renames themself and sees signed-in devices', async ({ page }) => {
    await signInOwner(page);
    await page.getByRole('button', { name: 'Hisob' }).click();
    await page.getByRole('menuitem', { name: 'Profil' }).click();
    await expect(page.getByRole('heading', { name: 'Profil', level: 1 })).toBeVisible();
    await expect(page.getByText('Shu qurilma')).toBeVisible();
    await page.getByLabel('To‘liq ism').fill('Platform Owner');
    await page.getByRole('button', { name: 'Saqlash' }).first().click();
    await expect(page.getByText('Profil saqlandi')).toBeVisible();
  });
});

test.describe('owner area on phones', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('no horizontal scrolling; the menu opens from the header', async ({ page }) => {
    await signIn(page, fixtures().platformOwner);
    await expect(page).toHaveURL(/\/owner$/);
    for (const route of ['/owner', '/owner/centers', '/owner/directors', '/owner/analytics', '/owner/platform', '/owner/profile', '/owner/centers/new']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect({ route, overflow }).toEqual({ route, overflow: 0 });
    }
    await page.getByRole('button', { name: 'Egasi menyusi' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Markazlar' }).click();
    await expect(page.getByRole('heading', { name: 'Markazlar', level: 1 })).toBeVisible();
    await shot(page, 'owner-centers');
  });
});
