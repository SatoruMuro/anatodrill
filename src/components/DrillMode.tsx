import { useMemo, useState, type FormEvent } from 'react';
import type {
  AnatomyImage,
  AnswerRecord,
  DrillPreset,
  DrillQuestionFormat,
  LearningData,
  Question,
  SelectableChoiceLanguageMode,
  Term,
} from '../types/anatodrill';
import { CHOICE_LANGUAGE_OPTIONS, choiceLanguageModeLabel } from '../lib/choiceLanguage';
import {
  buildDrillQueue,
  CATEGORY_OPTIONS,
  countDrillCandidates,
  DRILL_PRESET_OPTIONS,
  filterDrillQuestions,
  QUESTION_FORMAT_OPTIONS,
  REGION_OPTIONS,
  type DrillCategory,
  type DrillRegion,
} from '../lib/drill';
import { QuestionCard } from './QuestionCard';

interface DrillModeProps {
  questions: Question[];
  termsById: Map<string, Term>;
  imagesById: Map<string, AnatomyImage>;
  data: LearningData;
  initialPreset?: DrillPreset;
  onRecordAnswer: (record: AnswerRecord) => void;
}

export function DrillMode({
  questions,
  termsById,
  imagesById,
  data,
  initialPreset = 'today10',
  onRecordAnswer,
}: DrillModeProps) {
  const [sessionId, setSessionId] = useState(1);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [queue, setQueue] = useState<Question[]>([]);
  const [choiceLanguageMode, setChoiceLanguageMode] = useState<SelectableChoiceLanguageMode>('trilingual');
  const [preset, setPreset] = useState<DrillPreset>(initialPreset);
  const [region, setRegion] = useState<DrillRegion>('all');
  const [category, setCategory] = useState<DrillCategory>('all');
  const [questionFormat, setQuestionFormat] = useState<DrillQuestionFormat>('all');

  const eligibleQuestions = useMemo(
    () => filterDrillQuestions(questions, termsById, { choiceLanguageMode, region, category, questionFormat }),
    [category, choiceLanguageMode, questionFormat, questions, region, termsById],
  );
  const candidateCount = useMemo(
    () => countDrillCandidates(eligibleQuestions, preset, data, choiceLanguageMode),
    [choiceLanguageMode, data, eligibleQuestions, preset],
  );
  const selectedPreset = DRILL_PRESET_OPTIONS.find((option) => option.value === preset);

  const createQueue = () => buildDrillQueue(eligibleQuestions, preset, data, choiceLanguageMode);

  const start = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQueue = createQueue();
    setQueue(nextQueue);
    setSessionId((value) => value + 1);
    setIndex(0);
    setCompleted(nextQueue.length === 0);
    setStarted(true);
  };

  const restart = () => {
    const nextQueue = createQueue();
    setQueue(nextQueue);
    setSessionId((value) => value + 1);
    setIndex(0);
    setCompleted(nextQueue.length === 0);
    setStarted(true);
  };

  if (questions.length === 0) {
    return (
      <main className="page-shell"><section className="empty-state"><h2>ドリル問題がありません</h2></section></main>
    );
  }

  if (!started) {
    return (
      <main className="page-shell narrow">
        <section className="mode-heading">
          <div><p className="eyebrow">Drill mode</p><h2>ドリルを選択</h2></div>
          <span className="progress-pill">出題 {candidateCount}問</span>
        </section>

        <form className="setup-form" onSubmit={start}>
          <div className="drill-setup-grid">
            <label>
              問題数・出題方式
              <select value={preset} onChange={(event) => setPreset(event.target.value as DrillPreset)}>
                {DRILL_PRESET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              表示言語
              <select value={choiceLanguageMode} onChange={(event) => setChoiceLanguageMode(event.target.value as SelectableChoiceLanguageMode)}>
                {CHOICE_LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.drillLabel}</option>)}
              </select>
            </label>
            <label>
              解剖学的部位
              <select value={region} onChange={(event) => setRegion(event.target.value as DrillRegion)}>
                {REGION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              構造カテゴリ
              <select value={category} onChange={(event) => setCategory(event.target.value as DrillCategory)}>
                {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="drill-format-filter">
              問題形式
              <select value={questionFormat} onChange={(event) => setQuestionFormat(event.target.value as DrillQuestionFormat)}>
                {QUESTION_FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <section className="test-set-detail" aria-label="選択中のドリル設定">
            <h3>{selectedPreset?.label}</h3>
            <p>{selectedPreset?.description}</p>
            <p>フィルタ対象 {eligibleQuestions.length}問 / 今回の出題 {candidateCount}問</p>
            {preset === 'weak10' && candidateCount === 0 ? <p>この条件の苦手履歴はまだありません。</p> : null}
            {preset === 'unlearned10' && candidateCount === 0 ? <p>この条件の未学習項目はありません。</p> : null}
          </section>

          <button type="submit" className="primary-button" disabled={candidateCount === 0}>ドリル開始</button>
        </form>
      </main>
    );
  }

  if (completed || queue.length === 0) {
    return (
      <main className="page-shell">
        <section className="result-hero">
          <p className="eyebrow">Drill complete</p>
          <h2>{queue.length ? 'このセットのドリルが終わりました。' : '出題できる問題がありません。'}</h2>
          <p>{queue.length}問を解答しました。</p>
          <p>選択肢: {choiceLanguageModeLabel(choiceLanguageMode)}</p>
          <div className="button-row">
            {queue.length ? <button type="button" className="primary-button" onClick={restart}>同じ条件でもう一度</button> : null}
            <button type="button" className="secondary-button" onClick={() => setStarted(false)}>条件を選び直す</button>
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
          <h2>{selectedPreset?.label}</h2>
          <p className="muted">選択肢: {choiceLanguageModeLabel(choiceLanguageMode)}</p>
        </div>
        <span className="progress-pill">{index + 1} / {queue.length}</span>
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
        onContinue={() => index + 1 >= queue.length ? setCompleted(true) : setIndex((value) => value + 1)}
      />
    </main>
  );
}
