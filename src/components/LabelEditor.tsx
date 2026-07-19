import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { AnatomyImage, ImagePlateLabel, ImageStructureSuggestion, Term } from '../types/anatodrill';
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

interface StoredLabelDraft {
  baseFingerprint: string;
  labels: ImagePlateLabel[];
}

const LABEL_DRAFT_STORAGE_KEY = 'anatodrill.labelDrafts.v1';

function labelFingerprint(labels: readonly ImagePlateLabel[]): string {
  return JSON.stringify(
    labels.map(({ label, termId, x, y, note }) => ({ label, termId, x, y, note: note ?? '' })),
  );
}

function editableLabels(labels: readonly ImagePlateLabel[]): EditableLabel[] {
  return labels.map((label, index) => ({
    ...label,
    id: `${label.label}-${label.termId}-${index}`,
  }));
}

function loadStoredDrafts(images: readonly AnatomyImage[]): Record<string, EditableLabel[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LABEL_DRAFT_STORAGE_KEY) ?? '{}') as Record<string, StoredLabelDraft>;
    const drafts: Record<string, EditableLabel[]> = {};

    for (const image of images) {
      const stored = parsed[image.id];
      if (!stored || stored.baseFingerprint !== labelFingerprint(image.labels) || !Array.isArray(stored.labels)) {
        continue;
      }

      const validLabels = stored.labels.filter(
        (label) =>
          label &&
          typeof label.label === 'string' &&
          typeof label.termId === 'string' &&
          typeof label.x === 'number' &&
          Number.isFinite(label.x) &&
          typeof label.y === 'number' &&
          Number.isFinite(label.y),
      );
      drafts[image.id] = editableLabels(validLabels);
    }

    return drafts;
  } catch {
    return {};
  }
}

