import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import type {
  AnatomyImage,
  AnswerRecord,
  Question,
  SelectableChoiceLanguageMode,
  Term,
  TestAttempt,
  TestParticipant,
} from '../types/anatodrill';
import { APP_VERSION } from '../lib/constants';
import {
  CHOICE_LANGUAGE_OPTIONS,
  choiceLanguageModeLabel,
  questionSupportsChoiceLanguage,
} from '../lib/choiceLanguage';
import { formatDateTime, formatDuration } from '../lib/dates';
import { generateCertificatePdf } from '../lib/pdf';
import { takeRandom } from '../lib/random';
import { buildCertificatePayload, downloadTestResultCsv, downloadTestResultJson } from '../lib/testResults';
import { QuestionCard } from './QuestionCard';
import { TestResultShare } from './TestResultShare';

interface TestModeProps {
  questions: Question[];
  termsById: Map<string, Term>;
  imagesById: Map<string, AnatomyImage>;
  onRecordAnswer: (record: AnswerRecord) => void;
  onSaveAttempt: (attempt: TestAttempt) => void;
}

type Phase = 'setup' | 'running' | 'finished';

const ALL_RANGE_TEST_ID = 'all_range';
const ALL_RANGE_TEST_TITLE = '全範囲テスト';
const ALL_RANGE_TEST_VERSION = '2026.3';
const PASSING_SCORE = 80;
const DEFAULT_QUESTION_COUNT = 30;

function makeCertificateId(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AD-${stamp}-${random}`;
}

export function TestMode({ questions, termsById, imagesById, onRecordAnswer, onSaveAttempt }: TestModeProps) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [participant, setParticipant] = useState<TestParticipant>({ name: '', studentId: '' });
  const [hasNoStudentId, setHasNoStudentId] = useState(false);
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
  const availableQuestionCount = languageEligibleQuestions.length;
  const effectiveQuestionCount = Math.min(DEFAULT_QUESTION_COUNT, availableQuestionCount);
  const usesAllAvailableQuestions =
    availableQuestionCount > 0 && availableQuestionCount < DEFAULT_QUESTION_COUNT;

  const updateParticipant = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setParticipant((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const startTest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !participant.name.trim() ||
      (!hasNoStudentId && !participant.studentId.trim()) ||
      languageEligibleQuestions.length === 0
    ) {
      return;
    }

    setQueue(takeRandom(languageEligibleQuestions, effectiveQuestionCount));
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
    const passed = score >= PASSING_SCORE;
    const attempt: TestAttempt = {
      id: `attempt-${completedAt.getTime()}`,
      name: participant.name.trim(),
      studentId: hasNoStudentId ? '' : participant.studentId.trim(),
      testSetId: ALL_RANGE_TEST_ID,
      testSetTitleJa: ALL_RANGE_TEST_TITLE,
      testSetVersion: ALL_RANGE_TEST_VERSION,
      choiceLanguageMode,
      completedAt: completedAt.toISOString(),
      total,
      correct,
      score,
      passingScore: PASSING_SCORE,
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
          <span className="progress-pill">合格 {PASSING_SCORE}%</span>
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
          <div className="student-id-field">
            <label>
              学籍番号
              <input
                name="studentId"
                value={participant.studentId}
                onChange={updateParticipant}
                autoComplete="off"
                disabled={hasNoStudentId}
                required={!hasNoStudentId}
              />
            </label>
            <label className="student-id-none-toggle">
              <input
                type="checkbox"
                checked={hasNoStudentId}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setHasNoStudentId(checked);
                  if (checked) {
                    setParticipant((current) => ({ ...current, studentId: '' }));
                  }
                }}
              />
              <span>学籍番号なし</span>
            </label>
          </div>
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

          <section className="test-set-detail" aria-label="テスト内容">
            <h3>{ALL_RANGE_TEST_TITLE}</h3>
            <p>登録されている全分野の問題からランダムに出題します。</p>
            <dl className="compact-list">
              <div>
                <dt>出題範囲</dt>
                <dd>全範囲</dd>
              </div>
              <div>
                <dt>出題候補</dt>
                <dd>{availableQuestionCount}問</dd>
              </div>
              <div>
                <dt>今回の出題数</dt>
                <dd>{effectiveQuestionCount}問</dd>
              </div>
              <div>
                <dt>合格基準</dt>
                <dd>{PASSING_SCORE}%</dd>
              </div>
              <div>
                <dt>選択肢</dt>
                <dd>{choiceLanguageModeLabel(choiceLanguageMode)}</dd>
              </div>
            </dl>
            {usesAllAvailableQuestions ? (
              <p className="status-line">登録問題が30問未満のため、利用可能な問題をすべて出題します。</p>
            ) : null}
          </section>

          {languageEligibleQuestions.length === 0 ? <p className="error-text">選択できる問題がありません。</p> : null}

          <button type="submit" className="primary-button" disabled={languageEligibleQuestions.length === 0}>
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
              <dt>出題範囲</dt>
              <dd>{result.testSetTitleJa}</dd>
            </div>
            <div>
              <dt>合格基準</dt>
              <dd>{result.passingScore}%</dd>
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
        <TestResultShare attempt={result} />
      </main>
    );
  }

  const current = queue[index];

  return (
    <main className="page-shell narrow">
      <section className="mode-heading">
        <div>
          <p className="eyebrow">Test mode</p>
          <h2>{ALL_RANGE_TEST_TITLE}</h2>
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
