import type { AnatomyImage, Question, Term } from '../types/anatodrill';

export function buildTermMap(terms: readonly Term[]): Map<string, Term> {
  return new Map(terms.map((term) => [term.id, term]));
}

export function buildImageMap(images: readonly AnatomyImage[]): Map<string, AnatomyImage> {
  return new Map(images.map((image) => [image.id, image]));
}

export function answerLabel(term: Term): string {
  return `${term.japanese} / ${term.english}`;
}

export function detailLabel(term: Term): string {
  return `${term.japanese} | ${term.english} | ${term.latin}`;
}

export function getQuestionCountsByTestSet(questions: readonly Question[]): Record<string, number> {
  return questions.reduce<Record<string, number>>((acc, question) => {
    acc[question.testSet] = (acc[question.testSet] ?? 0) + 1;
    return acc;
  }, {});
}

export function getTestSets(questions: readonly Question[]): Array<{ id: string; label: string; count: number }> {
  const counts = questions.reduce<Record<string, number>>((acc, question) => {
    acc[question.testSet] = (acc[question.testSet] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => ({
      id,
      label: id,
      count,
    }));
}

export function assetUrl(path: string): string {
  if (/^(https?:|data:)/.test(path)) {
    return path;
  }

  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}
