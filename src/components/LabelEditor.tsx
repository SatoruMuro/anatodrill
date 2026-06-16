import { useMemo, useState, type MouseEvent } from 'react';
import type { AnatomyImage, ImagePlateLabel, Term } from '../types/anatodrill';
import { assetUrl, detailLabel } from '../lib/questions';

interface LabelEditorProps {
  images: AnatomyImage[];
  terms: Term[];
}

interface EditableLabel extends ImagePlateLabel {
  id: string;
}

interface DraftLabel {
  label: string;
  termInput: string;
  x: number | '';
  y: number | '';
  note: string;
}

interface TermResolution {
  status: 'empty' | 'resolved' | 'ambiguous' | 'missing';
  input: string;
  term?: Term;
  candidates: Term[];
}

function labelsFromImage(image: AnatomyImage | undefined): EditableLabel[] {
  return (image?.labels ?? []).map((label, index) => ({
    ...label,
    id: `${label.label}-${label.termId}-${index}`,
  }));
}

function nextLabelValue(labels: readonly EditableLabel[]): string {
  const numericLabels = labels.map((label) => Number(label.label)).filter((value) => Number.isFinite(value));
  return String((numericLabels.length ? Math.max(...numericLabels) : 0) + 1);
}

function formatCoordinate(value: number): string {
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normalizeTermText(value: string): string {
  return value.trim().toLowerCase();
}

function exactTermMatches(terms: readonly Term[], input: string): Term[] {
  const normalizedInput = normalizeTermText(input);
  if (!normalizedInput) {
    return [];
  }

  const matches = new Map<string, Term>();
  for (const term of terms) {
    const values = [term.id, term.japanese, term.english, term.latin].map(normalizeTermText);
    if (values.includes(normalizedInput)) {
      matches.set(term.id, term);
    }
  }
  return [...matches.values()];
}

function resolveTermInput(input: string, terms: readonly Term[]): TermResolution {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    return { status: 'empty', input: trimmedInput, candidates: [] };
  }

  const exactMatches = exactTermMatches(terms, trimmedInput);
  if (exactMatches.length === 1) {
    return { status: 'resolved', input: trimmedInput, term: exactMatches[0], candidates: exactMatches };
  }
  if (exactMatches.length > 1) {
    return { status: 'ambiguous', input: trimmedInput, candidates: exactMatches };
  }

  const candidates = terms.filter((term) => termMatches(term, trimmedInput));
  return {
    status: candidates.length > 0 ? 'ambiguous' : 'missing',
    input: trimmedInput,
    candidates,
  };
}

function resolvedNote(label: EditableLabel, resolution: TermResolution): string | undefined {
  const note = label.note?.trim();
  if (note) {
    return note;
  }
  if (resolution.status !== 'resolved' || !resolution.term) {
    return undefined;
  }
  return resolution.input === resolution.term.japanese ? resolution.input : resolution.term.japanese;
}

function labelsToCsvRows(imageId: string, labels: readonly EditableLabel[], terms: readonly Term[]): string {
  const header = 'imageId,label,termId,x,y,note';
  const rows = labels.map((label) => {
    const resolution = resolveTermInput(label.termId, terms);
    const termId = resolution.status === 'resolved' && resolution.term ? resolution.term.id : label.termId;
    return [imageId, label.label, termId, formatCoordinate(label.x), formatCoordinate(label.y), resolvedNote(label, resolution) ?? '']
      .map(csvEscape)
      .join(',');
  });
  return `${header}\n${rows.join('\n')}${rows.length ? '\n' : ''}`;
}

function labelsToJson(labels: readonly EditableLabel[], terms: readonly Term[]): string {
  return JSON.stringify(
    labels.map((label) => {
      const resolution = resolveTermInput(label.termId, terms);
      const resolvedTermId = resolution.status === 'resolved' && resolution.term ? resolution.term.id : label.termId;
      const note = resolvedNote(label, resolution);
      return {
        label: label.label,
        termId: resolvedTermId,
        x: label.x,
        y: label.y,
        ...(note ? { note } : {}),
      };
    }),
    null,
    2,
  );
}

