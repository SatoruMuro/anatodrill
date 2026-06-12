import type { LearningData, TermProgress, TestAttempt } from '../types/anatodrill';
import { APP_NAME, APP_VERSION } from './constants';
import { createEmptyLearningData } from './progress';

const STORAGE_KEY = 'anatodrill.learningData.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidProgress(value: unknown, knownTermIds: Set<string>): value is TermProgress {
  if (!isRecord(value)) {
    return false;
  }

  const termId = value.termId;
  const level = value.level;
  return (
    typeof termId === 'string' &&
    knownTermIds.has(termId) &&
    typeof value.correctCount === 'number' &&
    Number.isFinite(value.correctCount) &&
    value.correctCount >= 0 &&
    typeof value.wrongCount === 'number' &&
    Number.isFinite(value.wrongCount) &&
    value.wrongCount >= 0 &&
    (typeof value.lastAnsweredAt === 'string' || value.lastAnsweredAt === null) &&
    (typeof value.nextReviewAt === 'string' || value.nextReviewAt === null) &&
    typeof level === 'number' &&
    Number.isInteger(level) &&
    level >= 0 &&
    level <= 5
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeAttempt(value: unknown): TestAttempt | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const studentId = stringValue(value.studentId);
  const testSetId = stringValue(value.testSetId) ?? stringValue(value.testSet);
  const testSetTitleJa = stringValue(value.testSetTitleJa) ?? testSetId;
  const testSetVersion = stringValue(value.testSetVersion) ?? 'unknown';
  const completedAt = stringValue(value.completedAt);
  const total = finiteNumber(value.total);
  const correct = finiteNumber(value.correct);
  const score = finiteNumber(value.score);
  const passingScore = finiteNumber(value.passingScore) ?? 80;
  const durationSeconds = finiteNumber(value.durationSeconds);
  const certificateId = stringValue(value.certificateId) ?? id;
  const appVersion = stringValue(value.appVersion);

  if (
    !id ||
    !name ||
    !studentId ||
    !testSetId ||
    !testSetTitleJa ||
    !testSetVersion ||
    !completedAt ||
    total === null ||
    total < 0 ||
    correct === null ||
    correct < 0 ||
    score === null ||
    score < 0 ||
    score > 100 ||
    passingScore < 0 ||
    passingScore > 100 ||
    typeof value.passed !== 'boolean' ||
    durationSeconds === null ||
    durationSeconds < 0 ||
    !certificateId ||
    !appVersion
  ) {
    return null;
  }

  return {
    id,
    name,
    studentId,
    testSetId,
    testSetTitleJa,
    testSetVersion,
    completedAt,
    total,
    correct,
    score,
    passingScore,
    passed: value.passed,
    durationSeconds,
    certificateId,
    appVersion,
  };
}

export function validateLearningData(value: unknown, knownTermIds: Set<string>): LearningData | null {
  if (!isRecord(value) || !isRecord(value.progress) || !Array.isArray(value.attempts)) {
    return null;
  }

  const progressEntries = Object.entries(value.progress);
  const progress: Record<string, TermProgress> = {};
  for (const [key, record] of progressEntries) {
    if (!isValidProgress(record, knownTermIds) || key !== record.termId) {
      return null;
    }
    progress[key] = record;
  }

  const attempts: TestAttempt[] = [];
  for (const attempt of value.attempts as unknown[]) {
    const normalized = normalizeAttempt(attempt);
    if (!normalized) {
      return null;
    }
    attempts.push(normalized);
  }

  return {
    progress,
    attempts,
  };
}

export function loadLearningData(knownTermIds: Set<string>): LearningData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createEmptyLearningData();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return validateLearningData(parsed, knownTermIds) ?? createEmptyLearningData();
  } catch {
    return createEmptyLearningData();
  }
}

export function saveLearningData(data: LearningData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function buildBackup(data: LearningData) {
  return {
    appName: APP_NAME,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function parseBackupFile(value: unknown, knownTermIds: Set<string>): LearningData | null {
  const candidate = isRecord(value) && 'data' in value ? value.data : value;
  return validateLearningData(candidate, knownTermIds);
}
