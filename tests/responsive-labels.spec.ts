import { expect, test } from '@playwright/test';

async function openQuestionPreview(page: import('@playwright/test').Page, questionType: string) {
  await page.goto('./');
  await page.getByRole('button', { name: '問題一覧', exact: true }).click();
  await page.getByLabel('問題タイプ').selectOption(questionType);

  const firstQuestion = page.locator('.question-review-card').first();
  await firstQuestion.getByRole('button', { name: 'この問題を試す', exact: true }).click();
  return page.getByRole('dialog', { name: '問題プレビュー' }).locator('.question-card');
}

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

test('mobile numbered image questions repeat the prompt between the image and choices', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const questionCard = await openQuestionPreview(page, 'image_number_mcq');

  const formalPrompt = questionCard.locator('h3');
  await expect(formalPrompt).toHaveText(/^図中の「[^」]+」で示す構造はどれか。$/);
  const formalText = (await formalPrompt.textContent())?.trim() ?? '';
  const label = formalText.match(/^図中の「([^」]+)」で示す構造はどれか。$/)?.[1];
  expect(label).toBeTruthy();

  const image = questionCard.locator('.image-question');
  const answerPrompt = questionCard.locator('.answer-prompt');
  const choiceGroup = questionCard.locator('.choice-grid');
  const firstChoice = choiceGroup.locator('.choice-button').first();

  await expect(image.locator('img')).toHaveJSProperty('complete', true);
  await expect(answerPrompt).toHaveText(`「${label}」で示す構造はどれか？`);

  const order = await questionCard.evaluate((card) => {
    const imageElement = card.querySelector('.image-question');
    const promptElement = card.querySelector('.answer-prompt');
    const choiceElement = card.querySelector('.choice-button');
    if (!imageElement || !promptElement || !choiceElement) {
      throw new Error('Expected image, answer prompt, and choice elements.');
    }
    return {
      imageBeforePrompt: Boolean(imageElement.compareDocumentPosition(promptElement) & Node.DOCUMENT_POSITION_FOLLOWING),
      promptBeforeChoice: Boolean(promptElement.compareDocumentPosition(choiceElement) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  expect(order).toEqual({ imageBeforePrompt: true, promptBeforeChoice: true });

  const imageBox = await image.boundingBox();
  const promptBox = await answerPrompt.boundingBox();
  const firstChoiceBox = await firstChoice.boundingBox();
  expect(imageBox).not.toBeNull();
  expect(promptBox).not.toBeNull();
  expect(firstChoiceBox).not.toBeNull();
  expect(promptBox!.y).toBeGreaterThanOrEqual(imageBox!.y + imageBox!.height);
  const promptChoiceGap = firstChoiceBox!.y - (promptBox!.y + promptBox!.height);
  expect(promptChoiceGap).toBeGreaterThanOrEqual(0);
  expect(promptChoiceGap).toBeLessThanOrEqual(12);

  await answerPrompt.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const visibleTogether = await Promise.all([answerPrompt, firstChoice].map((element) => element.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  })));
  expect(visibleTogether).toEqual([true, true]);

  const promptId = await answerPrompt.getAttribute('id');
  expect(promptId).toBeTruthy();
  await expect(choiceGroup).toHaveAttribute('aria-labelledby', promptId!);
  await expect(choiceGroup).not.toHaveAttribute('aria-label', '解答選択肢');
});

test('single image questions use the shared repeated prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const questionCard = await openQuestionPreview(page, 'single_image_mcq');

  const answerPrompt = questionCard.locator('.answer-prompt');
  await expect(questionCard.locator('h3')).toHaveText('この構造物はどれか。');
  await expect(answerPrompt).toHaveText('この構造物はどれか？');

  const choiceGroup = questionCard.locator('.choice-grid');
  const promptId = await answerPrompt.getAttribute('id');
  expect(promptId).toBeTruthy();
  await expect(choiceGroup).toHaveAttribute('aria-labelledby', promptId!);
});

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
