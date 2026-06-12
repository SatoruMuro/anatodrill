import { useMemo, useState } from 'react';
import type { AnatomyImage, Question, QuestionType, Term, TestSet } from '../types/anatodrill';
import { assetUrl, answerLabel, detailLabel } from '../lib/questions';
import { buildTestSetMap, fallbackTestSet } from '../lib/testSets';
import { ImagePlate } from './ImagePlate';
import { QuestionCard } from './QuestionCard';

interface QuestionBrowserProps {
  questions: Question[];
  termsById: Map<string, Term>;
  imagesById: Map<string, AnatomyImage>;
  testSets: TestSet[];
}

type QuestionTypeFilter = 'all' | QuestionType;

interface QuestionDiagnostics {
  ok: boolean;
  messages: string[];
}

const QUESTION_TYPE_OPTIONS: QuestionType[] = [
  'text_mcq',
  'single_image_mcq',
  'image_label_mcq',
  'image_number_mcq',
  'image_hotspot',
];

const IMAGE_QUESTION_TYPES = new Set<QuestionType>([
  'single_image_mcq',
  'image_label_mcq',
  'image_number_mcq',
  'image_hotspot',
]);

const questionTypeLabels: Record<QuestionType, string> = {
  text_mcq: 'テキスト選択',
  single_image_mcq: '画像同定',
  image_label_mcq: '画像選択',
  image_number_mcq: '番号図選択',
  image_hotspot: 'ホットスポット',
};

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function countBy<T extends string>(items: readonly Question[], getKey: (question: Question) => T): Record<T, number> {
  return items.reduce<Record<T, number>>(
    (acc, question) => ({
      ...acc,
      [getKey(question)]: (acc[getKey(question)] ?? 0) + 1,
    }),
    {} as Record<T, number>,
  );
}

function diagnosticsForQuestion(
  question: Question,
  termsById: Map<string, Term>,
  imagesById: Map<string, AnatomyImage>,
  testSetIds: Set<string>,
): QuestionDiagnostics {
  const messages: string[] = [];
  const answerTerm = termsById.get(question.answerTermId);
  const image = question.imageId ? imagesById.get(question.imageId) : undefined;

  if (!answerTerm) {
    messages.push(`answerTermId が見つかりません: ${question.answerTermId}`);
  }

  if (!testSetIds.has(question.testSet)) {
    messages.push(`testSet が見つかりません: ${question.testSet}`);
  }

  if (!question.choices.includes(question.answerTermId)) {
    messages.push('choices に answerTermId が含まれていません');
  }

  for (const choice of question.choices) {
    if (!termsById.has(choice)) {
      messages.push(`choice が見つかりません: ${choice}`);
    }
  }

  if (IMAGE_QUESTION_TYPES.has(question.type)) {
    if (!question.imageId) {
      messages.push('画像問題ですが imageId がありません');
    } else if (!image) {
      messages.push(`imageId が見つかりません: ${question.imageId}`);
    }
  }

  if (question.type === 'image_number_mcq') {
    if (!question.targetLabel) {
      messages.push('image_number_mcq ですが targetLabel がありません');
    } else if (image) {
      const target = image.labels.find((label) => label.label === question.targetLabel);
      if (!target) {
        messages.push(`targetLabel が図版 labels にありません: ${question.targetLabel}`);
      } else if (target.termId !== question.answerTermId) {
        messages.push(`targetLabel の termId (${target.termId}) が answerTermId と一致しません`);
      }
    }
  }

  return {
    ok: messages.length === 0,
    messages,
  };
}

