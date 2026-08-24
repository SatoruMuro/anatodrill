import type { LearningData, LearningModality, TermProgress, TestAttempt } from '../types/anatodrill';
import { isChoiceLanguageMode } from './choiceLanguage';
import { APP_NAME, APP_VERSION } from './constants';
import { createEmptyLearningData, progressKey } from './progress';

const STORAGE_KEY = 'anatodrill.learningData.v2';
const LEGACY_STORAGE_KEY = 'anatodrill.learningData.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLearningModality(value: unknown): value is LearningModality {
  return value === 'text' || value === 'image';
}

function normalizeProgress(value: unknown, knownTermIds: Set<string>, fallbackModality?: LearningModality): TermProgress | null {
  if (!isRecord(value)) return null;

  const termId = value.termId;
  const level = value.level;
  const modality = isLearningModality(value.modality) ? value.modality : fallbackModality;
  const choiceLanguageMode = isChoiceLanguageMode(value.choiceLanguageMode) ? value.choiceLanguageMode : 'bilingual';
  if (
    typeof termId !== 'string' || !knownTermIds.has(termId) || !modality ||
    typeof value.correctCount !== 'number' || !Number.isFinite(value.correctCount) || value.correctCount < 0 ||
    typeof value.wrongCount !== 'number' || !Number.isFinite(value.wrongCount) || value.wrongCount < 0 ||
    (typeof value.lastAnsweredAt !== 'string' && value.lastAnsweredAt !== null) ||
    (typeof value.lastWrongAt !== 'string' && value.lastWrongAt !== null && value.lastWrongAt !== undefined) ||
    (typeof value.nextReviewAt !== 'string' && value.nextReviewAt !== null) ||
    typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > 5
  ) return null;

  return {
    termId,
    choiceLanguageMode,
    modality,
    correctCount: value.correctCount,
    wrongCount: value.wrongCount,
    lastAnsweredAt: value.lastAnsweredAt,
    lastWrongAt: typeof value.lastWrongAt === 'string' ? value.lastWrongAt : null,
    nextReviewAt: value.nextReviewAt,
    level,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeAttempt(value: unknown): TestAttempt | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const studentId = stringValue(value.studentId);
  const testSetId = stringValue(value.testSetId) ?? stringValue(value.testSet);
  const testSetTitleJa = stringValue(value.testSetTitleJa) ?? testSetId;
  const testSetVersion = stringValue(value.testSetVersion) ?? 'unknown';
  const choiceLanguageMode = isChoiceLanguageMode(value.choiceLanguageMode) ? value.choiceLanguageMode : 'bilingual';
  const completedAt = stringValue(value.completedAt);
  const total = finiteNumber(value.total);
  const correct = finiteNumber(value.correct);
  const score = finiteNumber(value.score);
  const passingScore = finiteNumber(value.passingScore) ?? 80;
  const durationSeconds = finiteNumber(value.durationSeconds);
  const certificateId = stringValue(value.certificateId) ?? id;
  const appVersion = stringValue(value.appVersion);
  if (
    !id || !name || studentId === null || !testSetId || !testSetTitleJa || !testSetVersion || !completedAt ||
    total === null || total < 0 || correct === null || correct < 0 || score === null || score < 0 || score > 100 ||
    passingScore < 0 || passingScore > 100 || typeof value.passed !== 'boolean' || durationSeconds === null ||
    durationSeconds < 0 || !certificateId || !appVersion
  ) return null;
  return {
    id, name, studentId, testSetId, testSetTitleJa, testSetVersion, choiceLanguageMode, completedAt,
    total, correct, score, passingScore, passed: value.passed, durationSeconds, certificateId, appVersion,
  };
}

function normalizeAttempts(value: unknown): TestAttempt[] | null {
  if (!Array.isArray(value)) return null;
  const attempts = value.map(normalizeAttempt);
  return attempts.every((attempt): attempt is TestAttempt => Boolean(attempt)) ? attempts : null;
}

function validateV2LearningData(value: unknown, knownTermIds: Set<string>): LearningData | null {
  if (!isRecord(value) || value.schemaVersion !== 2 || !isRecord(value.progress)) return null;
  const attempts = normalizeAttempts(value.attempts);
  if (!attempts) return null;
  const progress: Record<string, TermProgress> = {};
  for (const [key, record] of Object.entries(value.progress)) {
    const normalized = normalizeProgress(record, knownTermIds);
    if (!normalized) return null;
    const normalizedKey = progressKey(normalized.termId, normalized.choiceLanguageMode, normalized.modality);
    if (key !== normalizedKey) return null;
    progress[normalizedKey] = normalized;
  }
  return { schemaVersion: 2, progress, attempts };
}

function migrateLegacyLearningData(value: unknown, knownTermIds: Set<string>): LearningData | null {
  if (!isRecord(value) || !isRecord(value.progress)) return null;
  if ('schemaVersion' in value && value.schemaVersion !== 1) return null;
  const attempts = normalizeAttempts(value.attempts);
  if (!attempts) return null;
  const progress: Record<string, TermProgress> = {};
  for (const record of Object.values(value.progress)) {
    const embeddedModality = isRecord(record) && isLearningModality(record.modality) ? record.modality : null;
    // The v1 schema did not retain question modality. Preserve its full counters in
    // text and leave image unlearned instead of falsely claiming image mastery.
    const targetModalities: LearningModality[] = [embeddedModality ?? 'text'];
    for (const modality of targetModalities) {
      const normalized = normalizeProgress(record, knownTermIds, modality);
      if (!normalized) return null;
      progress[progressKey(normalized.termId, normalized.choiceLanguageMode, modality)] = { ...normalized, modality };
    }
  }
  return { schemaVersion: 2, progress, attempts };
}

export function validateLearningData(value: unknown, knownTermIds: Set<string>): LearningData | null {
  return validateV2LearningData(value, knownTermIds) ?? migrateLegacyLearningData(value, knownTermIds);
}

function parseStored(key: string, knownTermIds: Set<string>): LearningData | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return validateLearningData(JSON.parse(raw) as unknown, knownTermIds);
  } catch {
    return null;
  }
}

export function loadLearningData(knownTermIds: Set<string>): LearningData {
  return parseStored(STORAGE_KEY, knownTermIds) ?? parseStored(LEGACY_STORAGE_KEY, knownTermIds) ?? createEmptyLearningData();
}

export function saveLearningData(data: LearningData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function buildBackup(data: LearningData) {
  return { appName: APP_NAME, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data };
}

export function parseBackupFile(value: unknown, knownTermIds: Set<string>): LearningData | null {
  const candidate = isRecord(value) && 'data' in value ? value.data : value;
  return validateLearningData(candidate, knownTermIds);
}
