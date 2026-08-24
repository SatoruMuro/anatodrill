import type {
  ChoiceLanguageMode,
  LearningData,
  LearningModality,
  Question,
  SelectableChoiceLanguageMode,
  Term,
  TermProgress,
} from '../types/anatodrill';
import { addDays, isTodayOrEarlier } from './dates';
import { questionSupportsChoiceLanguage } from './choiceLanguage';
import { shuffle } from './random';
import { questionModality } from './modality';

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
    schemaVersion: 2,
    progress: {},
    attempts: [],
  };
}

export function progressKey(
  termId: string,
  choiceLanguageMode: ChoiceLanguageMode,
  modality: LearningModality,
): string {
  return `${choiceLanguageMode}::${modality}::${termId}`;
}

export function createInitialProgress(
  termId: string,
  choiceLanguageMode: ChoiceLanguageMode,
  modality: LearningModality,
): TermProgress {
  return {
    termId,
    choiceLanguageMode,
    modality,
    correctCount: 0,
    wrongCount: 0,
    lastAnsweredAt: null,
    lastWrongAt: null,
    nextReviewAt: null,
    level: 0,
  };
}

export function updateProgressRecord(
  existing: TermProgress | undefined,
  termId: string,
  choiceLanguageMode: ChoiceLanguageMode,
  modality: LearningModality,
  correct: boolean,
  answeredAt = new Date(),
): TermProgress {
  const base = existing ?? createInitialProgress(termId, choiceLanguageMode, modality);
  const nextLevel = correct ? Math.min(5, base.level + 1) : 0;
  const intervalDays = correct ? REVIEW_INTERVAL_DAYS[nextLevel] : REVIEW_INTERVAL_DAYS[0];

  return {
    termId,
    choiceLanguageMode,
    modality,
    correctCount: base.correctCount + (correct ? 1 : 0),
    wrongCount: base.wrongCount + (correct ? 0 : 1),
    lastAnsweredAt: answeredAt.toISOString(),
    lastWrongAt: correct ? base.lastWrongAt : answeredAt.toISOString(),
    nextReviewAt: addDays(answeredAt, intervalDays).toISOString(),
    level: nextLevel,
  };
}

export function dueTermIds(
  terms: readonly Term[],
  data: LearningData,
  choiceLanguageMode: ChoiceLanguageMode,
  modality: LearningModality,
): Set<string> {
  return new Set(
    terms
      .filter((term) =>
        isTodayOrEarlier(data.progress[progressKey(term.id, choiceLanguageMode, modality)]?.nextReviewAt ?? null),
      )
      .sort((a, b) => {
        const aProgress = data.progress[progressKey(a.id, choiceLanguageMode, modality)];
        const bProgress = data.progress[progressKey(b.id, choiceLanguageMode, modality)];
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
  return shuffle(questions)
    .filter(
      (question) =>
        isTodayOrEarlier(
          data.progress[progressKey(question.answerTermId, choiceLanguageMode, questionModality(question))]
            ?.nextReviewAt ?? null,
        ) &&
        questionSupportsChoiceLanguage(question, choiceLanguageMode, termsById),
    )
    .sort((a, b) => {
      const aProgress = data.progress[progressKey(a.answerTermId, choiceLanguageMode, questionModality(a))];
      const bProgress = data.progress[progressKey(b.answerTermId, choiceLanguageMode, questionModality(b))];
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
  modality?: LearningModality,
) {
  const records = Object.values(data.progress).filter(
    (record) =>
      (!choiceLanguageMode || record.choiceLanguageMode === choiceLanguageMode) &&
      (!modality || record.modality === modality),
  );
  const answered = new Set(records.map((record) => record.termId)).size;
  const mastered = new Set(records.filter((record) => record.level >= 4).map((record) => record.termId)).size;
  const due = records.filter((record) => isTodayOrEarlier(record.nextReviewAt)).length;
  const weak = records.filter((record) => record.wrongCount > 0 || record.level < 2).length;
  const wrong = records.reduce((sum, record) => sum + record.wrongCount, 0);
  const correct = records.reduce((sum, record) => sum + record.correctCount, 0);

  return {
    answered,
    mastered,
    due,
    weak,
    correct,
    wrong,
    total: terms.length,
  };
}
