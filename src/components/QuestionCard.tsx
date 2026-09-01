import { useId, useMemo, useState, type MouseEvent } from 'react';
import type { AnatomyImage, AnswerRecord, ChoiceLanguageMode, Question, Term } from '../types/anatodrill';
import { shuffle } from '../lib/random';
import { assetUrl, detailLabel } from '../lib/questions';
import { termChoiceLabel } from '../lib/choiceLanguage';
import { ImagePlate } from './ImagePlate';
import { questionModality } from '../lib/modality';

interface QuestionCardProps {
  question: Question;
  termsById: Map<string, Term>;
  imagesById: Map<string, AnatomyImage>;
  sequenceLabel: string;
  choiceLanguageMode?: ChoiceLanguageMode;
  continueLabel?: string;
  onAnswer: (record: AnswerRecord) => void;
  onContinue: () => void;
}

interface AnswerState {
  selectedTermId?: string;
  correct: boolean;
  point?: {
    x: number;
    y: number;
  };
}

const ANSWER_PROMPT_QUESTION_TYPES = new Set<Question['type']>([
  'image_number_mcq',
  'image_label_mcq',
  'single_image_mcq',
]);

function questionTypeLabel(type: Question['type']): string {
  if (type === 'single_image_mcq') {
    return '画像同定問題';
  }
  if (type === 'image_number_mcq') {
    return '番号図選択';
  }
  if (type === 'image_label_mcq') {
    return '画像選択';
  }
  if (type === 'image_hotspot') {
    return 'ホットスポット';
  }
  return '用語選択';
}

function choiceLabel(term: Term, question: Question, choiceLanguageMode: ChoiceLanguageMode): string {
  if (choiceLanguageMode !== 'bilingual') {
    return termChoiceLabel(term, choiceLanguageMode);
  }

  const prompt = question.prompt.trim();
  if (/対応する英語|英語は/.test(prompt)) {
    return term.english;
  }

  if (/対応する日本語|日本語は/.test(prompt)) {
    return term.japanese;
  }

  return termChoiceLabel(term, 'bilingual');
}

