import type { LearningModality, Question } from '../types/anatodrill';

export function questionModality(question: Question): LearningModality {
  return question.type === 'text_mcq' ? 'text' : 'image';
}
