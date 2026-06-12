import { jsPDF } from 'jspdf';
import type { CertificatePayload } from '../types/anatodrill';
import { APP_NAME } from './constants';
import { formatDateTime } from './dates';

const JAPANESE_FONT_FAMILY = 'NotoSansJP';
const REGULAR_FONT_FILE = 'NotoSansJP-Regular.ttf';
const BOLD_FONT_FILE = 'NotoSansJP-Bold.ttf';

interface CertificateFont {
  family: string;
  normalStyle: 'normal';
  boldStyle: 'normal' | 'bold';
  supportsJapanese: boolean;
}

function fontUrl(fileName: string): string {
  return `${import.meta.env.BASE_URL}fonts/${fileName}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function fetchFontAsBase64(fileName: string): Promise<string> {
  const response = await fetch(fontUrl(fileName));
  if (!response.ok) {
    throw new Error(`Failed to load ${fileName}: ${response.status} ${response.statusText}`);
  }

  return arrayBufferToBase64(await response.arrayBuffer());
}

async function registerJapaneseFonts(doc: jsPDF): Promise<CertificateFont> {
  try {
    const regularBase64 = await fetchFontAsBase64(REGULAR_FONT_FILE);
    doc.addFileToVFS(REGULAR_FONT_FILE, regularBase64);
    doc.addFont(REGULAR_FONT_FILE, JAPANESE_FONT_FAMILY, 'normal');

    let boldStyle: CertificateFont['boldStyle'] = 'normal';
    try {
      const boldBase64 = await fetchFontAsBase64(BOLD_FONT_FILE);
      doc.addFileToVFS(BOLD_FONT_FILE, boldBase64);
      doc.addFont(BOLD_FONT_FILE, JAPANESE_FONT_FAMILY, 'bold');
      boldStyle = 'bold';
    } catch (error) {
      console.warn('AnatoDrill PDF: Noto Sans JP bold font could not be loaded. Regular font will be used.', error);
    }

    return {
      family: JAPANESE_FONT_FAMILY,
      normalStyle: 'normal',
      boldStyle,
      supportsJapanese: true,
    };
  } catch (error) {
    console.warn('AnatoDrill PDF: Noto Sans JP font could not be loaded. Falling back to English-only PDF output.', error);
    return {
      family: 'helvetica',
      normalStyle: 'normal',
      boldStyle: 'bold',
      supportsJapanese: false,
    };
  }
}

function asciiFallback(value: string, fallback: string): string {
  return /^[\x20-\x7E]*$/.test(value) && value.trim() ? value : fallback;
}

function certificateRows(payload: CertificatePayload, supportsJapanese: boolean): Array<[string, string]> {
  if (supportsJapanese) {
    return [
      ['氏名', payload.participant.name],
      ['学籍番号', payload.participant.studentId],
      ['テストセット', payload.testSetTitleJa],
      ['テストセットID', payload.testSetId],
      ['Version', payload.testSetVersion],
      ['日時', formatDateTime(payload.completedAt)],
      ['問題数', String(payload.total)],
      ['正答数', String(payload.correct)],
      ['スコア', `${payload.score}%`],
      ['合格基準', `${payload.passingScore}%`],
      ['判定', payload.passed ? '合格' : '未合格'],
      ['証明書ID', payload.certificateId],
      ['アプリバージョン', payload.appVersion],
    ];
  }

  return [
    ['Name', asciiFallback(payload.participant.name, 'Name contains non-Latin characters')],
    ['Student ID', asciiFallback(payload.participant.studentId, 'Student ID contains non-Latin characters')],
    ['Test set', asciiFallback(payload.testSetTitleJa, 'Japanese test set name omitted')],
    ['Test set ID', asciiFallback(payload.testSetId, 'Test set ID contains non-Latin characters')],
    ['Test set version', asciiFallback(payload.testSetVersion, 'Test set version contains non-Latin characters')],
    ['Date and time', formatDateTime(payload.completedAt)],
    ['Number of questions', String(payload.total)],
    ['Correct answers', String(payload.correct)],
    ['Score percentage', `${payload.score}%`],
    ['Passing score', `${payload.passingScore}%`],
    ['Pass/fail result', payload.passed ? 'Pass' : 'Fail'],
    ['Certificate ID', payload.certificateId],
    ['App version', payload.appVersion],
  ];
}

export async function generateCertificatePdf(payload: CertificatePayload): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const font = await registerJapaneseFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 54;
  let y = 72;

  doc.setDrawColor(13, 107, 95);
  doc.setLineWidth(2);
  doc.rect(36, 36, pageWidth - 72, 770);

  doc.setFont(font.family, font.boldStyle);
  doc.setFontSize(18);
  doc.text(APP_NAME, margin, y);

  y += 42;
  doc.setFontSize(22);
  doc.text('Anatomy Terminology Self-Check Certificate', margin, y, {
    maxWidth: pageWidth - margin * 2,
  });

  y += 48;
  doc.setFont(font.family, font.normalStyle);
  doc.setFontSize(12);

  const rows = certificateRows(payload, font.supportsJapanese);

  rows.forEach(([label, value]) => {
    doc.setFont(font.family, font.boldStyle);
    doc.text(`${label}:`, margin, y);
    doc.setFont(font.family, font.normalStyle);
    doc.text(value, margin + 150, y, { maxWidth: pageWidth - margin * 2 - 150 });
    y += 28;
  });

  y += 20;
  doc.setFont(font.family, font.normalStyle);
  doc.setTextColor(80, 80, 80);
  doc.text(
    'This certificate is a self-check record generated by a browser-based learning app. It is not an official academic transcript.',
    margin,
    y,
    { maxWidth: pageWidth - margin * 2 },
  );

  doc.save(`AnatoDrill-certificate-${payload.certificateId}.pdf`);
}