export function QuestionCard({
  question,
  termsById,
  imagesById,
  sequenceLabel,
  choiceLanguageMode = 'bilingual',
  continueLabel = '次へ',
  onAnswer,
  onContinue,
}: QuestionCardProps) {
  const answerPromptId = useId();
  const answerTerm = termsById.get(question.answerTermId);
  const imageCredit = question.imageId ? imagesById.get(question.imageId) : undefined;
  const imagePath = imageCredit?.file ?? question.image;
  const displayPrompt = question.prompt.trim() || 'この構造物はどれか。';
  const targetPlateLabel =
    imageCredit?.labels.find((label) => label.label === question.targetLabel) ??
    imageCredit?.labels.find((label) => label.termId === question.answerTermId);
  const showAnswerPrompt = Boolean(imagePath) && ANSWER_PROMPT_QUESTION_TYPES.has(question.type);
  const answerPrompt = question.type === 'image_number_mcq' && targetPlateLabel
    ? `「${targetPlateLabel.label}」で示す構造はどれか？`
    : displayPrompt.replace(/か。$/, 'か？');
  const [answerState, setAnswerState] = useState<AnswerState | null>(null);

  const choices = useMemo(() => {
    const ids = new Set(question.choices);
    ids.add(question.answerTermId);
    return shuffle([...ids].map((id) => termsById.get(id)).filter(Boolean) as Term[]);
  }, [question, termsById]);

  if (!answerTerm) {
    return (
      <article className="question-card">
        <p className="error-text">解答用語が見つかりません: {question.answerTermId}</p>
      </article>
    );
  }

  const submitAnswer = (state: AnswerState) => {
    if (answerState) {
      return;
    }
    setAnswerState(state);
    onAnswer({
      questionId: question.id,
      termId: question.answerTermId,
      choiceLanguageMode,
      modality: questionModality(question),
      correct: state.correct,
    });
  };

  const handleChoice = (termId: string) => {
    submitAnswer({
      selectedTermId: termId,
      correct: termId === question.answerTermId,
    });
  };

  const handleHotspotClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (answerState) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const hotspots = question.hotspots ?? [];
    const correct = hotspots.some((hotspot) => {
      const sameTerm = !hotspot.termId || hotspot.termId === question.answerTermId;
      const distance = Math.hypot(hotspot.x - x, hotspot.y - y);
      return sameTerm && distance <= hotspot.radius;
    });

    submitAnswer({
      correct,
      point: { x, y },
    });
  };

  return (
    <article className="question-card">
      <div className="question-meta">
        <span>{sequenceLabel}</span>
        <span>{questionTypeLabel(question.type)}</span>
      </div>

      <h3>
        {question.type === 'image_number_mcq' && targetPlateLabel
          ? `図中の「${targetPlateLabel.label}」で示す構造はどれか。`
          : displayPrompt}
      </h3>

      {imagePath ? (
        <div className={question.type === 'single_image_mcq' ? 'image-question single-image-question' : 'image-question'}>
          {question.type === 'image_number_mcq' && imageCredit ? (
            <ImagePlate
              image={imageCredit}
              activeLabel={targetPlateLabel?.label}
              feedbackLabel={answerState ? targetPlateLabel?.label : undefined}
              altText="問題画像"
            />
          ) : question.type === 'image_hotspot' ? (
            <button
              type="button"
              className="hotspot-target"
              onClick={handleHotspotClick}
              disabled={Boolean(answerState)}
              aria-label="画像内の構造をクリックして解答"
            >
              <img src={assetUrl(imagePath)} alt="問題画像" />
              {answerState
                ? (question.hotspots ?? [])
                    .filter((hotspot) => !hotspot.termId || hotspot.termId === question.answerTermId)
                    .map((hotspot, hotspotIndex) => (
                      <span
                        aria-label="正解領域"
                        className="hotspot-correct-region"
                        key={`${hotspot.x}-${hotspot.y}-${hotspotIndex}`}
                        style={{
                          left: `${hotspot.x - hotspot.radius}%`,
                          top: `${hotspot.y - hotspot.radius}%`,
                          width: `${hotspot.radius * 2}%`,
                          height: `${hotspot.radius * 2}%`,
                        }}
                      />
                    ))
                : null}
              {answerState?.point ? (
                <span
                  className={answerState.correct ? 'click-marker correct' : 'click-marker wrong'}
                  style={{ left: `${answerState.point.x}%`, top: `${answerState.point.y}%` }}
                />
              ) : null}
            </button>
          ) : (
            <div className="answer-location-image">
              <img src={assetUrl(imagePath)} alt="問題画像" />
              {answerState && targetPlateLabel ? (
                <span
                  className="answer-location-marker"
                  aria-label="正解位置"
                  style={{ left: `${targetPlateLabel.x * 100}%`, top: `${targetPlateLabel.y * 100}%` }}
                />
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {showAnswerPrompt ? (
        <p className="answer-prompt" id={answerPromptId}>
          {answerPrompt}
        </p>
      ) : null}

      {question.type === 'image_hotspot' && (!question.hotspots || question.hotspots.length === 0) ? (
        <div className="placeholder-support">
          <p>このホットスポット問題には判定範囲が未設定です。</p>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              disabled={Boolean(answerState)}
              onClick={() => submitAnswer({ correct: true })}
            >
              正解として記録
            </button>
            <button
              type="button"
              className="secondary-button danger"
              disabled={Boolean(answerState)}
              onClick={() => submitAnswer({ correct: false })}
            >
              不正解として記録
            </button>
          </div>
        </div>
      ) : null}

      {question.type !== 'image_hotspot' ? (
        <div
          className="choice-grid"
          role="list"
          aria-label={showAnswerPrompt ? undefined : '解答選択肢'}
          aria-labelledby={showAnswerPrompt ? answerPromptId : undefined}
        >
          {choices.map((term) => {
            const isSelected = answerState?.selectedTermId === term.id;
            const isCorrectChoice = term.id === question.answerTermId;
            const className = [
              'choice-button',
              answerState && isCorrectChoice ? 'correct' : '',
              answerState && isSelected && !isCorrectChoice ? 'wrong' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={term.id}
                type="button"
                className={className}
                disabled={Boolean(answerState)}
                onClick={() => handleChoice(term.id)}
              >
                {choiceLabel(term, question, choiceLanguageMode)}
              </button>
            );
          })}
        </div>
      ) : null}

      {answerState ? (
        <div className={answerState.correct ? 'answer-panel correct' : 'answer-panel wrong'}>
          <p className="answer-result">{answerState.correct ? '正解' : '不正解'}</p>
          <p>
            正答: <strong>{detailLabel(answerTerm)}</strong>
          </p>
          <p>{question.explanation ?? answerTerm.explanation}</p>
          <button type="button" className="primary-button" onClick={onContinue}>
            {continueLabel}
          </button>
        </div>
      ) : null}
    </article>
  );
}
