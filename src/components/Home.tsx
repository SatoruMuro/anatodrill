import type { DrillPreset, LearningData, Question, Term, ViewKey } from '../types/anatodrill';
import { APP_VERSION } from '../lib/constants';
import { progressSummary } from '../lib/progress';
import { formatDateTime } from '../lib/dates';
import { choiceLanguageModeLabel } from '../lib/choiceLanguage';

interface HomeProps {
  terms: Term[];
  questions: Question[];
  data: LearningData;
  onNavigate: (view: ViewKey) => void;
  onStartChallenge: () => void;
  onStartDrill: (preset: DrillPreset) => void;
}

export function Home({ terms, questions, data, onNavigate, onStartChallenge, onStartDrill }: HomeProps) {
  const summary = progressSummary(terms, data);
  const latestAttempt = data.attempts[0];

  return (
    <main className="page-shell">
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">AnatoDrill</p>
          <h2>解剖学10問Challenge</h2>
          <p className="challenge-copy">解剖学10問、何問いけますか？</p>
        </div>
        <div className="intro-actions">
          <button type="button" className="primary-button challenge-button" onClick={onStartChallenge}>
            10問Challengeを開始
          </button>
          <button type="button" className="secondary-button" onClick={() => onStartDrill('weak10')}>
            苦手10問
          </button>
          <button type="button" className="secondary-button" onClick={() => onNavigate('review')}>
            今日の復習
          </button>
        </div>
      </section>

      <section className="stat-grid" aria-label="学習状況">
        <article className="stat-card">
          <span>収録用語</span>
          <strong>{summary.total}</strong>
        </article>
        <article className="stat-card">
          <span>出題数</span>
          <strong>{questions.length}</strong>
        </article>
        <article className="stat-card attention">
          <span>苦手項目</span>
          <strong>{summary.weak}</strong>
        </article>
        <article className="stat-card attention">
          <span>今日の復習</span>
          <strong>{summary.due}</strong>
        </article>
        <article className="stat-card">
          <span>習熟済み</span>
          <strong>{summary.mastered}</strong>
        </article>
      </section>

      <section className="content-grid two-columns">
        <article className="panel">
          <h3>学習メニュー</h3>
          <p className="muted learning-note">
            間隔反復で、忘れる頃にもう一度。進捗はこのブラウザに保存されます。
          </p>
          <div className="action-list">
            <button type="button" onClick={() => onStartDrill('today10')}>
              今日の10問
            </button>
            <button type="button" onClick={() => onStartDrill('weak10')}>
              苦手10問
            </button>
            <button type="button" onClick={() => onNavigate('review')}>
              期限が来た復習
            </button>
            <button type="button" onClick={() => onNavigate('test')}>
              セルフチェックテスト
            </button>
            <button type="button" onClick={() => onNavigate('plates')}>
              番号付き図版学習
            </button>
            <button type="button" onClick={() => onNavigate('history')}>
              履歴とバックアップ
            </button>
            <button type="button" onClick={() => onNavigate('credits')}>
              画像クレジット
            </button>
          </div>
        </article>

        <article className="panel">
          <h3>最近のテスト</h3>
          {latestAttempt ? (
            <dl className="compact-list">
              <div>
                <dt>完了日時</dt>
                <dd>{formatDateTime(latestAttempt.completedAt)}</dd>
              </div>
              <div>
                <dt>スコア</dt>
                <dd>
                  {latestAttempt.score}% / {latestAttempt.passed ? '合格' : '未合格'}
                </dd>
              </div>
              <div>
                <dt>受験者</dt>
                <dd>{latestAttempt.name}</dd>
              </div>
              <div>
                <dt>選択肢</dt>
                <dd>{choiceLanguageModeLabel(latestAttempt.choiceLanguageMode)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">テスト履歴はまだありません。</p>
          )}
          <p className="version-line">App version {APP_VERSION}</p>
        </article>
      </section>
    </main>
  );
}
