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

interface PendingTermRegistration {
  input: string;
  suggestedId: string;
  japanese: string;
  english: string;
  latin: string;
  category: string;
  region: string;
  testSet: string;
  explanation: string;
  usedBy: string[];
}

interface LabelUpdateBundle {
  format: 'anatodrill-label-update-v1';
  images: Array<{
    imageId: string;
    title: string;
    replaceExistingLabels: true;
    labels: ImagePlateLabel[];
  }>;
  termsToRegister: PendingTermRegistration[];
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
    status: 'missing',
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
      (label) => {
        const resolution = resolveTermInput(label.termId, terms);
        return (
          label.label.trim() !== '' &&
          (resolution.status === 'resolved' || resolution.status === 'missing') &&
          Number.isFinite(label.x) &&
          label.x >= 0 &&
          label.x <= 1 &&
          Number.isFinite(label.y) &&
          label.y >= 0 &&
          label.y <= 1
        );
      },
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

function plainLabel(label: EditableLabel, terms: readonly Term[]): ImagePlateLabel {
  const resolution = resolveTermInput(label.termId, terms);
  const termId = resolution.status === 'resolved' && resolution.term ? resolution.term.id : resolution.input;
  const note = resolvedNote(label, resolution);
  return {
    label: label.label,
    termId,
    x: label.x,
    y: label.y,
    ...(note ? { note } : {}),
  };
}

function containsJapanese(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value);
}

