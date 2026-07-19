import type {
  ChoiceLanguageMode,
  LearningData,
  Question,
  SelectableChoiceLanguageMode,
  Term,
  TermProgress,
} from '../types/anatodrill';
import { addDays, isTodayOrEarlier } from './dates';
import { questionSupportsChoiceLanguage } from './choiceLanguage';
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

export function progressKey(termId: string, choiceLanguageMode: ChoiceLanguageMode): string {
  return `${choiceLanguageMode}::${termId}`;
}

export function createInitialProgress(termId: string, choiceLanguageMode: ChoiceLanguageMode): TermProgress {
  return {
    termId,
    choiceLanguageMode,
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
  choiceLanguageMode: ChoiceLanguageMode,
  correct: boolean,
  answeredAt = new Date(),
): TermProgress {
  const base = existing ?? createInitialProgress(termId, choiceLanguageMode);
  const nextLevel = correct ? Math.min(5, base.level + 1) : 0;
  const intervalDays = correct ? REVIEW_INTERVAL_DAYS[nextLevel] : REVIEW_INTERVAL_DAYS[0];

  return {
    termId,
    choiceLanguageMode,
    correctCount: base.correctCount + (correct ? 1 : 0),
    wrongCount: base.wrongCount + (correct ? 0 : 1),
    lastAnsweredAt: answeredAt.toISOString(),
    nextReviewAt: addDays(answeredAt, intervalDays).toISOString(),
    level: nextLevel,
  };
}

export function dueTermIds(
  terms: readonly Term[],
  data: LearningData,
  choiceLanguageMode: ChoiceLanguageMode,
): Set<string> {
  return new Set(
    terms
      .filter((term) =>
        isTodayOrEarlier(data.progress[progressKey(term.id, choiceLanguageMode)]?.nextReviewAt ?? null),
      )
      .sort((a, b) => {
        const aProgress = data.progress[progressKey(a.id, choiceLanguageMode)];
        const bProgress = data.progress[progressKey(b.id, choiceLanguageMode)];
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

export function dueQuestions(
  questions: readonly Question[],
  terms: readonly Term[],
  data: LearningData,
  choiceLanguageMode: SelectableChoiceLanguageMode,
  termsById: ReadonlyMap<string, Term>,
): Question[] {
  const dueIds = dueTermIds(terms, data, choiceLanguageMode);
  return shuffle(questions)
    .filter(
      (question) =>
        dueIds.has(question.answerTermId) &&
        questionSupportsChoiceLanguage(question, choiceLanguageMode, termsById),
    )
    .sort((a, b) => {
      const aProgress = data.progress[progressKey(a.answerTermId, choiceLanguageMode)];
      const bProgress = data.progress[progressKey(b.answerTermId, choiceLanguageMode)];
      const aWrong = aProgress?.wrongCount ?? 0;
      const bWrong = bProgress?.wrongCount ?? 0;
      if (aWrong !== bWrong) {
        return bWrong - aWrong;
      }
      return (aProgress?.level ?? 0) - (bProgress?.level ?? 0);
    });
}

export function progressSummary(
  terms: readonly Term[],
  data: LearningData,
  choiceLanguageMode?: ChoiceLanguageMode,
) {
  const records = choiceLanguageMode
    ? (terms
        .map((term) => data.progress[progressKey(term.id, choiceLanguageMode)])
        .filter(Boolean) as TermProgress[])
    : Object.values(data.progress);
  const answered = choiceLanguageMode ? records.length : new Set(records.map((record) => record.termId)).size;
  const mastered = choiceLanguageMode
    ? records.filter((record) => record.level >= 4).length
    : new Set(records.filter((record) => record.level >= 4).map((record) => record.termId)).size;
  const due = records.filter((record) => isTodayOrEarlier(record.nextReviewAt)).length;
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
