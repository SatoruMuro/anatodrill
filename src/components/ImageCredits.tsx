import type { AnatomyImage } from '../types/anatodrill';

interface ImageCreditsProps {
  images: AnatomyImage[];
}

const sourceTypeLabels: Record<AnatomyImage['sourceType'], string> = {
  placeholder: 'プレースホルダー',
  gray_anatomy: "Gray's Anatomy 1918 public domain",
  openstax: 'OpenStax',
  wikimedia_commons: 'Wikimedia Commons',
  other: 'その他',
};

export function ImageCredits({ images }: ImageCreditsProps) {
  return (
    <main className="page-shell">
      <section className="mode-heading">
        <div>
          <p className="eyebrow">Image credits</p>
          <h2>画像クレジット</h2>
        </div>
      </section>

      <section className="warning-band">
        初期実装ではプレースホルダー画像のみを使用しています。OpenStax、Wikimedia Commons、Public domain
        Gray&apos;s Anatomy plates などを追加する場合は、画像ごとに出典、作者、ライセンス、URL、改変内容を記録してください。
      </section>

      <section className="credits-support">
        <h3>対応予定の出典タイプ</h3>
        <div className="source-chip-row">
          <span>Placeholder</span>
          <span>OpenStax</span>
          <span>Wikimedia Commons</span>
          <span>Gray&apos;s Anatomy 1918 Public Domain</span>
          <span>Other CC / Public Domain</span>
        </div>
      </section>

      <section className="credit-list" aria-label="画像クレジット一覧">
        {images.map((image) => (
          <article className="credit-item" key={image.id}>
            <div>
              <p className="eyebrow">{sourceTypeLabels[image.sourceType]}</p>
              <h3>{image.title}</h3>
            </div>
            <dl className="compact-list">
              <div>
                <dt>ID</dt>
                <dd>{image.id}</dd>
              </div>
              <div>
                <dt>ファイル</dt>
                <dd>{image.file}</dd>
              </div>
              <div>
                <dt>出典</dt>
                <dd>{image.source}</dd>
              </div>
              <div>
                <dt>作者</dt>
                <dd>{image.author}</dd>
              </div>
              <div>
                <dt>版・年</dt>
                <dd>{image.editionYear || '未設定'}</dd>
              </div>
              <div>
                <dt>ライセンス</dt>
                <dd>{image.license}</dd>
              </div>
              <div>
                <dt>Source URL</dt>
                <dd>
                  {image.sourceUrl ? (
                    <a href={image.sourceUrl} target="_blank" rel="noreferrer">
                      {image.sourceUrl}
                    </a>
                  ) : (
                    'なし'
                  )}
                </dd>
              </div>
              <div>
                <dt>改変</dt>
                <dd>{image.modified ? 'あり' : 'なし'}</dd>
              </div>
              <div>
                <dt>改変内容</dt>
                <dd>{image.modificationDescription || 'なし'}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
    </main>
  );
}
