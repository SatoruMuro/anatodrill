import type { CertificatePayload, TestAttempt, TestResultRecord } from '../types/anatodrill';

const RESULT_FIELDS: Array<keyof TestResultRecord> = [
  'appVersion',
  'certificateId',
  'name',
  'studentId',
  'testSetId',
  'testSetTitleJa',
  'testSetVersion',
  'dateTime',
  'totalQuestions',
  'correctAnswers',
  'scorePercentage',
  'passingScore',
  'pass',
  'durationSeconds',
];

function downloadText(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildTestResultRecord(attempt: TestAttempt): TestResultRecord {
  return {
    appVersion: attempt.appVersion,
    certificateId: attempt.certificateId,
    name: attempt.name,
    studentId: attempt.studentId,
    testSetId: attempt.testSetId,
    testSetTitleJa: attempt.testSetTitleJa,
    testSetVersion: attempt.testSetVersion,
    dateTime: attempt.completedAt,
    totalQuestions: attempt.total,
    correctAnswers: attempt.correct,
    scorePercentage: attempt.score,
    passingScore: attempt.passingScore,
    pass: attempt.passed,
    durationSeconds: attempt.durationSeconds,
  };
}

export function buildCertificatePayload(attempt: TestAttempt): CertificatePayload {
  return {
    certificateId: attempt.certificateId,
    participant: {
      name: attempt.name,
      studentId: attempt.studentId,
    },
    testSetId: attempt.testSetId,
    testSetTitleJa: attempt.testSetTitleJa,
    testSetVersion: attempt.testSetVersion,
    completedAt: attempt.completedAt,
    total: attempt.total,
    correct: attempt.correct,
    score: attempt.score,
    passingScore: attempt.passingScore,
    passed: attempt.passed,
    appVersion: attempt.appVersion,
  };
}

export function testResultFileStem(attempt: TestAttempt): string {
  const datePart = attempt.completedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `anatodrill-result-${attempt.testSetId}-${datePart}`;
}

export function downloadTestResultJson(attempt: TestAttempt): void {
  const record = buildTestResultRecord(attempt);
  downloadText(`${testResultFileStem(attempt)}.json`, JSON.stringify(record, null, 2), 'application/json');
}

export function downloadTestResultCsv(attempt: TestAttempt): void {
  const record = buildTestResultRecord(attempt);
  const header = RESULT_FIELDS.join(',');
  const row = RESULT_FIELDS.map((field) => csvEscape(record[field])).join(',');
  downloadText(`${testResultFileStem(attempt)}.csv`, `${header}\n${row}\n`, 'text/csv;charset=utf-8');
}
