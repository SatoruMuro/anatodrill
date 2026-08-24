import { expect, test } from '@playwright/test';

test('focused drill presets cap the session at 10 and 20 questions', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'ホーム' }).click();
  await page.getByRole('button', { name: 'ドリル' }).click();

  await expect(page.getByLabel('問題数・出題方式')).toHaveValue('today10');
  await expect(page.getByText('出題 10問')).toBeVisible();
  await page.getByRole('button', { name: 'ドリル開始' }).click();
  await expect(page.getByText('1 / 10')).toBeVisible();

  await page.getByRole('button', { name: 'ホーム' }).click();
  await page.getByRole('button', { name: 'ドリル' }).click();
  await page.getByLabel('問題数・出題方式').selectOption('twenty');
  await expect(page.getByText('出題 20問')).toBeVisible();
  await page.getByRole('button', { name: 'ドリル開始' }).click();
  await expect(page.getByText('1 / 20')).toBeVisible();
});

test('region, category, format, and language filters are available on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: 'ドリル' }).click();

  await page.getByLabel('表示言語').selectOption('japanese');
  await page.getByLabel('解剖学的部位').selectOption('upper_limb');
  await page.getByLabel('構造カテゴリ').selectOption('bone');
  await page.getByLabel('問題形式').selectOption('numbered_plate');

  await expect(page.getByLabel('表示言語')).toHaveValue('japanese');
  await expect(page.getByLabel('解剖学的部位')).toHaveValue('upper_limb');
  await expect(page.getByLabel('構造カテゴリ')).toHaveValue('bone');
  await expect(page.getByLabel('問題形式')).toHaveValue('numbered_plate');
  await expect(page.getByText(/フィルタ対象 \d+問/)).toBeVisible();

  const documentWidth = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.innerWidth);
});

test('new answers are stored in the question modality', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'ドリル' }).click();
  await page.getByLabel('問題形式').selectOption('text');
  await page.getByRole('button', { name: 'ドリル開始' }).click();
  await page.locator('.choice-button').first().click();

  await expect.poll(async () => page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('anatodrill.learningData.v2') ?? 'null');
    return Object.values<{ modality: string }>(data.progress).map((record) => record.modality);
  })).toContain('text');
  const modalities = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('anatodrill.learningData.v2') ?? 'null');
    return Object.values<{ modality: string }>(data.progress).map((record) => record.modality);
  });
  expect(modalities).not.toContain('image');
});