function questionMatchesSearch(question: Question, answerTerm: Term | undefined, searchText: string): boolean {
  if (!searchText) {
    return true;
  }

  return [
    question.id,
    question.prompt,
    question.explanation ?? '',
    question.answerTermId,
    answerTerm?.japanese ?? '',
    answerTerm?.english ?? '',
    question.imageId ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(searchText);
}

function QuestionImagePreview({
  question,
  image,
  onOpen,
}: {
  question: Question;
  image: AnatomyImage;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="question-thumb" onClick={onOpen} aria-label={`${image.title} を拡大表示`}>
      {question.type === 'image_number_mcq' ? (
        <ImagePlate image={image} activeLabel={question.targetLabel} />
      ) : (
        <img src={assetUrl(image.file)} alt={image.title} />
      )}
    </button>
  );
}

function QuestionImageModal({
  question,
  image,
  onClose,
}: {
  question: Question;
  image: AnatomyImage;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="画像プレビュー">
      <article className="image-preview-modal">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Image preview</p>
            <h3>{image.title}</h3>
            <p className="muted">{image.id}</p>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            閉じる
          </button>
        </div>
        {question.type === 'image_number_mcq' ? (
          <ImagePlate image={image} activeLabel={question.targetLabel} />
        ) : (
          <img className="large-preview-image" src={assetUrl(image.file)} alt={image.title} />
        )}
        <p className="image-credit-inline">
          画像: {image.title} / {image.license}
        </p>
      </article>
    </div>
  );
}

function QuestionTryModal({
  question,
  termsById,
  imagesById,
  onClose,
}: {
  question: Question;
  termsById: Map<string, Term>;
  imagesById: Map<string, AnatomyImage>;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="問題プレビュー">
      <article className="question-preview-modal">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Question preview</p>
            <h3>この問題を試す</h3>
            <p className="muted">{question.id}</p>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            閉じる
          </button>
        </div>
        <QuestionCard
          key={question.id}
          question={question}
          termsById={termsById}
          imagesById={imagesById}
          sequenceLabel="プレビュー"
          continueLabel="閉じる"
          onAnswer={() => undefined}
          onContinue={onClose}
        />
      </article>
    </div>
  );
}

export function QuestionBrowser({ questions, termsById, imagesById, testSets }: QuestionBrowserProps) {
  const testSetsById = useMemo(() => buildTestSetMap(testSets), [testSets]);
  const testSetIds = useMemo(() => new Set(testSets.map((testSet) => testSet.id)), [testSets]);
  const [testSetFilter, setTestSetFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<QuestionTypeFilter>('all');
  const [imageFilter, setImageFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [previewImageQuestion, setPreviewImageQuestion] = useState<Question | null>(null);
  const [tryQuestion, setTryQuestion] = useState<Question | null>(null);

  const imageIds = useMemo(
    () =>
      [...new Set(questions.map((question) => question.imageId).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [questions],
  );

  const filteredQuestions = useMemo(() => {
    const normalizedSearchText = normalizeSearchText(searchText);
    return questions.filter((question) => {
      const answerTerm = termsById.get(question.answerTermId);
      return (
        (testSetFilter === 'all' || question.testSet === testSetFilter) &&
        (typeFilter === 'all' || question.type === typeFilter) &&
        (imageFilter === 'all' || question.imageId === imageFilter) &&
        questionMatchesSearch(question, answerTerm, normalizedSearchText)
      );
    });
  }, [questions, termsById, testSetFilter, typeFilter, imageFilter, searchText]);

  const typeCounts = useMemo(() => countBy(filteredQuestions, (question) => question.type), [filteredQuestions]);
  const testSetCounts = useMemo(() => countBy(filteredQuestions, (question) => question.testSet), [filteredQuestions]);

  const previewImage = previewImageQuestion?.imageId ? imagesById.get(previewImageQuestion.imageId) : undefined;

  return (
    <main className="page-shell question-browser-shell">
      <section className="mode-heading">
        <div>
          <p className="eyebrow">Content review</p>
          <h2>問題一覧</h2>
          <p className="muted">CSVから生成された全問題を、ランダム化せずに確認できます。</p>
        </div>
        <span className="progress-pill">
          {filteredQuestions.length} / {questions.length}
        </span>
      </section>

      <section className="question-browser-filters" aria-label="問題一覧フィルター">
        <label>
          テストセット
          <select value={testSetFilter} onChange={(event) => setTestSetFilter(event.target.value)}>
            <option value="all">すべて</option>
            {testSets
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((testSet) => (
                <option key={testSet.id} value={testSet.id}>
                  {testSet.titleJa} ({testSet.id})
                </option>
              ))}
          </select>
        </label>

        <label>
          問題タイプ
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as QuestionTypeFilter)}>
            <option value="all">すべて</option>
            {QUESTION_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label>
          imageId
          <select value={imageFilter} onChange={(event) => setImageFilter(event.target.value)}>
            <option value="all">すべて</option>
            {imageIds.map((imageId) => (
              <option key={imageId} value={imageId}>
                {imageId}
              </option>
            ))}
          </select>
        </label>

        <label className="question-search">
          検索
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="id、prompt、answer、imageId など"
          />
        </label>
      </section>

      <section className="question-browser-counts" aria-label="問題数">
        <article className="panel">
          <h3>件数</h3>
          <div className="summary-metrics">
            <div>
              <span>全問題</span>
              <strong>{questions.length}</strong>
            </div>
            <div>
              <span>表示中</span>
              <strong>{filteredQuestions.length}</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <h3>タイプ別</h3>
          <div className="source-chip-row">
            {QUESTION_TYPE_OPTIONS.map((type) => (
              <span key={type}>
                {questionTypeLabels[type]}: {typeCounts[type] ?? 0}
              </span>
            ))}
          </div>
        </article>

        <article className="panel">
          <h3>テストセット別</h3>
          <div className="source-chip-row">
            {Object.entries(testSetCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([testSetId, count]) => {
                const testSet = testSetsById.get(testSetId) ?? fallbackTestSet(testSetId);
                return (
                  <span key={testSetId}>
                    {testSet.titleJa}: {count}
                  </span>
                );
              })}
          </div>
        </article>
      </section>

      <section className="question-review-list" aria-label="問題レビュー一覧">
        {filteredQuestions.map((question) => {
          const answerTerm = termsById.get(question.answerTermId);
          const image = question.imageId ? imagesById.get(question.imageId) : undefined;
          const testSet = testSetsById.get(question.testSet) ?? fallbackTestSet(question.testSet);
          const diagnostics = diagnosticsForQuestion(question, termsById, imagesById, testSetIds);

          return (
            <article className="question-review-card" key={question.id}>
              <div className="question-review-main">
                <div className="question-review-header">
                  <div>
                    <p className="eyebrow">{question.type}</p>
                    <h3>{question.id}</h3>
                  </div>
                  <span className={diagnostics.ok ? 'status-chip ok' : 'status-chip warning'}>
                    {diagnostics.ok ? 'OK' : '警告'}
                  </span>
                </div>

                <dl className="question-review-details">
                  <div>
                    <dt>テストセット</dt>
                    <dd>
                      {testSet.titleJa} <span className="muted">({question.testSet})</span>
                    </dd>
                  </div>
                  <div>
                    <dt>prompt</dt>
                    <dd>{question.prompt || 'この構造物はどれか。'}</dd>
                  </div>
                  <div>
                    <dt>正答</dt>
                    <dd>
                      {answerTerm ? answerLabel(answerTerm) : '未登録'}{' '}
                      <span className="muted">({question.answerTermId})</span>
                    </dd>
                  </div>
                  <div>
                    <dt>imageId</dt>
                    <dd>{question.imageId || 'なし'}</dd>
                  </div>
                  <div>
                    <dt>targetLabel</dt>
                    <dd>{question.targetLabel || 'なし'}</dd>
                  </div>
                  <div>
                    <dt>choices</dt>
                    <dd>
                      <div className="choice-chip-list">
                        {question.choices.map((choiceId) => {
                          const choiceTerm = termsById.get(choiceId);
                          return (
                            <span key={choiceId} className={choiceId === question.answerTermId ? 'choice-chip answer' : 'choice-chip'}>
                              {choiceTerm ? answerLabel(choiceTerm) : '未登録'} / {choiceId}
                            </span>
                          );
                        })}
                      </div>
                    </dd>
                  </div>
                  <div>
                    <dt>解説</dt>
                    <dd>{question.explanation || answerTerm?.explanation || 'なし'}</dd>
                  </div>
                  <div>
                    <dt>診断</dt>
                    <dd>
                      {diagnostics.ok ? (
                        <span className="muted">参照は正常です。</span>
                      ) : (
                        <ul className="diagnostic-list">
                          {diagnostics.messages.map((message) => (
                            <li key={message}>{message}</li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="button-row">
                  <button type="button" className="primary-button" onClick={() => setTryQuestion(question)}>
                    この問題を試す
                  </button>
                </div>
              </div>

              <aside className="question-review-side">
                {image ? (
                  <>
                    <QuestionImagePreview question={question} image={image} onOpen={() => setPreviewImageQuestion(question)} />
                    <p className="muted">{image.title}</p>
                  </>
                ) : question.imageId ? (
                  <p className="error-text">画像が見つかりません。</p>
                ) : (
                  <p className="muted">画像なし</p>
                )}
              </aside>
            </article>
          );
        })}

        {filteredQuestions.length === 0 ? (
          <section className="empty-state">
            <h3>条件に一致する問題がありません</h3>
            <p>フィルターまたは検索語を変更してください。</p>
          </section>
        ) : null}
      </section>

      {previewImageQuestion && previewImage ? (
        <QuestionImageModal question={previewImageQuestion} image={previewImage} onClose={() => setPreviewImageQuestion(null)} />
      ) : null}

      {tryQuestion ? (
        <QuestionTryModal
          question={tryQuestion}
          termsById={termsById}
          imagesById={imagesById}
          onClose={() => setTryQuestion(null)}
        />
      ) : null}
    </main>
  );
}