function labelsFromImage(image: AnatomyImage | undefined): EditableLabel[] {
  return editableLabels(image?.labels ?? []);
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

function termIsLabelReady(term: Term): boolean {
  return Boolean(term.japanese.trim() && term.english.trim() && term.latin.trim());
}

function exactTermMatches(terms: readonly Term[], input: string): Term[] {
  const normalizedInput = normalizeTermText(input);
  if (!normalizedInput) {
    return [];
  }

  const matches = new Map<string, Term>();
  for (const term of terms) {
    if (!termIsLabelReady(term)) {
      continue;
    }
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

  const candidates = terms.filter((term) => termIsLabelReady(term) && termMatches(term, trimmedInput));
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
  const rows = labels.map((label) => labelToCsvRow(imageId, label, terms));
  return `${header}\n${rows.join('\n')}${rows.length ? '\n' : ''}`;
}

function labelToCsvRow(imageId: string, label: EditableLabel, terms: readonly Term[]): string {
  const resolution = resolveTermInput(label.termId, terms);
  const termId = resolution.status === 'resolved' && resolution.term ? resolution.term.id : label.termId;
  return [
    imageId,
    label.label,
    termId,
    formatCoordinate(label.x),
    formatCoordinate(label.y),
    resolvedNote(label, resolution) ?? '',
  ]
    .map(csvEscape)
    .join(',');
}

function allLabelsToCsvRows(
  images: readonly AnatomyImage[],
  labelsByImageId: Readonly<Record<string, EditableLabel[]>>,
  terms: readonly Term[],
): string {
  const header = 'imageId,label,termId,x,y,note';
  const rows = images.flatMap((image) =>
    (labelsByImageId[image.id] ?? labelsFromImage(image)).map((label) => labelToCsvRow(image.id, label, terms)),
  );
  return `${header}\n${rows.join('\n')}${rows.length ? '\n' : ''}`;
}

function duplicateLabelValues(labels: readonly EditableLabel[]): string[] {
  const counts = new Map<string, number>();
  for (const label of labels) {
    const value = label.label.trim();
    if (value) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function labelsAreValid(labels: readonly EditableLabel[], terms: readonly Term[]): boolean {
  return (
    duplicateLabelValues(labels).length === 0 &&
    labels.every(
      (label) =>
        label.label.trim() !== '' &&
        resolveTermInput(label.termId, terms).status === 'resolved' &&
        Number.isFinite(label.x) &&
        label.x >= 0 &&
        label.x <= 1 &&
        Number.isFinite(label.y) &&
        label.y >= 0 &&
        label.y <= 1,
    )
  );
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
    const labelTargetImages = images.filter((image) => image.file.includes('/plates/') || image.labels.length > 0);
    const grayPlateImages = labelTargetImages.filter((image) => image.file.includes('/images/gray/plates/'));
    const otherImages = labelTargetImages.filter((image) => !image.file.includes('/images/gray/plates/'));
    return [...grayPlateImages, ...otherImages];
  }, [images]);

  const [selectedImageId, setSelectedImageId] = useState(selectableImages[0]?.id ?? '');
  const selectedImage = selectableImages.find((image) => image.id === selectedImageId);
  const [labelsByImageId, setLabelsByImageId] = useState<Record<string, EditableLabel[]>>(() => {
    const storedDrafts = loadStoredDrafts(selectableImages);
    return Object.fromEntries(
      selectableImages.map((image) => [image.id, storedDrafts[image.id] ?? labelsFromImage(image)]),
    );
  });
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
  const [showOnlyUnlabeled, setShowOnlyUnlabeled] = useState(false);

  useEffect(() => {
    try {
      const drafts: Record<string, StoredLabelDraft> = {};
      for (const image of selectableImages) {
        const currentLabels = labelsByImageId[image.id] ?? labelsFromImage(image);
        if (labelFingerprint(currentLabels) === labelFingerprint(image.labels)) {
          continue;
        }
        drafts[image.id] = {
          baseFingerprint: labelFingerprint(image.labels),
          labels: currentLabels.map(({ label, termId, x, y, note }) => ({ label, termId, x, y, ...(note ? { note } : {}) })),
        };
      }

      if (Object.keys(drafts).length === 0) {
        localStorage.removeItem(LABEL_DRAFT_STORAGE_KEY);
      } else {
        localStorage.setItem(LABEL_DRAFT_STORAGE_KEY, JSON.stringify(drafts));
      }
    } catch {
      // The editor remains usable when browser storage is unavailable.
    }
  }, [labelsByImageId, selectableImages]);

  const imageStats = useMemo(
    () =>
      selectableImages.map((image) => {
        const imageLabels = labelsByImageId[image.id] ?? labelsFromImage(image);
        return {
          image,
          labelCount: imageLabels.length,
        };
      }),
    [labelsByImageId, selectableImages],
  );
  const unlabeledImageStats = useMemo(() => imageStats.filter((item) => item.labelCount === 0), [imageStats]);
  const visibleImageStats = useMemo(
    () => (showOnlyUnlabeled ? imageStats.filter((item) => item.labelCount === 0 || item.image.id === selectedImageId) : imageStats),
    [imageStats, selectedImageId, showOnlyUnlabeled],
  );

  const matchingTerms = useMemo(
    () => terms.filter((term) => termIsLabelReady(term) && termMatches(term, termSearch)).slice(0, 24),
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
  const duplicateLabels = useMemo(() => duplicateLabelValues(labels), [labels]);
  const suggestedStructures = useMemo(() => {
    if (!selectedImage) {
      return [];
    }

    const usedTermIds = new Set(labels.map((label) => label.termId));
    const termsById = new Map(terms.map((term) => [term.id, term]));
    const usedJapaneseNames = new Set(
      labels
        .map((label) => termsById.get(label.termId)?.japanese)
        .filter((name): name is string => Boolean(name))
        .map(normalizeTermText),
    );
    const seen = new Set<string>();

    return (selectedImage.suggestions ?? []).filter((suggestion) => {
      const key = `${normalizeTermText(suggestion.japanese)}:${normalizeTermText(suggestion.english)}`;
      if (
        seen.has(key) ||
        (suggestion.termId && usedTermIds.has(suggestion.termId)) ||
        usedJapaneseNames.has(normalizeTermText(suggestion.japanese))
      ) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [labels, selectedImage, terms]);
  const draftLabelIsDuplicate = Boolean(
    draft.label.trim() && labels.some((label) => label.label.trim() === draft.label.trim()),
  );
  const canExport = invalidLabels.length === 0 && labelsAreValid(labels, terms);
  const canExportAll = useMemo(
    () => selectableImages.every((image) => labelsAreValid(labelsByImageId[image.id] ?? labelsFromImage(image), terms)),
    [labelsByImageId, selectableImages, terms],
  );

  const updateLabels = (nextLabels: EditableLabel[]) => {
    setLabelsByImageId((current) => ({
      ...current,
      [selectedImageId]: nextLabels,
    }));
  };

  const selectSuggestedStructure = (suggestion: ImageStructureSuggestion) => {
    const termInput = suggestion.termId ?? suggestion.japanese;
    setDraft((current) => ({
      ...current,
      termInput,
      note: current.note || suggestion.japanese,
    }));
    setTermSearch(termInput);
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

  const toggleShowOnlyUnlabeled = (checked: boolean) => {
    setShowOnlyUnlabeled(checked);
    if (!checked || labels.length === 0) {
      return;
    }

    const firstUnlabeledImage = imageStats.find((item) => item.labelCount === 0)?.image;
    if (firstUnlabeledImage) {
      changeImage(firstUnlabeledImage.id);
    }
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
      draftLabelIsDuplicate ||
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
      termInput: draftResolution.term.id,
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

  const resetCurrentDraft = () => {
    if (!selectedImage) {
      return;
    }
    const sourceLabels = labelsFromImage(selectedImage);
    updateLabels(sourceLabels);
    setDraft({
      label: nextLabelValue(sourceLabels),
      termInput: '',
      x: '',
      y: '',
      note: '',
    });
    setCopyStatus('この画像の下書きをCSV登録済みの状態へ戻しました。');
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
  const allCsvOutput = canExportAll
    ? allLabelsToCsvRows(selectableImages, labelsByImageId, terms)
    : 'いずれかの画像に未解決用語、重複番号、または不正な座標があります。';

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
        作業内容はこの端末に自動保存されます。完成後にCSVをダウンロードし、image_labels.csv に反映してください。
      </section>

      <section className="label-editor-layout">
        <article className="panel">
          <label className="compact-select">
            画像
            <select value={selectedImageId} onChange={(event) => changeImage(event.target.value)}>
              {visibleImageStats.map(({ image, labelCount }) => (
                <option key={image.id} value={image.id}>
                  {labelCount === 0 ? '未設定' : `設定済み ${labelCount}件`} |{' '}
                  {image.file.includes('/images/gray/plates/') ? 'Gray plate: ' : ''}
                  {image.title} ({image.id})
                </option>
              ))}
            </select>
          </label>

          <div className="label-editor-image-meta">
            <div className="label-editor-status-row">
              <span className={labels.length === 0 ? 'label-status-pill missing' : 'label-status-pill ready'}>
                {labels.length === 0 ? 'この画像はラベル未設定' : `この画像はラベル ${labels.length}件`}
              </span>
              <span className="muted">
                未設定 {unlabeledImageStats.length} / ラベル対象図版 {selectableImages.length}
              </span>
            </div>
            <label className="label-filter-toggle">
              <input
                type="checkbox"
                checked={showOnlyUnlabeled}
                onChange={(event) => toggleShowOnlyUnlabeled(event.target.checked)}
              />
              未設定のみ表示
            </label>
          </div>

          {unlabeledImageStats.length > 0 ? (
            <div className="unlabeled-image-panel">
              <p>ラベル未設定の画像</p>
              <div className="unlabeled-image-list">
                {unlabeledImageStats.map(({ image }) => (
                  <button
                    key={image.id}
                    type="button"
                    className={image.id === selectedImageId ? 'secondary-button active' : 'secondary-button'}
                    onClick={() => changeImage(image.id)}
                  >
                    {image.title}
                    <span>{image.id}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="status-line">すべての画像にラベルがあります。</p>
          )}

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

          {suggestedStructures.length > 0 ? (
            <section className="image-suggestion-panel" aria-labelledby="image-suggestion-title">
              <div className="image-suggestion-heading">
                <h4 id="image-suggestion-title">画像からの候補</h4>
                <span>{suggestedStructures.length}件</span>
              </div>
              <p>
                図版内の英語・他言語の表記や図の内容から推定した補助候補です。画像を確認してから使用してください。
              </p>
              <div className="image-suggestion-list">
                {suggestedStructures.map((suggestion) => (
                  <button
                    key={`${suggestion.japanese}:${suggestion.english}`}
                    type="button"
                    className={suggestion.termId ? 'image-suggestion-chip registered' : 'image-suggestion-chip unregistered'}
                    onClick={() => selectSuggestedStructure(suggestion)}
                  >
                    <span className="image-suggestion-name">
                      <strong>{suggestion.japanese}</strong>
                      <span>{suggestion.english}</span>
                    </span>
                    <span className="image-suggestion-state">{suggestion.termId ? '登録済み' : '未登録'}</span>
                  </button>
                ))}
              </div>
              <p className="image-suggestion-footnote">
                「未登録」は入力欄への補助入力のみです。採用する場合は、先に terms.csv へ3言語の用語を登録してください。
              </p>
            </section>
          ) : null}

          <p className={draftResolution.status === 'resolved' ? 'status-line' : 'error-text'}>
            {resolutionMessage(draftResolution)}
          </p>
          {draftLabelIsDuplicate ? (
            <p className="error-text">ラベル番号「{draft.label.trim()}」はこの画像ですでに使われています。</p>
          ) : null}

          {draftCandidates.length > 0 && draftResolution.status !== 'resolved' ? (
            <div className="term-search-results compact">
              {draftCandidates.map((term) => (
                <button
                  key={term.id}
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setDraft((current) => ({ ...current, termInput: term.id, note: current.note || term.japanese }));
                    setTermSearch(term.id);
                  }}
                >
                  {detailLabel(term)} / {term.id}
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className="primary-button"
            onClick={addLabel}
            disabled={draftResolution.status !== 'resolved' || draftLabelIsDuplicate}
          >
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
                  setDraft((current) => ({ ...current, termInput: term.id, note: current.note || term.japanese }));
                  setTermSearch(term.id);
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
              この画像のCSV
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!canExportAll}
              onClick={() =>
                downloadText('anatodrill-image_labels-all.csv', allCsvOutput, 'text/csv;charset=utf-8')
              }
            >
              全図版CSV
            </button>
            <button type="button" className="secondary-button danger" onClick={resetCurrentDraft}>
              この画像を元に戻す
            </button>
          </div>
        </div>
        {!canExport ? (
          <p className="error-text">
            未解決用語、重複番号、空欄、または不正な座標があります。修正後に出力してください。
          </p>
        ) : null}
        {duplicateLabels.length > 0 ? (
          <p className="error-text">重複しているラベル番号: {duplicateLabels.join(', ')}</p>
        ) : null}
        {!canExportAll ? <p className="error-text">別の図版にも修正が必要な下書きがあります。</p> : null}
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
