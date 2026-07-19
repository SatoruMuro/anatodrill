import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { LearningData, Term, TestSet } from '../types/anatodrill';
import { buildBackup, parseBackupFile } from '../lib/storage';
import { formatDateTime } from '../lib/dates';
import { progressSummary } from '../lib/progress';
import { buildTestSetMap } from '../lib/testSets';
import { generateCertificatePdf } from '../lib/pdf';
import { buildCertificatePayload, downloadTestResultCsv, downloadTestResultJson } from '../lib/testResults';
import { choiceLanguageModeLabel } from '../lib/choiceLanguage';

interface HistoryBackupProps {
  data: LearningData;
  terms: Term[];
  testSets: TestSet[];
  onImportData: (data: LearningData) => void;
}

export function HistoryBackup({ data, terms, testSets, onImportData }: HistoryBackupProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [generatingPdfAttemptId, setGeneratingPdfAttemptId] = useState<string | null>(null);
  const knownTermIds = useMemo(() => new Set(terms.map((term) => term.id)), [terms]);
  const testSetsById = useMemo(() => buildTestSetMap(testSets), [testSets]);
  const summary = progressSummary(terms, data);

  const exportBackup = () => {
    const backup = buildBackup(data);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `anatodrill-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('バックアップを書き出しました。');
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const imported = parseBackupFile(parsed, knownTermIds);
      if (!imported) {
        setStatus('インポートできません。JSON形式または用語IDが正しいか確認してください。');
        return;
      }

      onImportData(imported);
      setStatus('バックアップから学習履歴を復元しました。');
    } catch {
      setStatus('インポートできません。JSONファイルを確認してください。');
    } finally {
      event.target.value = '';
    }
  };

  const downloadAttemptPdf = async (attemptId: string) => {
    const attempt = data.attempts.find((item) => item.id === attemptId);
    if (!attempt?.passed) {
      return;
    }

    setGeneratingPdfAttemptId(attempt.id);
    try {
      await generateCertificatePdf(buildCertificatePayload(attempt));
    } catch (error) {
      console.warn('AnatoDrill PDF: certificate generation failed from history.', error);
    } finally {
      setGeneratingPdfAttemptId(null);
    }
  };

  return (
    <main className="page-shell">
      <section className="mode-heading">
        <div>
          <p className="eyebrow">History and backup</p>
          <h2>履歴・バックアップ</h2>
        </div>
      </section>

      <section className="warning-band">
        学習履歴は現在のブラウザ内にのみ保存されます。ブラウザのデータ削除、別端末への移動、別ブラウザ利用に備えて定期的にエクスポートしてください。
      </section>

      <section className="stat-grid" aria-label="保存済み学習データ">
        <article className="stat-card">
          <span>解答済み用語</span>
          <strong>
            {summary.answered} / {summary.total}
          </strong>
        </article>
        <article className="stat-card">
          <span>正答</span>
          <strong>{summary.correct}</strong>
        </article>
        <article className="stat-card attention">
          <span>誤答</span>
          <strong>{summary.wrong}</strong>
        </article>
        <article className="stat-card">
          <span>テスト履歴</span>
          <strong>{data.attempts.length}</strong>
        </article>
      </section>

      <section className="content-grid two-columns">
        <article className="panel">
          <h3>バックアップ</h3>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={exportBackup}>
              JSONを書き出す
            </button>
            <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
              JSONを読み込む
            </button>
          </div>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={importBackup}
          />
          {status ? <p className="status-line">{status}</p> : null}
        </article>

        <article className="panel">
          <h3>テスト結果のエクスポート</h3>
          {data.attempts.length === 0 ? (
            <p className="muted">テスト履歴はまだありません。</p>
          ) : (
            <div className="attempt-list">
              {data.attempts.slice(0, 8).map((attempt) => {
                const currentTestSet = testSetsById.get(attempt.testSetId);
                return (
                  <article className="attempt-item" key={attempt.id}>
                    <div>
                      <strong>{attempt.score}%</strong>
                      <span>{attempt.passed ? '合格' : '未合格'}</span>
                    </div>
                    <dl className="attempt-detail-list">
                      <div>
                        <dt>dateTime</dt>
                        <dd>{formatDateTime(attempt.completedAt)}</dd>
                      </div>
                      <div>
                        <dt>name</dt>
                        <dd>{attempt.name}</dd>
                      </div>
                      <div>
                        <dt>studentId</dt>
                        <dd>{attempt.studentId}</dd>
                      </div>
                      <div>
                        <dt>testSetTitleJa</dt>
                        <dd>{attempt.testSetTitleJa}</dd>
                      </div>
                      <div>
                        <dt>choiceLanguage</dt>
                        <dd>{choiceLanguageModeLabel(attempt.choiceLanguageMode)}</dd>
                      </div>
                      <div>
                        <dt>scorePercentage</dt>
                        <dd>{attempt.score}%</dd>
                      </div>
                      <div>
                        <dt>pass/fail</dt>
                        <dd>{attempt.passed ? '合格' : '未合格'}</dd>
                      </div>
                      <div>
                        <dt>certificateId</dt>
                        <dd>{attempt.certificateId}</dd>
                      </div>
                    </dl>
                    {currentTestSet && currentTestSet.version !== attempt.testSetVersion ? (
                      <small>Version {attempt.testSetVersion} / 現行版と異なります</small>
                    ) : (
                      <small>Version {attempt.testSetVersion}</small>
                    )}
                    <div className="attempt-actions">
                      <button type="button" className="secondary-button" onClick={() => downloadTestResultJson(attempt)}>
                        JSON
                      </button>
                      <button type="button" className="secondary-button" onClick={() => downloadTestResultCsv(attempt)}>
                        CSV
                      </button>
                      {attempt.passed ? (
                        <button
                          type="button"
                          className="primary-button"
                          disabled={generatingPdfAttemptId === attempt.id}
                          onClick={() => downloadAttemptPdf(attempt.id)}
                        >
                          {generatingPdfAttemptId === attempt.id ? 'PDF生成中' : 'PDF'}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
