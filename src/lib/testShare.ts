import type { TestAttempt } from '../types/anatodrill';
import { choiceLanguageModeLabel } from './choiceLanguage';

export const ANATODRILL_HOME_URL = 'https://satorumuro.github.io/anatodrill/';
export const ANATODRILL_SHARE_HASHTAG = '#AnatoDrill';

const SHARE_CARD_SIZE = 1080;
const SHARE_CARD_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif';

function shareResultLabel(attempt: TestAttempt): string {
  return attempt.passed ? '合格' : '未合格';
}

export function buildTestResultShareText(attempt: TestAttempt, includeName: boolean): string {
  const lines = ['AnatoDrillの全範囲テストに挑戦しました！'];
  const name = attempt.name.trim();

  if (includeName && name) {
    lines.push(`${name}さんの結果`);
  }

  lines.push(
    `スコア：${attempt.score}%（${attempt.correct}/${attempt.total}問正解）`,
    `判定：${shareResultLabel(attempt)}`,
    `選択肢：${choiceLanguageModeLabel(attempt.choiceLanguageMode)}`,
    '',
    'あなたと通る、アナトドリル',
    ANATODRILL_HOME_URL,
    ANATODRILL_SHARE_HASHTAG,
  );

  return lines.join('\n');
}

export function buildXShareUrl(attempt: TestAttempt, includeName: boolean): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(buildTestResultShareText(attempt, includeName))}`;
}

export function buildThreadsShareUrl(attempt: TestAttempt, includeName: boolean): string {
  return `https://www.threads.com/intent/post?text=${encodeURIComponent(
    buildTestResultShareText(attempt, includeName),
  )}`;
}

export function buildFacebookShareUrl(): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(ANATODRILL_HOME_URL)}`;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  let fitted = text;
  while (fitted.length > 1 && context.measureText(`${fitted}…`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted}…`;
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [, base64 = ''] = dataUrl.split(',');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], fileName, { type: 'image/png' });
}

export function createTestResultShareCard(attempt: TestAttempt, includeName: boolean): File {
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_CARD_SIZE;
  canvas.height = SHARE_CARD_SIZE;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('結果画像を作成できませんでした。');
  }

  const name = attempt.name.trim();
  const resultColor = attempt.passed ? '#0d6b5f' : '#a33a2b';

  context.fillStyle = '#f4f8f6';
  context.fillRect(0, 0, SHARE_CARD_SIZE, SHARE_CARD_SIZE);

  const gradient = context.createLinearGradient(0, 0, SHARE_CARD_SIZE, SHARE_CARD_SIZE);
  gradient.addColorStop(0, 'rgba(13, 107, 95, 0.16)');
  gradient.addColorStop(1, 'rgba(241, 208, 122, 0.18)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, SHARE_CARD_SIZE, SHARE_CARD_SIZE);

  context.fillStyle = '#ffffff';
  roundedRect(context, 70, 70, 940, 940, 46);
  context.fill();
  context.strokeStyle = '#c7d6cf';
  context.lineWidth = 3;
  context.stroke();

  context.strokeStyle = '#0d6b5f';
  context.lineWidth = 5;
  roundedRect(context, 120, 118, 120, 120, 24);
  context.stroke();
  context.fillStyle = '#0d6b5f';
  context.font = `900 52px ${SHARE_CARD_FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('AD', 180, 180);

  context.textAlign = 'left';
  context.fillStyle = '#0d6b5f';
  context.font = `800 28px ${SHARE_CARD_FONT}`;
  context.fillText('ANATOMY TERMINOLOGY', 275, 153);
  context.fillStyle = '#17211e';
  context.font = `900 58px ${SHARE_CARD_FONT}`;
  context.fillText('AnatoDrill', 275, 207);

  context.fillStyle = resultColor;
  roundedRect(context, 120, 292, 190, 72, 36);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = `900 34px ${SHARE_CARD_FONT}`;
  context.textAlign = 'center';
  context.fillText(shareResultLabel(attempt), 215, 328);

  context.fillStyle = '#53635e';
  context.font = `800 31px ${SHARE_CARD_FONT}`;
  context.textAlign = 'left';
  context.fillText('全範囲テスト', 342, 329);

  context.fillStyle = resultColor;
  context.font = `900 190px ${SHARE_CARD_FONT}`;
  context.textAlign = 'center';
  context.fillText(`${attempt.score}%`, 540, 515);

  context.fillStyle = '#17211e';
  context.font = `800 38px ${SHARE_CARD_FONT}`;
  context.fillText(`${attempt.correct} / ${attempt.total} 問正解`, 540, 635);

  context.fillStyle = '#53635e';
  context.font = `700 30px ${SHARE_CARD_FONT}`;
  context.fillText(`選択肢：${choiceLanguageModeLabel(attempt.choiceLanguageMode)}`, 540, 694);

  if (includeName && name) {
    context.fillStyle = '#17211e';
    context.font = `800 34px ${SHARE_CARD_FONT}`;
    context.fillText(fitText(context, `${name} さん`, 800), 540, 762);
  }

  context.strokeStyle = '#dce5e1';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(120, 815);
  context.lineTo(960, 815);
  context.stroke();

  context.fillStyle = '#17211e';
  context.font = `900 39px ${SHARE_CARD_FONT}`;
  context.fillText('あなたと通る、アナトドリル', 540, 873);

  context.fillStyle = '#0d6b5f';
  context.font = `800 27px ${SHARE_CARD_FONT}`;
  context.fillText(ANATODRILL_HOME_URL, 540, 927);
  context.fillText(ANATODRILL_SHARE_HASHTAG, 540, 967);

  return dataUrlToFile(
    canvas.toDataURL('image/png'),
    `AnatoDrill-result-${attempt.score}percent.png`,
  );
}

export function downloadTestResultShareCard(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function copyTestResultShareText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand('copy');
  textArea.remove();

  if (!copied) {
    throw new Error('共有文をコピーできませんでした。');
  }
}
