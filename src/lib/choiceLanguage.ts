import type { ChoiceLanguageMode, Question, SelectableChoiceLanguageMode, Term } from '../types/anatodrill';

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

function requestedAnswerLanguage(question: Question): SelectableChoiceLanguageMode | null {
  const prompt = question.prompt.trim();
  if (/対応する日本語|日本語(?:名)?はどれ/.test(prompt)) {
    return 'japanese';
  }
  if (/対応する英語|英語(?:名)?はどれ/.test(prompt)) {
    return 'english';
  }
  if (/対応するラテン語|ラテン語(?:名)?はどれ/.test(prompt)) {
    return 'latin';
  }
  return null;
}

function termSupportsMode(term: Term, mode: ChoiceLanguageMode): boolean {
  if (mode === 'japanese') {
    return Boolean(term.japanese.trim());
  }
  if (mode === 'english') {
    return Boolean(term.english.trim());
  }
  if (mode === 'latin') {
    return Boolean(term.latin.trim());
  }
  if (mode === 'bilingual') {
    return Boolean(term.japanese.trim() && term.english.trim());
  }
  return Boolean(term.japanese.trim() && term.english.trim() && term.latin.trim());
}

export function questionSupportsChoiceLanguage(
  question: Question,
  mode: ChoiceLanguageMode,
  termsById: ReadonlyMap<string, Term>,
): boolean {
  const requestedLanguage = requestedAnswerLanguage(question);
  if (requestedLanguage && mode !== 'bilingual' && mode !== requestedLanguage) {
    return false;
  }

  const termIds = new Set([...question.choices, question.answerTermId]);
  return [...termIds].every((termId) => {
    const term = termsById.get(termId);
    return Boolean(term && termSupportsMode(term, mode));
  });
}
