import type { LearningData, Question, Term, TermProgress } from '../types/anatodrill';
import { addDays, isTodayOrEarlier } from './dates';
import { shuffle } from './random';

const REVIEW_INTERVAL_DAYS: Record<number, number> = {
  0: 0,
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

export function createEmptyLearningData(): LearningData {
  return {
    progress: {},
    attempts: [],
  };
}

export function createInitialProgress(termId: string): TermProgress {
  return {
    termId,
    correctCount: 0,
    wrongCount: 0,
    lastAnsweredAt: null,
    nextReviewAt: null,
    level: 0,
  };
}

export function updateProgressRecord(
  existing: TermProgress | undefined,
  termId: string,
  correct: boolean,
  answeredAt = new Date(),
): TermProgress {
  const base = existing ?? createInitialProgress(termId);
  const nextLevel = correct ? Math.min(5, base.level + 1) : 0;
  const intervalDays = correct ? REVIEW_INTERVAL_DAYS[nextLevel] : REVIEW_INTERVAL_DAYS[0];

  return {
    termId,
    correctCount: base.correctCount + (correct ? 1 : 0),
    wrongCount: base.wrongCount + (correct ? 0 : 1),
    lastAnsweredAt: answeredAt.toISOString(),
    nextReviewAt: addDays(answeredAt, intervalDays).toISOString(),
    level: nextLevel,
  };
}

export function dueTermIds(terms: readonly Term[], data: LearningData): Set<string> {
  return new Set(
    terms
      .filter((term) => isTodayOrEarlier(data.progress[term.id]?.nextReviewAt ?? null))
      .sort((a, b) => {
        const aProgress = data.progress[a.id];
        const bProgress = data.progress[b.id];
        const aWrong = aProgress?.wrongCount ?? 0;
        const bWrong = bProgress?.wrongCount ?? 0;
        if (aWrong !== bWrong) {
          return bWrong - aWrong;
        }
        return (aProgress?.level ?? 0) - (bProgress?.level ?? 0);
      })
      .map((term) => term.id),
  );
}

export function dueQuestions(questions: readonly Question[], terms: readonly Term[], data: LearningData): Question[] {
  const dueIds = dueTermIds(terms, data);
  return shuffle(questions)
    .filter((question) => dueIds.has(question.answerTermId))
    .sort((a, b) => {
      const aProgress = data.progress[a.answerTermId];
      const bProgress = data.progress[b.answerTermId];
      const aWrong = aProgress?.wrongCount ?? 0;
      const bWrong = bProgress?.wrongCount ?? 0;
      if (aWrong !== bWrong) {
        return bWrong - aWrong;
      }
      return (aProgress?.level ?? 0) - (bProgress?.level ?? 0);
    });
}

export function progressSummary(terms: readonly Term[], data: LearningData) {
  const records = terms.map((term) => data.progress[term.id]).filter(Boolean) as TermProgress[];
  const mastered = records.filter((record) => record.level >= 4).length;
  const answered = records.length;
  const due = terms.filter((term) => isTodayOrEarlier(data.progress[term.id]?.nextReviewAt ?? null)).length;
  const wrong = records.reduce((sum, record) => sum + record.wrongCount, 0);
  const correct = records.reduce((sum, record) => sum + record.correctCount, 0);

  return {
    answered,
    mastered,
    due,
    correct,
    wrong,
    total: terms.length,
  };
}
