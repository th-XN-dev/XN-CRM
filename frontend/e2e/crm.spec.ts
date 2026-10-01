import { expect, test } from '@playwright/test';
import { fixtures, ownerInTermiz, pick, shot, signIn, unique } from './helpers';

/**
 * A working day in the CRM against the real API: a new family and student,
 * enrollment, attendance, an invoice and a payment, debtors, a lead converted
 * into a student, a task, the cash desk and global search.
 */
test.describe('daily work (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('student → group → attendance → invoice → payment → debtors', async ({ page }) => {
    const id = unique();
    const surname = `Karimov${id}`;
    await ownerInTermiz(page);
    await shot(page, 'dashboard-phase2');

    // New student together with a new family, in one dialog.
    await page.getByRole('navigation', { name: 'Asosiy menyu' }).getByRole('link', { name: 'Talabalar' }).click();
    await page.getByRole('button', { name: 'Yangi talaba' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yangi talaba' });
    await dialog.getByText('Yangi oila').click();
    await dialog.getByLabel('Oila nomi').fill(`${surname}lar`);
    await dialog.getByLabel('Ota-ona telefoni').fill('90 123 45 67');
    await dialog.getByLabel('Familiyasi').fill(surname);
    await dialog.getByLabel('Ismi', { exact: true }).fill('Ali');
    await shot(page, 'student-form');
    await dialog.getByRole('button', { name: 'Saqlash' }).click();
    await expect(page.getByRole('heading', { name: `${surname} Ali` })).toBeVisible();
    await expect(page.getByText('Guruhda emas').first()).toBeVisible();

    // Enroll: the group list shows free seats.
    await page.getByRole('button', { name: 'Guruhga yozish' }).click();
    await pick(page, 'Guruh', 'English', new RegExp(fixtures().groupName));
    await page.getByRole('dialog').getByRole('button', { name: 'Guruhga yozish' }).click();
    await expect(page.getByText(`${fixtures().groupName} guruhiga yozildi`)).toBeVisible();
    await expect(page.getByRole('link', { name: fixtures().groupName }).first()).toBeVisible();
    await shot(page, 'student-page');

    // Attendance for today's lesson.
    await page.getByRole('navigation', { name: 'Asosiy menyu' }).getByRole('link', { name: 'Davomat' }).click();
    await page.getByRole('button', { name: new RegExp(fixtures().groupName) }).first().click();
    const row = page.getByRole('group', { name: `${surname} Ali` });
    await row.getByText('Kechikdi').click();
    await shot(page, 'attendance');
    await page.getByRole('button', { name: 'Saqlash' }).click();
    await expect(page.getByText('Davomat saqlandi')).toBeVisible();

    // Invoice and a partial card payment; the toast states the invoice's new status.
    await page.goto('/students');
    await page.getByRole('searchbox', { name: /qidirish/i }).fill(surname);
    await page.getByRole('link', { name: `${surname} Ali` }).click();
    await page.getByRole('tab', { name: 'Moliya' }).click();
    await page.getByRole('button', { name: 'Yangi hisob-faktura' }).click();
    const invoice = page.getByRole('dialog', { name: 'Yangi hisob-faktura' });
    await invoice.getByLabel('Summa').fill('450000');
    await expect(invoice.getByText(/To‘lanadigan:/)).toContainText('450');
    await invoice.getByRole('button', { name: 'Hisob yaratish' }).click();
    await expect(page.getByText(/hisob-faktura yaratildi/)).toBeVisible();

    await page.getByRole('button', { name: 'To‘lov qabul qilish' }).click();
    const payment = page.getByRole('dialog', { name: 'To‘lov qabul qilish' });
    await pick(page, 'Hisob-faktura', '', new RegExp(`${surname}lar`));
    await expect(payment.getByLabel('Summa')).toHaveValue(/450/);
    await payment.getByLabel('Summa').fill('200000');
    await payment.getByText('Karta').click();
    await shot(page, 'payment-form');
    await payment.getByRole('button', { name: 'Davom etish' }).click();
    // Step 2: the summary to confirm — amount, invoice, method.
    await expect(payment.getByText('Qabul qilinadi')).toBeVisible();
    await expect(payment.getByText(/200\s000\s+so‘m/)).toBeVisible();
    await expect(payment.locator('dd', { hasText: 'Karta' })).toBeVisible();
    await shot(page, 'payment-review');
    await payment.getByRole('button', { name: 'Tasdiqlash va qabul qilish' }).click();
    await expect(page.getByText(/qabul qilindi\. Hisob holati: Qisman to‘langan/)).toBeVisible();

    // Debtors: the family appears with what is left; opening it shows the student line.
    await page.goto('/finance/debtors');
    await page.getByRole('searchbox').fill(surname);
    const family = page.getByRole('button', { name: new RegExp(`${surname}lar`) });
    await expect(family).toContainText('250');
    await family.click();
    await expect(page.getByRole('link', { name: `${surname} Ali` })).toBeVisible();
    await shot(page, 'debtors');
  });

  test('lead → pipeline → conversion into a family and a student', async ({ page }) => {
    const id = unique();
    await ownerInTermiz(page);
    await page.goto('/leads');
    await page.getByRole('button', { name: 'Yangi lid' }).first().click();
    const form = page.getByRole('dialog', { name: 'Yangi lid' });
    await form.getByLabel('Ismi').fill(`Dilnoza Saidova${id}`);
    await form.getByLabel('Telefon', { exact: true }).fill(`+99893${Math.floor(1_000_000 + Math.random() * 8_999_999)}`);
    await form.getByRole('button', { name: 'Saqlash' }).click();
    await expect(page.getByRole('heading', { name: `Dilnoza Saidova${id}` })).toBeVisible();

    await page.getByPlaceholder('Nima haqida gaplashdingiz?').fill('Ingliz tili, ertalabki guruh');
    await page.getByRole('button', { name: 'Qo‘shish' }).click();
    await expect(page.getByText('Ingliz tili, ertalabki guruh')).toBeVisible();

    await page.goto('/leads?view=pipeline');
    await expect(page.getByRole('region', { name: 'Yangi' }).getByText(`Dilnoza Saidova${id}`)).toBeVisible();
    await shot(page, 'pipeline');
    await page.getByRole('button', { name: `Dilnoza Saidova${id}ni ko‘chirish` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ko‘chirish' }).click();
    await expect(page.getByRole('region', { name: 'Bog‘lanildi' }).getByText(`Dilnoza Saidova${id}`)).toBeVisible();

    await page.getByRole('link', { name: `Dilnoza Saidova${id}` }).click();
    await page.getByRole('button', { name: 'Talabaga aylantirish' }).click();
    const convert = page.getByRole('dialog', { name: 'Talabaga aylantirish' });
    await expect(convert.getByLabel('Familiyasi')).toHaveValue(`Saidova${id}`);
    await shot(page, 'convert');
    await convert.getByRole('button', { name: 'Talabaga aylantirish' }).click();
    const done = page.getByRole('dialog', { name: 'Lid endi talaba' });
    await expect(done).toBeVisible();
    await done.getByRole('link', { name: `Saidova${id} Dilnoza` }).click();
    await expect(page.getByRole('heading', { name: `Saidova${id} Dilnoza` })).toBeVisible();
  });

  test('tasks, schedule, global search and validation messages', async ({ page }) => {
    const id = unique();
    await ownerInTermiz(page);

    await page.goto('/tasks?view=all');
    await page.getByRole('button', { name: 'Yangi vazifa' }).first().click();
    const form = page.getByRole('dialog', { name: 'Yangi vazifa' });
    await form.getByRole('button', { name: 'Saqlash' }).click();
    await expect(form.getByText('Bu maydon to‘ldirilishi shart')).toBeVisible(); // field-level, localized
    await form.getByLabel('Nima qilish kerak').fill(`Qarzdorlarga qo‘ng‘iroq ${id}`);
    await form.getByRole('button', { name: 'Saqlash' }).click();
    await page.getByRole('link', { name: `Qarzdorlarga qo‘ng‘iroq ${id}` }).click();
    await page.getByRole('button', { name: 'Bajarildi' }).click();
    await expect(page.getByText('Holat: Bajarildi')).toBeVisible();

    await page.goto('/schedule');
    await expect(page.getByRole('link', { name: new RegExp(fixtures().groupName) }).first()).toBeVisible();
    await shot(page, 'schedule');

    // Ctrl+K → type → Enter.
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Qidiruv' }).fill(fixtures().groupName);
    await expect(page.getByRole('dialog', { name: 'Qidiruv' }).getByRole('option', { name: new RegExp(fixtures().groupName) })).toBeVisible();
    await shot(page, 'search');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: fixtures().groupName })).toBeVisible();
    await shot(page, 'group-page');

    // A backend conflict is shown on the field, in words: the room is busy at 09:00.
    await page.getByRole('tab', { name: 'Jadval' }).click();
    await page.getByRole('button', { name: 'Dars vaqti qo‘shish' }).click();
    const slot = page.getByRole('dialog', { name: 'Dars vaqti qo‘shish' });
    await slot.getByLabel('Kun').selectOption({ index: (new Date().getDay() + 6) % 7 });
    await slot.getByLabel('Boshlanishi').fill('09:30');
    await slot.getByLabel('Tugashi').fill('10:00');
    await slot.getByRole('button', { name: 'Saqlash' }).click();
    await expect(slot.getByText(/Bu vaqtda (xona band|guruhning boshqa darsi bor|o‘qituvchining boshqa darsi bor)/)).toBeVisible();
  });

  test('cashier: open the cash desk, see the expected balance, close and see the difference', async ({ page }) => {
    await signIn(page, fixtures().cashier);
    await expect(page.getByRole('heading', { name: 'Salom, Bekzod' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Asosiy menyu' }).getByRole('link', { name: 'Moliya' }).click();
    await expect(page.getByRole('link', { name: 'Hisob-fakturalar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Xarajatlar' })).toHaveCount(0); // no expense permission
    await page.getByRole('link', { name: 'Kassa', exact: true }).click();

    // Wait for the desk to load: either the open form or the open session.
    await expect(page.getByRole('heading', { name: /^Kassa(ni oching| ochiq)$/ })).toBeVisible();
    const open = page.getByRole('button', { name: 'Kassani ochish' });
    if (await open.isVisible()) {
      await page.getByLabel('Boshlang‘ich qoldiq').fill('100000');
      await open.click();
    }
    await expect(page.getByRole('heading', { name: 'Kassa ochiq' })).toBeVisible();
    await shot(page, 'cash-open');
    await page.getByRole('button', { name: 'Kassani yopish' }).click();
    const close = page.getByRole('dialog', { name: 'Kassani yopish' });
    await close.getByLabel('Sanalgan').fill('90000');
    await expect(close.getByText('pul yetishmayapti')).toBeVisible();
    await close.getByRole('button', { name: 'Davom etish' }).click();
    await expect(close.getByText('sessiyani qayta ochib bo‘lmaydi')).toBeVisible();
    await close.getByRole('button', { name: 'Tasdiqlash va yopish' }).click();
    await expect(page.getByRole('heading', { name: 'Kassa yopildi' })).toBeVisible();
    await shot(page, 'cash-closed');
  });
});

test.describe('daily work (mobile)', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('lists become cards, filters open in a drawer, forms take the full screen', async ({ page }) => {
    await ownerInTermiz(page);
    await page.goto('/groups');
    await expect(page.getByRole('table')).toBeHidden();
    await expect(page.getByRole('list', { name: 'Guruhlar' }).getByText(fixtures().groupName)).toBeVisible();
    await shot(page, 'groups-cards');

    await page.getByRole('button', { name: 'Filtrlar' }).click();
    const drawer = page.getByRole('dialog', { name: 'Filtrlar' });
    await expect(drawer.getByLabel('Holat')).toBeVisible();
    await shot(page, 'filters-drawer');
    await drawer.getByRole('button', { name: 'Natijalarni ko‘rsatish' }).click();

    await page.goto('/students');
    await page.getByRole('button', { name: 'Yangi talaba' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yangi talaba' });
    const box = await dialog.boundingBox();
    expect(box?.height).toBeGreaterThan(800); // full screen on a phone
    await shot(page, 'student-form');
  });
});
