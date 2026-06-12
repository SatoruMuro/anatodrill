import { useMemo, useState } from 'react';
import type { AnatomyImage, AnswerRecord, Question, Term } from '../types/anatodrill';
import { shuffle } from '../lib/random';
import { QuestionCard } from './QuestionCard';

interface DrillModeProps {
  questions: Question[];
  termsById: Map<string, Term>;
  imagesById: Map<string, AnatomyImage>;
  onRecordAnswer: (record: AnswerRecord) => void;
}

export function DrillMode({ questions, termsById, imagesById, onRecordAnswer }: DrillModeProps) {
  const [sessionId, setSessionId] = useState(1);
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const queue = useMemo(() => shuffle(questions), [questions, sessionId]);

  const restart = () => {
    setSessionId((value) => value + 1);
    setIndex(0);
    setCompleted(false);
  };

  if (questions.length === 0) {
    return (
      <main className="page-shell">
        <section className="empty-state">
          <h2>ドリル問題がありません</h2>
          <p>questions.json に問題を追加してください。</p>
        </section>
      </main>
    );
  }

  if (completed) {
    return (
      <main className="page-shell">
        <section className="result-hero">
          <p className="eyebrow">Drill complete</p>
          <h2>このセットのドリルが終わりました。</h2>
          <p>{queue.length} 問を解答しました。もう一度開始すると出題順が再シャッフルされます。</p>
          <button type="button" className="primary-button" onClick={restart}>
            もう一度ドリル
          </button>
        </section>
      </main>
    );
  }

  const current = queue[index];

  return (
    <main className="page-shell narrow">
      <section className="mode-heading">
        <div>
          <p className="eyebrow">Drill mode</p>
          <h2>ランダムドリル</h2>
        </div>
        <span className="progress-pill">
          {index + 1} / {queue.length}
        </span>
      </section>

      <QuestionCard
        key={`${current.id}-${sessionId}-${index}`}
        question={current}
        termsById={termsById}
        imagesById={imagesById}
        sequenceLabel={`問題 ${index + 1}`}
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
