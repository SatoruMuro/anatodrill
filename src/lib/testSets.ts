import type { TestSet } from '../types/anatodrill';

export function activeTestSets(testSets: readonly TestSet[]): TestSet[] {
  return [...testSets].filter((testSet) => testSet.isActive).sort((a, b) => a.order - b.order);
}

export function buildTestSetMap(testSets: readonly TestSet[]): Map<string, TestSet> {
  return new Map(testSets.map((testSet) => [testSet.id, testSet]));
}

export function fallbackTestSet(id: string): TestSet {
  return {
    id,
    titleJa: id,
    titleEn: id,
    descriptionJa: '',
    descriptionEn: '',
    category: '',
    region: '',
    passingScore: 80,
    defaultQuestionCount: 30,
    version: 'unknown',
    isActive: true,
    order: 0,
  };
}
