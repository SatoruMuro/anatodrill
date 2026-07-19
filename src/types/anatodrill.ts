export type QuestionType =
  | 'text_mcq'
  | 'image_label_mcq'
  | 'image_hotspot'
  | 'image_number_mcq'
  | 'single_image_mcq';

export type ChoiceLanguageMode = 'trilingual' | 'japanese' | 'english' | 'latin' | 'bilingual';

export type SelectableChoiceLanguageMode = Exclude<ChoiceLanguageMode, 'bilingual'>;

export type ImageSourceType = 'placeholder' | 'gray_anatomy' | 'openstax' | 'wikimedia_commons' | 'other';

export interface Term {
  id: string;
  japanese: string;
  english: string;
  latin: string;
  category: string;
  region: string;
  testSet: string | string[];
  explanation: string;
}

export interface Hotspot {
  x: number;
  y: number;
  radius: number;
  termId?: string;
}

export interface ImagePlateLabel {
  label: string;
  termId: string;
  x: number;
  y: number;
  note?: string;
}

export interface AnatomyImage {
  id: string;
  file: string;
  title: string;
  source: string;
  sourceType: ImageSourceType;
  author: string;
  editionYear?: string | number;
  license: string;
  sourceUrl: string;
  modified: boolean;
  modificationDescription: string;
  labels: ImagePlateLabel[];
}

export interface Question {
  id: string;
  type: QuestionType;
  testSet: string;
  prompt: string;
  answerTermId: string;
  choices: string[];
  imageId?: string;
  image?: string;
  targetLabel?: string;
  explanation?: string;
  hotspots?: Hotspot[];
}

export interface TestSet {
  id: string;
  titleJa: string;
  titleEn: string;
  descriptionJa: string;
  descriptionEn: string;
  category: string;
  region: string;
  passingScore: number;
  defaultQuestionCount: number;
  version: string;
  isActive: boolean;
  order: number;
}

export interface TermProgress {
  termId: string;
  choiceLanguageMode: ChoiceLanguageMode;
  correctCount: number;
  wrongCount: number;
  lastAnsweredAt: string | null;
  nextReviewAt: string | null;
  level: number;
}

export interface TestAttempt {
  id: string;
  name: string;
  studentId: string;
  testSetId: string;
  testSetTitleJa: string;
  testSetVersion: string;
  choiceLanguageMode: ChoiceLanguageMode;
  completedAt: string;
  total: number;
  correct: number;
  score: number;
  passingScore: number;
  passed: boolean;
  durationSeconds: number;
  certificateId: string;
  appVersion: string;
}

export interface TestResultRecord {
  appVersion: string;
  certificateId: string;
  name: string;
  studentId: string;
  testSetId: string;
  testSetTitleJa: string;
  testSetVersion: string;
  choiceLanguageMode: ChoiceLanguageMode;
  choiceLanguageLabel: string;
  dateTime: string;
  totalQuestions: number;
  correctAnswers: number;
  scorePercentage: number;
  passingScore: number;
  pass: boolean;
  durationSeconds: number;
}

export interface LearningData {
  progress: Record<string, TermProgress>;
  attempts: TestAttempt[];
}

export interface AnswerRecord {
  questionId: string;
  termId: string;
  choiceLanguageMode: ChoiceLanguageMode;
  correct: boolean;
}

export type ViewKey =
  | 'home'
  | 'drill'
  | 'review'
  | 'test'
  | 'questions'
  | 'plates'
  | 'history'
  | 'credits'
  | 'label_editor';

export interface TestParticipant {
  name: string;
  studentId: string;
}

export interface CertificatePayload {
  certificateId: string;
  participant: TestParticipant;
  testSetId: string;
  testSetTitleJa: string;
  testSetVersion: string;
  choiceLanguageLabel: string;
  completedAt: string;
  total: number;
  correct: number;
  score: number;
  passingScore: number;
  passed: boolean;
  appVersion: string;
}
