import { useMemo, useState, type FormEvent } from 'react';
import type { AnatomyImage, AnswerRecord, Question, SelectableChoiceLanguageMode, Term } from '../types/anatodrill';
import {
  CHOICE_LANGUAGE_OPTIONS,
  choiceLanguageModeLabel,
  questionSupportsChoiceLanguage,
} from '../lib/choiceLanguage';
import { shuffle } from '../lib/random';
import { QuestionCard } from './QuestionCard';

interface DrillModeProps {
  questions: Question[];
  termsById: Map<string, Term>;
  imagesById: Map<string, AnatomyImage>;
  onRecordAnswer: (record: AnswerRecord) => void;
}

export function DrillMode({ questions, termsById, imagesById, onRecordAnswer }: DrillModeProps) {
  const [sessionId, setSessionId] = useState(1);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [choiceLanguageMode, setChoiceLanguageMode] = useState<SelectableChoiceLanguageMode>('trilingual');
  const eligibleQuestions = useMemo(
    () => questions.filter((question) => questionSupportsChoiceLanguage(question, choiceLanguageMode, termsById)),
    [choiceLanguageMode, questions, termsById],
  );
  const queue = useMemo(() => shuffle(eligibleQuestions), [eligibleQuestions, sessionId]);
  const selectedLanguageOption = CHOICE_LANGUAGE_OPTIONS.find((option) => option.value === choiceLanguageMode);

  const start = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSessionId((value) => value + 1);
    setIndex(0);
    setCompleted(false);
    setStarted(true);
  };

  const restart = () => {
    setSessionId((value) => value + 1);
    setIndex(0);
    setCompleted(false);
    setStarted(true);
  };

  if (questions.length === 0) {
    return (
      <main className="page-shell">
        <section className="empty-state">
          <h2>ドリル問題がありません</h2>
          <p>questions.json に問題を追加してください。</p>
        </section>
      </main>
    );
  }

  if (!started) {
    return (
      <main className="page-shell narrow">
        <section className="mode-heading">
          <div>
            <p className="eyebrow">Drill mode</p>
            <h2>ドリルを選択</h2>
          </div>
          <span className="progress-pill">対象 {eligibleQuestions.length}問</span>
        </section>

        <form className="setup-form" onSubmit={start}>
          <label>
            ドリル形式
            <select
              value={choiceLanguageMode}
              onChange={(event) => setChoiceLanguageMode(event.target.value as SelectableChoiceLanguageMode)}
            >
              {CHOICE_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.drillLabel}
                </option>
              ))}
            </select>
          </label>

          <section className="test-set-detail" aria-label="選択中のドリル形式">
            <h3>{selectedLanguageOption?.drillLabel}</h3>
            <p>{selectedLanguageOption?.description}</p>
            <p>この形式で出題可能: {eligibleQuestions.length}問</p>
          </section>

          <button type="submit" className="primary-button" disabled={eligibleQuestions.length === 0}>
            ドリル開始
          </button>
        </form>
      </main>
    );
  }

  if (completed) {
    return (
      <main className="page-shell">
        <section className="result-hero">
          <p className="eyebrow">Drill complete</p>
          <h2>このセットのドリルが終わりました。</h2>
          <p>{queue.length} 問を解答しました。もう一度開始すると出題順が再シャッフルされます。</p>
          <p>選択肢: {choiceLanguageModeLabel(choiceLanguageMode)}</p>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={restart}>
              同じ形式でもう一度
            </button>
            <button type="button" className="secondary-button" onClick={() => setStarted(false)}>
              形式を選び直す
            </button>
          </div>
        </section>
      </main>
    );
  }

  const current = queue[index];

  return (
    <main className="page-shell narrow">
      <section className="mode-heading">
        <div>
          <p className="eyebrow">Drill mode</p>
          <h2>ランダムドリル</h2>
          <p className="muted">選択肢: {choiceLanguageModeLabel(choiceLanguageMode)}</p>
        </div>
        <span className="progress-pill">
          {index + 1} / {queue.length}
        </span>
      </section>

      <QuestionCard
        key={`${current.id}-${sessionId}-${index}`}
        question={current}
        termsById={termsById}
        imagesById={imagesById}
        sequenceLabel={`問題 ${index + 1}`}
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
