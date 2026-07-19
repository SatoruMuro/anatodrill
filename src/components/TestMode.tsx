import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import type {
  AnatomyImage,
  AnswerRecord,
  Question,
  SelectableChoiceLanguageMode,
  Term,
  TestAttempt,
  TestParticipant,
  TestSet,
} from '../types/anatodrill';
import { APP_VERSION } from '../lib/constants';
import {
  CHOICE_LANGUAGE_OPTIONS,
  choiceLanguageModeLabel,
  questionSupportsChoiceLanguage,
} from '../lib/choiceLanguage';
import { formatDateTime, formatDuration } from '../lib/dates';
import { generateCertificatePdf } from '../lib/pdf';
import { getQuestionCountsByTestSet } from '../lib/questions';
import { takeRandom } from '../lib/random';
import { activeTestSets } from '../lib/testSets';
import { buildCertificatePayload, downloadTestResultCsv, downloadTestResultJson } from '../lib/testResults';
import { QuestionCard } from './QuestionCard';

interface TestModeProps {
  questions: Question[];
  testSets: TestSet[];
  termsById: Map<string, Term>;
  imagesById: Map<string, AnatomyImage>;
  onRecordAnswer: (record: AnswerRecord) => void;
  onSaveAttempt: (attempt: TestAttempt) => void;
}

type Phase = 'setup' | 'running' | 'finished';

