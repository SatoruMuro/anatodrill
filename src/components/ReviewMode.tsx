import { useMemo, useState, type FormEvent } from 'react';
import type {
  AnatomyImage,
  AnswerRecord,
  LearningData,
  Question,
  SelectableChoiceLanguageMode,
  Term,
} from '../types/anatodrill';
import { CHOICE_LANGUAGE_OPTIONS, choiceLanguageModeLabel } from '../lib/choiceLanguage';
import { dueQuestions, progressKey } from '../lib/progress';
import { QuestionCard } from './QuestionCard';

interface ReviewModeProps {
  questions: Question[];
  terms: Term[];
  termsById: Map<string, Term>;
  imagesById: Map<string, AnatomyImage>;
  data: LearningData;
  onRecordAnswer: (record: AnswerRecord) => void;
}

export function ReviewMode({ questions, terms, termsById, imagesById, data, onRecordAnswer }: ReviewModeProps) {
  const [started, setStarted] = useState(false);
  const [choiceLanguageMode, setChoiceLanguageMode] = useState<SelectableChoiceLanguageMode>('trilingual');
  const [queue, setQueue] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const availableReviewQuestions = useMemo(
    () => dueQuestions(questions, terms, data, choiceLanguageMode, termsById),
    [choiceLanguageMode, data, questions, terms, termsById],
  );
  const selectedLanguageOption = CHOICE_LANGUAGE_OPTIONS.find((option) => option.value === choiceLanguageMode);

  const startReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQueue(availableReviewQuestions);
    setIndex(0);
    setCompleted(availableReviewQuestions.length === 0);
    setStarted(true);
  };

  if (!started) {
    return (
      <main className="page-shell narrow">
        <section className="mode-heading">
          <div>
            <p className="eyebrow">Today&apos;s review</p>
            <h2>復習形式を選択</h2>
          </div>
          <span className="progress-pill">対象 {availableReviewQuestions.length}問</span>
        </section>

        <form className="setup-form" onSubmit={startReview}>
          <label>
            復習形式
            <select
              value={choiceLanguageMode}
              onChange={(event) => setChoiceLanguageMode(event.target.value as SelectableChoiceLanguageMode)}
            >
              {CHOICE_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <section className="test-set-detail" aria-label="選択中の復習形式">
            <h3>{selectedLanguageOption?.label}</h3>
            <p>{selectedLanguageOption?.description}</p>
            <p>復習対象: {availableReviewQuestions.length}問</p>
          </section>

          <button type="submit" className="primary-button">
            復習開始
          </button>
        </form>
      </main>
    );
  }

  if (queue.length === 0 || completed) {
    return (
      <main className="page-shell">
        <section className="result-hero">
          <p className="eyebrow">Today&apos;s review</p>
          <h2>今日の復習は完了です。</h2>
          <p>期限が来た問題が追加されると、ここに表示されます。</p>
          <p>復習形式: {choiceLanguageModeLabel(choiceLanguageMode)}</p>
          <button type="button" className="secondary-button" onClick={() => setStarted(false)}>
            形式を選び直す
          </button>
        </section>
      </main>
    );
  }

  const current = queue[index];
  const progress = data.progress[progressKey(current.answerTermId, choiceLanguageMode)];

  return (
    <main className="page-shell narrow">
      <section className="mode-heading">
        <div>
          <p className="eyebrow">Today&apos;s review</p>
          <h2>今日の復習</h2>
          <p className="muted">選択肢: {choiceLanguageModeLabel(choiceLanguageMode)}</p>
          {progress?.wrongCount ? <p className="muted">この用語の誤答数: {progress.wrongCount}</p> : null}
        </div>
        <span className="progress-pill">
          {index + 1} / {queue.length}
        </span>
      </section>

      <QuestionCard
        key={`${current.id}-review-${index}`}
        question={current}
        termsById={termsById}
        imagesById={imagesById}
        sequenceLabel={`復習 ${index + 1}`}
        choiceLanguageMode={choiceLanguageMode}
        continueLabel={index + 1 === queue.length ? '完了' : '次へ'}
        onAnswer={onRecordAnswer}
        onContinue={() => {
          if (index + 1 >= queue.length) {
            setCompleted(true);
          } else {
            setIndex((value) => value + 1);
          }
        }}
      />
    </main>
  );
}
