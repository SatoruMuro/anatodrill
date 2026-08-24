import type {
  DrillPreset,
  DrillQuestionFormat,
  LearningData,
  Question,
  SelectableChoiceLanguageMode,
  Term,
} from '../types/anatodrill';
import { questionSupportsChoiceLanguage } from './choiceLanguage';
import { progressKey } from './progress';
import { shuffle } from './random';
import { questionModality } from './modality';

export type DrillRegion = 'all' | 'head_neck' | 'upper_limb' | 'lower_limb' | 'back_spine' | 'thorax' | 'abdomen' | 'pelvis' | 'trunk' | 'general';
export type DrillCategory = 'all' | 'bone' | 'muscle' | 'vessel' | 'nerve' | 'organ' | 'other';

export const DRILL_PRESET_OPTIONS: Array<{ value: DrillPreset; label: string; description: string }> = [
  { value: 'today10', label: '今日の10問', description: '選択した範囲からランダムに最大10問' },
  { value: 'twenty', label: '20問', description: '選択した範囲からランダムに最大20問' },
  { value: 'weak10', label: '苦手10問', description: '誤答数・習熟度・最近の誤答をもとに最大10問' },
  { value: 'unlearned10', label: '未学習10問', description: 'この形式でまだ答えていない項目から最大10問' },
  { value: 'all', label: 'すべて', description: '選択した範囲の全問題' },
];

export const REGION_OPTIONS: Array<{ value: DrillRegion; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'head_neck', label: '頭頸部' },
  { value: 'upper_limb', label: '上肢' },
  { value: 'lower_limb', label: '下肢' },
  { value: 'back_spine', label: '背部・脊柱' },
  { value: 'thorax', label: '胸部' },
  { value: 'abdomen', label: '腹部' },
  { value: 'pelvis', label: '骨盤' },
  { value: 'trunk', label: '体幹' },
  { value: 'general', label: '全身・一般' },
];

export const CATEGORY_OPTIONS: Array<{ value: DrillCategory; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'bone', label: '骨' },
  { value: 'muscle', label: '筋' },
  { value: 'vessel', label: '血管' },
  { value: 'nerve', label: '神経' },
  { value: 'organ', label: '内臓・器官' },
  { value: 'other', label: 'その他' },
];

export const QUESTION_FORMAT_OPTIONS: Array<{ value: DrillQuestionFormat; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'text', label: '用語問題' },
  { value: 'image', label: '画像問題' },
  { value: 'numbered_plate', label: '番号付き図版' },
  { value: 'hotspot', label: 'ホットスポット' },
];

function matchesRegion(term: Term, region: DrillRegion): boolean {
  if (region === 'all') return true;
  const value = term.region.trim().toLowerCase();
  const regions: Record<Exclude<DrillRegion, 'all'>, string[]> = {
    head_neck: ['head and neck', 'neck'],
    upper_limb: ['upper limb'],
    lower_limb: ['lower limb', 'knee'],
    back_spine: ['back', 'spine'],
    thorax: ['thorax'],
    abdomen: ['abdomen'],
    pelvis: ['pelvis'],
    trunk: ['trunk'],
    general: ['general'],
  };
  return regions[region].includes(value);
}

function categoryGroup(term: Term): Exclude<DrillCategory, 'all'> {
  const value = term.category.trim().toLowerCase();
  if (value === 'bone') return 'bone';
  if (value === 'muscle') return 'muscle';
  if (['artery', 'vein', 'vessel', 'vascular'].includes(value)) return 'vessel';
  if (['nerve', 'nervous system', 'brain', 'meninges'].includes(value)) return 'nerve';
  if (['organ', 'viscera', 'gland', 'heart', 'sensory organ'].includes(value)) return 'organ';
  return 'other';
}

function matchesQuestionFormat(question: Question, format: DrillQuestionFormat): boolean {
  if (format === 'all') return true;
  if (format === 'text') return question.type === 'text_mcq';
  if (format === 'numbered_plate') return question.type === 'image_number_mcq';
  if (format === 'hotspot') return question.type === 'image_hotspot';
  return question.type === 'image_label_mcq' || question.type === 'single_image_mcq';
}

export interface DrillFilters {
  choiceLanguageMode: SelectableChoiceLanguageMode;
  region: DrillRegion;
  category: DrillCategory;
  questionFormat: DrillQuestionFormat;
}

export function filterDrillQuestions(
  questions: readonly Question[],
  termsById: ReadonlyMap<string, Term>,
  filters: DrillFilters,
): Question[] {
  return questions.filter((question) => {
    const term = termsById.get(question.answerTermId);
    return Boolean(
      term &&
        questionSupportsChoiceLanguage(question, filters.choiceLanguageMode, termsById) &&
        matchesRegion(term, filters.region) &&
        (filters.category === 'all' || categoryGroup(term) === filters.category) &&
        matchesQuestionFormat(question, filters.questionFormat),
    );
  });
}

function progressFor(question: Question, data: LearningData, mode: SelectableChoiceLanguageMode) {
  return data.progress[progressKey(question.answerTermId, mode, questionModality(question))];
}

function uniqueQuestionPerSkill(questions: Question[]): Question[] {
  const seen = new Set<string>();
  return questions.filter((question) => {
    const key = `${question.answerTermId}::${questionModality(question)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildDrillQueue(
  eligibleQuestions: readonly Question[],
  preset: DrillPreset,
  data: LearningData,
  choiceLanguageMode: SelectableChoiceLanguageMode,
): Question[] {
  if (preset === 'all') return shuffle(eligibleQuestions);
  if (preset === 'today10') return shuffle(eligibleQuestions).slice(0, 10);
  if (preset === 'twenty') return shuffle(eligibleQuestions).slice(0, 20);

  if (preset === 'unlearned10') {
    return uniqueQuestionPerSkill(
      shuffle(eligibleQuestions).filter((question) => !progressFor(question, data, choiceLanguageMode)),
    ).slice(0, 10);
  }

  const weakQuestions = shuffle(eligibleQuestions)
    .filter((question) => {
      const progress = progressFor(question, data, choiceLanguageMode);
      return Boolean(progress && (progress.wrongCount > 0 || progress.level < 2));
    })
    .sort((a, b) => {
      const aProgress = progressFor(a, data, choiceLanguageMode)!;
      const bProgress = progressFor(b, data, choiceLanguageMode)!;
      if (aProgress.wrongCount !== bProgress.wrongCount) return bProgress.wrongCount - aProgress.wrongCount;
      if (aProgress.level !== bProgress.level) return aProgress.level - bProgress.level;
      return (Date.parse(bProgress.lastWrongAt ?? '') || 0) - (Date.parse(aProgress.lastWrongAt ?? '') || 0);
    });
  return uniqueQuestionPerSkill(weakQuestions).slice(0, 10);
}

export function countDrillCandidates(
  eligibleQuestions: readonly Question[],
  preset: DrillPreset,
  data: LearningData,
  choiceLanguageMode: SelectableChoiceLanguageMode,
): number {
  return buildDrillQueue(eligibleQuestions, preset, data, choiceLanguageMode).length;
}