function downloadText(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function termMatches(term: Term, search: string): boolean {
  if (!search) {
    return true;
  }

  return [term.id, term.japanese, term.english, term.latin]
    .join(' ')
    .toLowerCase()
    .includes(search.toLowerCase());
}

function resolutionMessage(resolution: TermResolution): string {
  if (resolution.status === 'empty') {
    return '構造名またはtermIdを入力してください。';
  }
  if (resolution.status === 'resolved' && resolution.term) {
    return `解決済み: ${resolution.term.japanese} / ${resolution.term.english} / ${resolution.term.id}`;
  }
  if (resolution.status === 'ambiguous') {
    return '候補が複数あります。下の候補から選択してください。';
  }
  return '対応する用語が見つかりません。terms.csv に用語を追加してください。';
}

export function LabelEditor({ images, terms }: LabelEditorProps) {
  const selectableImages = useMemo(() => {
    const grayPlateImages = images.filter((image) => image.file.includes('/images/gray/plates/'));
    const otherImages = images.filter((image) => !image.file.includes('/images/gray/plates/'));
    return [...grayPlateImages, ...otherImages];
  }, [images]);

  const [selectedImageId, setSelectedImageId] = useState(selectableImages[0]?.id ?? '');
  const selectedImage = selectableImages.find((image) => image.id === selectedImageId);
  const [labelsByImageId, setLabelsByImageId] = useState<Record<string, EditableLabel[]>>(() =>
    Object.fromEntries(selectableImages.map((image) => [image.id, labelsFromImage(image)])),
  );
  const labels = labelsByImageId[selectedImageId] ?? [];
  const [draft, setDraft] = useState<DraftLabel>({
    label: nextLabelValue(labels),
    termInput: '',
    x: '',
    y: '',
    note: '',
  });
  const [termSearch, setTermSearch] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const matchingTerms = useMemo(
    () => terms.filter((term) => termMatches(term, termSearch)).slice(0, 24),
    [terms, termSearch],
  );
  const draftResolution = useMemo(() => resolveTermInput(draft.termInput, terms), [draft.termInput, terms]);
  const draftCandidates = useMemo(
    () => (draft.termInput.trim() ? resolveTermInput(draft.termInput, terms).candidates.slice(0, 24) : []),
    [draft.termInput, terms],
  );
  const invalidLabels = useMemo(
    () => labels.filter((label) => resolveTermInput(label.termId, terms).status !== 'resolved'),
    [labels, terms],
  );
  const canExport = invalidLabels.length === 0;

  const updateLabels = (nextLabels: EditableLabel[]) => {
    setLabelsByImageId((current) => ({
      ...current,
      [selectedImageId]: nextLabels,
    }));
  };

  const changeImage = (imageId: string) => {
    const nextLabels = labelsByImageId[imageId] ?? labelsFromImage(selectableImages.find((image) => image.id === imageId));
    setSelectedImageId(imageId);
    setDraft({
      label: nextLabelValue(nextLabels),
      termInput: '',
      x: '',
      y: '',
      note: '',
    });
    setCopyStatus('');
  };

  const handleImageClick = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setDraft((current) => ({
      ...current,
      label: current.label || nextLabelValue(labels),
      x: Number(formatCoordinate(x)),
      y: Number(formatCoordinate(y)),
    }));
  };

  const addLabel = () => {
    if (
      draft.x === '' ||
      draft.y === '' ||
      !draft.label.trim() ||
      draftResolution.status !== 'resolved' ||
      !draftResolution.term
    ) {
      return;
    }

    const note = draft.note.trim() || (draftResolution.input === draftResolution.term.japanese ? draftResolution.input : draftResolution.term.japanese);
    const nextLabels = [
      ...labels,
      {
        id: `label-${Date.now()}`,
        label: draft.label.trim(),
        termId: draftResolution.term.id,
        x: Number(draft.x),
        y: Number(draft.y),
        note,
      },
    ];
    updateLabels(nextLabels);
    setDraft({
      label: nextLabelValue(nextLabels),
      termInput: draftResolution.term.japanese,
      x: '',
      y: '',
      note: '',
    });
  };

  const updateLabel = (id: string, field: keyof ImagePlateLabel, value: string) => {
    updateLabels(
      labels.map((label) => {
        if (label.id !== id) {
          return label;
        }

        if (field === 'x' || field === 'y') {
          const numericValue = Number(value);
          return {
            ...label,
            [field]: Number.isFinite(numericValue) ? Math.min(1, Math.max(0, numericValue)) : label[field],
          };
        }

        return {
          ...label,
          [field]: value,
        };
      }),
    );
  };

  const deleteLabel = (id: string) => {
    updateLabels(labels.filter((label) => label.id !== id));
  };

  const copyJson = async () => {
    if (!canExport) {
      return;
    }
    await copyText(labelsToJson(labels, terms));
    setCopyStatus('JSONをクリップボードにコピーしました。');
  };

  if (!selectedImage) {
    return (
      <main className="page-shell">
        <section className="empty-state">
          <h2>ラベル作成に使える画像がありません</h2>
          <p>images.json に画像を追加してください。</p>
        </section>
      </main>
    );
  }

  const jsonOutput = canExport
    ? labelsToJson(labels, terms)
    : '未解決または曖昧な用語があります。候補から選択するか、terms.csv に用語を追加してください。';
  const csvOutput = canExport
    ? labelsToCsvRows(selectedImage.id, labels, terms)
    : '未解決または曖昧な用語があります。候補から選択するか、terms.csv に用語を追加してください。';

  return (
    <main className="page-shell label-editor-shell">
      <section className="mode-heading">
        <div>
          <p className="eyebrow">Developer tool</p>
          <h2>ラベル作成</h2>
          <p className="muted">画像をクリックして、image_labels.csv 用の番号ラベルを作成します。</p>
        </div>
      </section>

      <section className="warning-band">
        開発者モードです。ラベル作成ツールの出力を image_labels.csv に手動で反映してください。
      </section>

      <section className="label-editor-layout">
        <article className="panel">
          <label className="compact-select">
            画像
            <select value={selectedImageId} onChange={(event) => changeImage(event.target.value)}>
              {selectableImages.map((image) => (
                <option key={image.id} value={image.id}>
                  {image.file.includes('/images/gray/plates/') ? 'Gray plate: ' : ''}
                  {image.title} ({image.id})
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="label-editor-image" onClick={handleImageClick}>
            <img src={assetUrl(selectedImage.file)} alt={selectedImage.title} />
            <span className="plate-marker-layer" aria-hidden="true">
              {labels.map((label) => (
                <span
                  key={label.id}
                  className="plate-marker"
                  style={{ left: `${label.x * 100}%`, top: `${label.y * 100}%` }}
                >
                  <span className="plate-marker-visual">{label.label}</span>
                </span>
              ))}
              {draft.x !== '' && draft.y !== '' ? (
                <span
                  className="plate-marker pending"
                  style={{ left: `${Number(draft.x) * 100}%`, top: `${Number(draft.y) * 100}%` }}
                >
                  <span className="plate-marker-visual">{draft.label || '+'}</span>
                </span>
              ) : null}
            </span>
          </button>

          <p className="image-credit-inline">
            画像: {selectedImage.title} / {selectedImage.file}
          </p>
        </article>

        <article className="panel label-editor-controls">
          <h3>ラベル入力</h3>
          <div className="label-editor-form">
            <label>
              label
              <input
                value={draft.label}
                onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
              />
            </label>
            <label>
              構造名 / termId
              <input
                value={draft.termInput}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, termInput: event.target.value }));
                  setTermSearch(event.target.value);
                }}
                placeholder="例: 胸椎 / thoracic_vertebra"
              />
            </label>
            <label>
              x
              <input
                type="number"
                min="0"
                max="1"
                step="0.0001"
                value={draft.x}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, x: event.target.value === '' ? '' : Number(event.target.value) }))
                }
              />
            </label>
            <label>
              y
              <input
                type="number"
                min="0"
                max="1"
                step="0.0001"
                value={draft.y}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, y: event.target.value === '' ? '' : Number(event.target.value) }))
                }
              />
            </label>
            <label className="label-editor-note">
              note
              <input
                value={draft.note}
                onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              />
            </label>
          </div>

          <p className={draftResolution.status === 'resolved' ? 'status-line' : 'error-text'}>
            {resolutionMessage(draftResolution)}
          </p>

          {draftCandidates.length > 0 && draftResolution.status !== 'resolved' ? (
            <div className="term-search-results compact">
              {draftCandidates.map((term) => (
                <button
                  key={term.id}
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setDraft((current) => ({ ...current, termInput: term.japanese, note: current.note || term.japanese }));
                    setTermSearch(term.japanese);
                  }}
                >
                  {detailLabel(term)} / {term.id}
                </button>
              ))}
            </div>
          ) : null}

          <button type="button" className="primary-button" onClick={addLabel} disabled={draftResolution.status !== 'resolved'}>
            ラベルを追加
          </button>

          <label className="term-search-box">
            用語検索
            <input
              value={termSearch}
              onChange={(event) => setTermSearch(event.target.value)}
              placeholder="termId / 日本語 / English / Latin"
            />
          </label>
          <div className="term-search-results">
            {matchingTerms.map((term) => (
              <button
                key={term.id}
                type="button"
                className="secondary-button"
                onClick={() => {
                  setDraft((current) => ({ ...current, termInput: term.japanese, note: current.note || term.japanese }));
                  setTermSearch(term.japanese);
                }}
              >
                {detailLabel(term)} / {term.id}
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="panel label-table-panel">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">image_labels.csv rows</p>
            <h3>作成中のラベル</h3>
          </div>
          <div className="button-row">
            <button type="button" className="secondary-button" disabled={!canExport} onClick={copyJson}>
              JSONコピー
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!canExport}
              onClick={() => downloadText(`${selectedImage.id}-labels.json`, jsonOutput, 'application/json')}
            >
              JSONダウンロード
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!canExport}
              onClick={() => downloadText(`${selectedImage.id}-image_labels.csv`, csvOutput, 'text/csv;charset=utf-8')}
            >
              CSVダウンロード
            </button>
          </div>
        </div>
        {!canExport ? (
          <p className="error-text">
            未解決の用語があります。CSV/JSONを出力する前に、候補から正しい用語を選択してください。
          </p>
        ) : null}
        {copyStatus ? <p className="status-line">{copyStatus}</p> : null}

        <div className="label-table-scroll">
          <table className="label-editor-table">
            <thead>
              <tr>
                <th>label</th>
                <th>termId</th>
                <th>x</th>
                <th>y</th>
                <th>note</th>
                <th>term</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {labels.map((label) => {
                const resolution = resolveTermInput(label.termId, terms);
                const term = resolution.term;
                return (
                  <tr key={label.id}>
                    <td>
                      <input value={label.label} onChange={(event) => updateLabel(label.id, 'label', event.target.value)} />
                    </td>
                    <td>
                      <input value={label.termId} onChange={(event) => updateLabel(label.id, 'termId', event.target.value)} />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.0001"
                        value={formatCoordinate(label.x)}
                        onChange={(event) => updateLabel(label.id, 'x', event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.0001"
                        value={formatCoordinate(label.y)}
                        onChange={(event) => updateLabel(label.id, 'y', event.target.value)}
                      />
                    </td>
                    <td>
                      <input value={label.note ?? ''} onChange={(event) => updateLabel(label.id, 'note', event.target.value)} />
                    </td>
                    <td>
                      {resolution.status === 'resolved' && term ? (
                        detailLabel(term)
                      ) : (
                        <span className="error-text">{resolutionMessage(resolution)}</span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="secondary-button danger" onClick={() => deleteLabel(label.id)}>
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="label-output-grid">
          <label>
            JSON
            <textarea readOnly value={jsonOutput} />
          </label>
          <label>
            CSV
            <textarea readOnly value={csvOutput} />
          </label>
        </div>
      </section>
    </main>
  );
}
