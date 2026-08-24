import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'iPhone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 1000 },
];

for (const viewport of viewports) {
  test(`number labels keep normalized image positions on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    await page.getByRole('button', { name: '図版学習', exact: true }).click();

    const viewer = page.locator('.plate-viewer').first();
    await expect(viewer).toBeVisible();
    await expect(viewer.locator('img')).toHaveJSProperty('complete', true);
    const markers = viewer.locator('.plate-marker');
    await expect(markers.first()).toBeVisible();

    const result = await viewer.evaluate((element) => {
      const image = element.querySelector('img');
      const markerElements = [...element.querySelectorAll<HTMLElement>('.plate-marker')];
      if (!image) throw new Error('Plate image was not rendered.');
      const imageRect = image.getBoundingClientRect();
      const overflow = getComputedStyle(element).overflow;
      const positions = markerElements.map((marker) => {
        const markerRect = marker.getBoundingClientRect();
        const expectedX = imageRect.left + Number(marker.dataset.normalizedX) * imageRect.width;
        const expectedY = imageRect.top + Number(marker.dataset.normalizedY) * imageRect.height;
        return {
          xDifference: Math.abs(markerRect.left + markerRect.width / 2 - expectedX),
          yDifference: Math.abs(markerRect.top + markerRect.height / 2 - expectedY),
          centerInsideImage:
            expectedX >= imageRect.left && expectedX <= imageRect.right &&
            expectedY >= imageRect.top && expectedY <= imageRect.bottom,
        };
      });
      return { positions, overflow, viewerRight: element.getBoundingClientRect().right };
    });

    expect(result.positions.length).toBeGreaterThan(0);
    expect(result.overflow).toBe('hidden');
    for (const position of result.positions) {
      expect(position.xDifference).toBeLessThan(2);
      expect(position.yDifference).toBeLessThan(2);
      expect(position.centerInsideImage).toBe(true);
    }
    expect(result.viewerRight).toBeLessThanOrEqual(viewport.width + 0.5);
    await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
  });
}

test('legacy progress migrates conservatively without deleting v1 data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('anatodrill.learningData.v1', JSON.stringify({
      progress: {
        'trilingual::scapula': {
          termId: 'scapula',
          choiceLanguageMode: 'trilingual',
          correctCount: 3,
          wrongCount: 1,
          lastAnsweredAt: '2026-08-20T00:00:00.000Z',
          nextReviewAt: '2026-08-21T00:00:00.000Z',
          level: 2,
        },
      },
      attempts: [],
    }));
  });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '解剖学10問Challenge' })).toBeVisible();

  const stored = await page.evaluate(() => ({
    legacy: localStorage.getItem('anatodrill.learningData.v1'),
    current: JSON.parse(localStorage.getItem('anatodrill.learningData.v2') ?? 'null'),
  }));
  expect(stored.legacy).not.toBeNull();
  expect(stored.current.schemaVersion).toBe(2);
  expect(stored.current.progress['trilingual::text::scapula'].correctCount).toBe(3);
  expect(stored.current.progress['trilingual::image::scapula']).toBeUndefined();
});
