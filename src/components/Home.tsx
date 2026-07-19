import type { LearningData, Question, Term, ViewKey } from '../types/anatodrill';
import { APP_VERSION } from '../lib/constants';
import { progressSummary } from '../lib/progress';
import { formatDateTime } from '../lib/dates';
import { choiceLanguageModeLabel } from '../lib/choiceLanguage';

interface HomeProps {
  terms: Term[];
  questions: Question[];
  data: LearningData;
  onNavigate: (view: ViewKey) => void;
}

export function Home({ terms, questions, data, onNavigate }: HomeProps) {
  const summary = progressSummary(terms, data);
  const latestAttempt = data.attempts[0];

  return (
    <main className="page-shell">
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">あなたと通る、アナトドリル。</p>
          <h2>忘れる頃に、もう一度。</h2>
          <p>
            正解が続くほど復習間隔を1日・3日・7日・14日・30日へと広げ、間違えた用語はその日の復習へ戻します。
            忘却曲線の考え方を取り入れた間隔反復で、解剖学用語を記憶に定着させます。
          </p>
          <p className="intro-note">
            進捗はこのブラウザに保存されます。端末を移るときは「履歴・バックアップ」から書き出せます。
          </p>
        </div>
        <div className="intro-actions">
          <button type="button" className="primary-button" onClick={() => onNavigate('drill')}>
            ドリルを開始
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
          <div className="action-list">
            <button type="button" onClick={() => onNavigate('drill')}>
              ランダムドリル
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
