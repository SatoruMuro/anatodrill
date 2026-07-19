import type { ChoiceLanguageMode, SelectableChoiceLanguageMode, Term } from '../types/anatodrill';

interface ChoiceLanguageOption {
  value: SelectableChoiceLanguageMode;
  label: string;
  drillLabel: string;
  testLabel: string;
  description: string;
}

export const CHOICE_LANGUAGE_OPTIONS: readonly ChoiceLanguageOption[] = [
  {
    value: 'trilingual',
    label: '日本語・英語・ラテン語併記',
    drillLabel: '3言語併記ドリル',
    testLabel: '3言語併記テスト',
    description: '選択肢を「日本語 / 英語 / ラテン語」で表示します。',
  },
  {
    value: 'japanese',
    label: '日本語のみ',
    drillLabel: '日本語ドリル',
    testLabel: '日本語テスト',
    description: '選択肢を日本語だけで表示します。',
  },
  {
    value: 'english',
    label: '英語のみ',
    drillLabel: '英語ドリル',
    testLabel: '英語テスト',
    description: '選択肢を英語だけで表示します。',
  },
  {
    value: 'latin',
    label: 'ラテン語のみ',
    drillLabel: 'ラテン語ドリル',
    testLabel: 'ラテン語テスト',
    description: '選択肢をラテン語だけで表示します。',
  },
];

export function isChoiceLanguageMode(value: unknown): value is ChoiceLanguageMode {
  return value === 'trilingual' || value === 'japanese' || value === 'english' || value === 'latin' || value === 'bilingual';
}

export function choiceLanguageModeLabel(mode: ChoiceLanguageMode): string {
  if (mode === 'bilingual') {
    return '日本語・英語併記（旧形式）';
  }

  return CHOICE_LANGUAGE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

export function termChoiceLabel(term: Term, mode: ChoiceLanguageMode): string {
  if (mode === 'japanese') {
    return term.japanese;
  }
  if (mode === 'english') {
    return term.english;
  }
  if (mode === 'latin') {
    return term.latin;
  }
  if (mode === 'bilingual') {
    return `${term.japanese} / ${term.english}`;
  }

  return `${term.japanese} / ${term.english} / ${term.latin}`;
}