function suggestedTermId(value: string): string {
  if (!value || containsJapanese(value)) {
    return '';
  }
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function pendingRegistrationForLabel(
  image: AnatomyImage,
  label: EditableLabel,
  terms: readonly Term[],
): PendingTermRegistration | undefined {
  const resolution = resolveTermInput(label.termId, terms);
  if (resolution.status !== 'missing') {
    return undefined;
  }

  const input = resolution.input;
  const normalizedInput = normalizeTermText(input);
  const suggestion = (image.suggestions ?? []).find((candidate) =>
    [candidate.japanese, candidate.english].map(normalizeTermText).includes(normalizedInput),
  );
  const note = label.note?.trim() ?? '';
  const japanese =
    suggestion?.japanese ??
    (containsJapanese(input) ? input : containsJapanese(note) ? note : '');
  const english = suggestion?.english ?? (!containsJapanese(input) ? input : '');

  return {
    input,
    suggestedId: suggestedTermId(english),
    japanese: japanese || (containsJapanese(note) ? note : ''),
    english,
    latin: '',
    category: '',
    region: '',
    testSet: '',
    explanation: '',
    usedBy: [`${image.id}:${label.label}`],
  };
}

function createLabelUpdateBundle(
  images: readonly AnatomyImage[],
  labelsByImageId: Readonly<Record<string, EditableLabel[]>>,
  terms: readonly Term[],
): LabelUpdateBundle {
  const termsToRegister = new Map<string, PendingTermRegistration>();
  const imageEntries = images.map((image) => {
    const imageLabels = labelsByImageId[image.id] ?? labelsFromImage(image);
    for (const label of imageLabels) {
      const pending = pendingRegistrationForLabel(image, label, terms);
      if (!pending) {
        continue;
      }
      const key = normalizeTermText(pending.input);
      const existing = termsToRegister.get(key);
      if (existing) {
        existing.usedBy = [...new Set([...existing.usedBy, ...pending.usedBy])];
        existing.suggestedId ||= pending.suggestedId;
        existing.japanese ||= pending.japanese;
        existing.english ||= pending.english;
      } else {
        termsToRegister.set(key, pending);
      }
    }

    return {
      imageId: image.id,
      title: image.title,
      replaceExistingLabels: true as const,
      labels: imageLabels.map((label) => plainLabel(label, terms)),
    };
  });

  return {
    format: 'anatodrill-label-update-v1',
    images: imageEntries,
    termsToRegister: [...termsToRegister.values()],
  };
}

function labelUpdateBundleToJson(bundle: LabelUpdateBundle): string {
  return JSON.stringify(bundle, null, 2);
}

function labelUpdateBundleToCsv(bundle: LabelUpdateBundle, terms: readonly Term[]): string {
  const header = [
    'recordType',
    'imageId',
    'label',
    'termId',
    'x',
    'y',
    'note',
    'registrationRequired',
    'suggestedId',
    'japanese',
    'english',
    'latin',
    'category',
    'region',
    'testSet',
    'explanation',
    'usedBy',
  ];
  const rows: unknown[][] = [];

  for (const image of bundle.images) {
    for (const label of image.labels) {
      const resolution = resolveTermInput(label.termId, terms);
      rows.push([
        'label',
        image.imageId,
        label.label,
        label.termId,
        formatCoordinate(label.x),
        formatCoordinate(label.y),
        label.note ?? '',
        resolution.status === 'missing' ? 'true' : 'false',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
    }
  }

  for (const pending of bundle.termsToRegister) {
    rows.push([
      'term_to_register',
      '',
      '',
      pending.input,
      '',
      '',
      '',
      'true',
      pending.suggestedId,
      pending.japanese,
      pending.english,
      pending.latin,
      pending.category,
      pending.region,
      pending.testSet,
      pending.explanation,
      pending.usedBy.join('|'),
    ]);
  }

  return `${header.map(csvEscape).join(',')}\n${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}${rows.length ? '\n' : ''}`;
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
    return '同名の登録済み用語が複数あります。下の候補から選択してください。';
  }
  return resolution.candidates.length > 0
    ? '完全一致する用語は未登録です。候補を選ぶか、「要登録」としてこのまま追加できます。'
    : '未登録用語です。「要登録」としてこのままラベルへ追加できます。';
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
  const blockingLabels = useMemo(
    () =>
      labels.filter((label) => {
        const status = resolveTermInput(label.termId, terms).status;
        return status === 'empty' || status === 'ambiguous';
      }),
    [labels, terms],
  );
  const pendingLabels = useMemo(
    () => labels.filter((label) => resolveTermInput(label.termId, terms).status === 'missing'),
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
  const canExport = blockingLabels.length === 0 && labelsAreValid(labels, terms);
  const canExportAll = useMemo(
    () => selectableImages.every((image) => labelsAreValid(labelsByImageId[image.id] ?? labelsFromImage(image), terms)),
    [labelsByImageId, selectableImages, terms],
  );
  const currentBundle = useMemo(
    () => createLabelUpdateBundle(selectedImage ? [selectedImage] : [], labelsByImageId, terms),
    [labelsByImageId, selectedImage, terms],
  );
  const allBundle = useMemo(
    () => createLabelUpdateBundle(selectableImages, labelsByImageId, terms),
    [labelsByImageId, selectableImages, terms],
  );
  const canAddDraft =
    draft.label.trim() !== '' &&
    draft.x !== '' &&
    draft.y !== '' &&
    !draftLabelIsDuplicate &&
    (draftResolution.status === 'resolved' || draftResolution.status === 'missing');

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
    const imageElement = event.currentTarget.querySelector('img');
    if (!imageElement) {
      return;
    }

    const rect = imageElement.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return;
    }

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
      (draftResolution.status !== 'resolved' && draftResolution.status !== 'missing')
    ) {
      return;
    }

    const termId =
      draftResolution.status === 'resolved' && draftResolution.term
        ? draftResolution.term.id
        : draftResolution.input;
    const note =
      draft.note.trim() ||
      (draftResolution.status === 'resolved' && draftResolution.term
        ? draftResolution.term.japanese
        : draftResolution.input);
    const nextLabels = [
      ...labels,
      {
        id: `label-${Date.now()}`,
        label: draft.label.trim(),
        termId,
        x: Number(draft.x),
        y: Number(draft.y),
        note,
      },
    ];
    updateLabels(nextLabels);
    setDraft({
      label: nextLabelValue(nextLabels),
      termInput: termId,
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
    await copyText(labelUpdateBundleToJson(currentBundle));
    setCopyStatus('ラベルと要登録リストを含む一括更新JSONをコピーしました。');
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
    ? labelUpdateBundleToJson(currentBundle)
    : '同名で曖昧な用語、重複番号、空欄、または不正な座標があります。';
  const csvOutput = canExport
    ? labelUpdateBundleToCsv(currentBundle, terms)
    : '同名で曖昧な用語、重複番号、空欄、または不正な座標があります。';
  const allCsvOutput = canExportAll
    ? labelUpdateBundleToCsv(allBundle, terms)
    : 'いずれかの画像に曖昧な用語、重複番号、空欄、または不正な座標があります。';
  const labelsOnlyJsonOutput = labelsToJson(labels, terms);
  const labelsOnlyCsvOutput = labelsToCsvRows(selectedImage.id, labels, terms);
  const allLabelsOnlyCsvOutput = allLabelsToCsvRows(selectableImages, labelsByImageId, terms);

  return (
    <main className="page-shell label-editor-shell">
      <section className="mode-heading">
        <div>
          <p className="eyebrow">Developer tool</p>
          <h2>ラベル作成</h2>
          <p className="muted">登録済み・未登録を問わず、画像をクリックして番号ラベルを作成します。</p>
        </div>
      </section>

      <section className="warning-band">
        作業内容はこの端末に自動保存されます。未登録語は「要登録」として保存され、一括更新JSON・CSVにラベル情報と一緒に含まれます。
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
                登録済み候補はそのまま使用できます。未登録候補もラベルに使え、一括更新ファイルの要登録リストに含まれます。
              </p>
            </section>
          ) : null}

          <p
            className={
              draftResolution.status === 'resolved'
                ? 'status-line'
                : draftResolution.status === 'missing'
                  ? 'pending-registration-text'
                  : 'error-text'
            }
          >
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
            disabled={!canAddDraft}
          >
            {draftResolution.status === 'missing' ? '要登録としてラベルを追加' : 'ラベルを追加'}
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
            <p className="eyebrow">Label update bundle</p>
            <h3>作成中のラベル</h3>
            <p className="muted">要登録 {currentBundle.termsToRegister.length}件 / ラベル {labels.length}件</p>
          </div>
          <div className="button-row">
            <button type="button" className="secondary-button" disabled={!canExport} onClick={copyJson}>
              一括更新JSONコピー
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!canExport}
              onClick={() =>
                downloadText(`${selectedImage.id}-anatodrill-label-update.json`, jsonOutput, 'application/json')
              }
            >
              一括更新JSON
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!canExport}
              onClick={() =>
                downloadText(`${selectedImage.id}-anatodrill-label-update.csv`, csvOutput, 'text/csv;charset=utf-8')
              }
            >
              一括更新CSV
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!canExportAll}
              onClick={() =>
                downloadText('anatodrill-label-update-all.csv', allCsvOutput, 'text/csv;charset=utf-8')
              }
            >
              全図版一括CSV
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!canExport}
              onClick={() => downloadText(`${selectedImage.id}-labels-only.json`, labelsOnlyJsonOutput, 'application/json')}
            >
              ラベルJSONのみ
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!canExport || pendingLabels.length > 0}
              title={pendingLabels.length > 0 ? '要登録用語があるため、一括更新ファイルを使用してください。' : ''}
              onClick={() =>
                downloadText(`${selectedImage.id}-image_labels.csv`, labelsOnlyCsvOutput, 'text/csv;charset=utf-8')
              }
            >
              image_labels.csvのみ
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!canExportAll || allBundle.termsToRegister.length > 0}
              title={allBundle.termsToRegister.length > 0 ? '要登録用語があるため、全図版一括CSVを使用してください。' : ''}
              onClick={() =>
                downloadText('anatodrill-image_labels-all.csv', allLabelsOnlyCsvOutput, 'text/csv;charset=utf-8')
              }
            >
              全image_labels.csv
            </button>
            <button type="button" className="secondary-button danger" onClick={resetCurrentDraft}>
              この画像を元に戻す
            </button>
          </div>
        </div>
        {!canExport ? (
          <p className="error-text">
            同名で曖昧な用語、重複番号、空欄、または不正な座標があります。修正後に出力してください。
          </p>
        ) : null}
        {currentBundle.termsToRegister.length > 0 ? (
          <section className="pending-term-panel" aria-labelledby="pending-term-title">
            <div className="pending-term-heading">
              <h4 id="pending-term-title">要登録リスト</h4>
              <span>{currentBundle.termsToRegister.length}件</span>
            </div>
            <p>この用語は未登録ですが、ラベル作業を続けられます。一括更新JSON・CSVに登録情報として同梱されます。</p>
            <div className="pending-term-list">
              {currentBundle.termsToRegister.map((pending) => (
                <article key={pending.input} className="pending-term-card">
                  <strong>{pending.japanese || pending.input}</strong>
                  <span>{pending.english || '英語：登録時に補完'}</span>
                  <span>{pending.latin || 'ラテン語：登録時に補完'}</span>
                  <small>候補ID: {pending.suggestedId || '登録時に決定'} / {pending.usedBy.join(', ')}</small>
                </article>
              ))}
            </div>
          </section>
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
                      ) : resolution.status === 'missing' ? (
                        <span className="pending-registration-text">要登録: {resolution.input}</span>
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
            一括更新JSON
            <textarea readOnly value={jsonOutput} />
          </label>
          <label>
            一括更新CSV
            <textarea readOnly value={csvOutput} />
          </label>
        </div>
      </section>
    </main>
  );
}