function makeCertificateId(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AD-${stamp}-${random}`;
}

export function TestMode({ questions, testSets, termsById, imagesById, onRecordAnswer, onSaveAttempt }: TestModeProps) {
  const activeSets = useMemo(() => activeTestSets(testSets), [testSets]);
  const [phase, setPhase] = useState<Phase>('setup');
  const [participant, setParticipant] = useState<TestParticipant>({ name: '', studentId: '' });
  const [testSetId, setTestSetId] = useState(activeSets[0]?.id ?? '');
  const [choiceLanguageMode, setChoiceLanguageMode] = useState<SelectableChoiceLanguageMode>('trilingual');
  const [queue, setQueue] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [result, setResult] = useState<TestAttempt | null>(null);
  const [isGeneratingCertificate, setIsGeneratingCertificate] = useState(false);
  const languageEligibleQuestions = useMemo(
    () => questions.filter((question) => questionSupportsChoiceLanguage(question, choiceLanguageMode, termsById)),
    [choiceLanguageMode, questions, termsById],
  );
  const questionCounts = useMemo(
    () => getQuestionCountsByTestSet(languageEligibleQuestions),
    [languageEligibleQuestions],
  );

  const selectedTestSet = activeSets.find((testSet) => testSet.id === testSetId) ?? activeSets[0];
  const selectedPool = selectedTestSet
    ? languageEligibleQuestions.filter((question) => question.testSet === selectedTestSet.id)
    : [];
  const availableQuestionCount = selectedTestSet ? questionCounts[selectedTestSet.id] ?? 0 : 0;
  const effectiveQuestionCount = selectedTestSet
    ? Math.min(selectedTestSet.defaultQuestionCount, availableQuestionCount)
    : 0;
  const usesAllAvailableQuestions =
    Boolean(selectedTestSet) && availableQuestionCount > 0 && availableQuestionCount < selectedTestSet.defaultQuestionCount;

  const updateParticipant = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setParticipant((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const startTest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTestSet || !participant.name.trim() || !participant.studentId.trim() || selectedPool.length === 0) {
      return;
    }

    setQueue(takeRandom(selectedPool, effectiveQuestionCount));
    setAnswers([]);
    setIndex(0);
    setStartedAt(new Date());
    setResult(null);
    setPhase('running');
  };

  const recordAnswer = (record: AnswerRecord) => {
    onRecordAnswer(record);
    setAnswers((current) => [...current, record]);
  };

  const finishTest = () => {
    const completedAt = new Date();
    const correct = answers.filter((answer) => answer.correct).length;
    const total = queue.length;
    const score = total === 0 ? 0 : Math.round((correct / total) * 100);
    const testSet = selectedTestSet;
    if (!testSet) {
      return;
    }
    const passed = score >= testSet.passingScore;
    const attempt: TestAttempt = {
      id: `attempt-${completedAt.getTime()}`,
      name: participant.name.trim(),
      studentId: participant.studentId.trim(),
      testSetId: testSet.id,
      testSetTitleJa: testSet.titleJa,
      testSetVersion: testSet.version,
      choiceLanguageMode,
      completedAt: completedAt.toISOString(),
      total,
      correct,
      score,
      passingScore: testSet.passingScore,
      passed,
      durationSeconds: startedAt ? Math.max(0, Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)) : 0,
      certificateId: makeCertificateId(),
      appVersion: APP_VERSION,
    };

    onSaveAttempt(attempt);
    setResult(attempt);
    setPhase('finished');
  };

  const createCertificate = async () => {
    if (!result?.passed || !result.certificateId) {
      return;
    }

    setIsGeneratingCertificate(true);
    try {
      await generateCertificatePdf(buildCertificatePayload(result));
    } catch (error) {
      console.warn('AnatoDrill PDF: certificate generation failed.', error);
    } finally {
      setIsGeneratingCertificate(false);
    }
  };

  if (phase === 'setup') {
    return (
      <main className="page-shell narrow">
        <section className="mode-heading">
          <div>
            <p className="eyebrow">Test mode</p>
            <h2>セルフチェックテスト</h2>
          </div>
          {selectedTestSet ? <span className="progress-pill">合格 {selectedTestSet.passingScore}%</span> : null}
        </section>

        <form className="setup-form" onSubmit={startTest}>
          <label>
            氏名
            <input
              name="name"
              value={participant.name}
              onChange={updateParticipant}
              autoComplete="name"
              required
            />
          </label>
          <label>
            学籍番号
            <input
              name="studentId"
              value={participant.studentId}
              onChange={updateParticipant}
              autoComplete="off"
              required
            />
          </label>
          <label>
            テストセット
            <select value={selectedTestSet?.id ?? ''} onChange={(event) => setTestSetId(event.target.value)} required>
              {activeSets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.titleJa} ({questionCounts[set.id] ?? 0}問)
                </option>
              ))}
            </select>
          </label>
          <label>
            テスト形式
            <select
              value={choiceLanguageMode}
              onChange={(event) => setChoiceLanguageMode(event.target.value as SelectableChoiceLanguageMode)}
              required
            >
              {CHOICE_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.testLabel}
                </option>
              ))}
            </select>
          </label>

          {selectedTestSet ? (
            <section className="test-set-detail" aria-label="選択中のテストセット">
              <h3>{selectedTestSet.titleJa}</h3>
              <p>{selectedTestSet.descriptionJa}</p>
              <dl className="compact-list">
                <div>
                  <dt>Test set ID</dt>
                  <dd>{selectedTestSet.id}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{selectedTestSet.version}</dd>
                </div>
                <div>
                  <dt>合格基準</dt>
                  <dd>{selectedTestSet.passingScore}%</dd>
                </div>
                <div>
                  <dt>標準問題数</dt>
                  <dd>{selectedTestSet.defaultQuestionCount}問</dd>
                </div>
                <div>
                  <dt>今回の出題数</dt>
                  <dd>{effectiveQuestionCount}問</dd>
                </div>
                <div>
                  <dt>選択肢</dt>
                  <dd>{choiceLanguageModeLabel(choiceLanguageMode)}</dd>
                </div>
              </dl>
              {usesAllAvailableQuestions ? (
                <p className="status-line">
                  登録問題が標準問題数より少ないため、利用可能な {availableQuestionCount} 問すべてを出題します。
                </p>
              ) : null}
            </section>
          ) : (
            <p className="error-text">有効なテストセットがありません。</p>
          )}

          {selectedPool.length === 0 ? <p className="error-text">選択できる問題がありません。</p> : null}

          <button type="submit" className="primary-button" disabled={!selectedTestSet || selectedPool.length === 0}>
            テスト開始
          </button>
        </form>
      </main>
    );
  }

  if (phase === 'finished' && result) {
    return (
      <main className="page-shell narrow">
        <section className={result.passed ? 'result-hero passed' : 'result-hero failed'}>
          <p className="eyebrow">Test result</p>
          <h2>{result.passed ? '合格' : '未合格'}</h2>
          <div className="score-display">{result.score}%</div>
          <dl className="result-grid">
            <div>
              <dt>正答数</dt>
              <dd>
                {result.correct} / {result.total}
              </dd>
            </div>
            <div>
              <dt>完了日時</dt>
              <dd>{formatDateTime(result.completedAt)}</dd>
            </div>
            <div>
              <dt>所要時間</dt>
              <dd>{formatDuration(result.durationSeconds)}</dd>
            </div>
            <div>
              <dt>テストセット</dt>
              <dd>{result.testSetTitleJa}</dd>
            </div>
            <div>
              <dt>合格基準</dt>
              <dd>{result.passingScore}%</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{result.testSetVersion}</dd>
            </div>
            <div>
              <dt>選択肢</dt>
              <dd>{choiceLanguageModeLabel(result.choiceLanguageMode)}</dd>
            </div>
          </dl>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={() => setPhase('setup')}>
              再受験
            </button>
            <button type="button" className="secondary-button" onClick={() => downloadTestResultJson(result)}>
              JSON結果
            </button>
            <button type="button" className="secondary-button" onClick={() => downloadTestResultCsv(result)}>
              CSV結果
            </button>
            {result.passed && result.certificateId ? (
              <button
                type="button"
                className="primary-button"
                disabled={isGeneratingCertificate}
                onClick={createCertificate}
              >
                {isGeneratingCertificate ? 'PDF生成中' : 'PDF証明書を作成'}
              </button>
            ) : null}
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
          <p className="eyebrow">Test mode</p>
          <h2>{selectedTestSet?.titleJa ?? testSetId}</h2>
          <p className="muted">選択肢: {choiceLanguageModeLabel(choiceLanguageMode)}</p>
        </div>
        <span className="progress-pill">
          {index + 1} / {queue.length}
        </span>
      </section>

      <QuestionCard
        key={`${current.id}-test-${choiceLanguageMode}-${index}`}
        question={current}
        termsById={termsById}
        imagesById={imagesById}
        sequenceLabel={`テスト ${index + 1}`}
        choiceLanguageMode={choiceLanguageMode}
        continueLabel={index + 1 === queue.length ? '結果を見る' : '次へ'}
        onAnswer={recordAnswer}
        onContinue={() => {
          if (index + 1 >= queue.length) {
            finishTest();
          } else {
            setIndex((value) => value + 1);
          }
        }}
      />
    </main>
  );
}
