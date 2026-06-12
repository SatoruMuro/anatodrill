import { useMemo, useState } from 'react';
import type { AnatomyImage, AnswerRecord, LearningData, Question, Term } from '../types/anatodrill';
import { dueQuestions } from '../lib/progress';
import { QuestionCard } from './QuestionCard';

interface ReviewModeProps {
  questions: Question[];
  terms: Term[];
  termsById: Map<string, Term>;
  imagesById: Map<string, AnatomyImage>;
  data: LearningData;
  onRecordAnswer: (record: AnswerRecord) => void;
}

export function ReviewMode({ questions, terms, termsById, imagesById, data, onRecordAnswer }: ReviewModeProps) {
  const initialQueue = useMemo(() => dueQuestions(questions, terms, data), [questions, terms, data]);
  const [queue] = useState(initialQueue);
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState(initialQueue.length === 0);

  if (queue.length === 0 || completed) {
    return (
      <main className="page-shell">
        <section className="result-hero">
          <p className="eyebrow">Today&apos;s review</p>
          <h2>今日の復習は完了です。</h2>
          <p>期限が来た問題が追加されると、ここに表示されます。</p>
        </section>
      </main>
    );
  }

  const current = queue[index];
  const progress = data.progress[current.answerTermId];

  return (
    <main className="page-shell narrow">
      <section className="mode-heading">
        <div>
          <p className="eyebrow">Today&apos;s review</p>
          <h2>今日の復習</h2>
          {progress?.wrongCount ? <p className="muted">この用語の誤答数: {progress.wrongCount}</p> : null}
        </div>
        <span className="progress-pill">
          {index + 1} / {queue.length}
        </span>
      </section>

      <QuestionCard
        key={`${current.id}-review-${index}`}
        question={current}
        termsById={termsById}
        imagesById={imagesById}
        sequenceLabel={`復習 ${index + 1}`}
        continueLabel={index + 1 === queue.length ? '完了' : '次へ'}
        onAnswer={onRecordAnswer}
        onContinue={() => {
          if (index + 1 >= queue.length) {
            setCompleted(true);
          } else {
            setIndex((value) => value + 1);
          }
        }}
      />
    </main>
  );
}
