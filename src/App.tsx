import { useEffect, useMemo, useState } from 'react';
import imagesJson from './data/images.json';
import questionsJson from './data/questions.json';
import testSetsJson from './data/testSets.json';
import termsJson from './data/terms.json';
import { DrillMode } from './components/DrillMode';
import { HistoryBackup } from './components/HistoryBackup';
import { Home } from './components/Home';
import { ImageCredits } from './components/ImageCredits';
import { LabelEditor } from './components/LabelEditor';
import { Navigation } from './components/Navigation';
import { PlateStudy } from './components/PlateStudy';
import { QuestionBrowser } from './components/QuestionBrowser';
import { ReviewMode } from './components/ReviewMode';
import { TestMode } from './components/TestMode';
import type { AnatomyImage, AnswerRecord, LearningData, Question, Term, TestAttempt, TestSet, ViewKey } from './types/anatodrill';
import { progressKey, updateProgressRecord } from './lib/progress';
import { buildImageMap, buildTermMap } from './lib/questions';
import { loadLearningData, saveLearningData } from './lib/storage';

const images = imagesJson as AnatomyImage[];
const testSets = testSetsJson as TestSet[];
const terms = termsJson as Term[];
const questions = questionsJson as Question[];
const knownTermIds = new Set(terms.map((term) => term.id));
const isDevMode = new URLSearchParams(window.location.search).get('dev') === '1';

export function App() {
  const [view, setView] = useState<ViewKey>(() => (isDevMode ? 'label_editor' : 'home'));
  const [learningData, setLearningData] = useState<LearningData>(() => loadLearningData(knownTermIds));
  const termsById = useMemo(() => buildTermMap(terms), []);
  const imagesById = useMemo(() => buildImageMap(images), []);
  const isEditorMode = isDevMode;

  useEffect(() => {
    saveLearningData(learningData);
  }, [learningData]);

  const recordAnswer = (record: AnswerRecord) => {
    setLearningData((current) => {
      const key = progressKey(record.termId, record.choiceLanguageMode);
      return {
        ...current,
        progress: {
          ...current.progress,
          [key]: updateProgressRecord(
            current.progress[key],
            record.termId,
            record.choiceLanguageMode,
            record.correct,
          ),
        },
      };
    });
  };

  const saveAttempt = (attempt: TestAttempt) => {
    setLearningData((current) =>
      ({
        ...current,
        attempts: [attempt, ...current.attempts],
      }),
    );
  };

  const importData = (data: LearningData) => {
    setLearningData(data);
  };

  const closeEditor = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('dev');
    window.location.assign(url.toString());
  };

  return (
    <>
      <Navigation current={view} onNavigate={setView} isDevMode={isEditorMode} />
      {isEditorMode ? (
        <aside className="dev-mode-notice">
          <span>編集者モードです。一括更新JSON・CSVには、ラベルと要登録用語が一緒に保存されます。</span>
          <button className="secondary-button" type="button" onClick={closeEditor}>
            閉じる
          </button>
        </aside>
      ) : null}
      {view === 'home' ? <Home terms={terms} questions={questions} data={learningData} onNavigate={setView} /> : null}
      {view === 'drill' ? (
        <DrillMode questions={questions} termsById={termsById} imagesById={imagesById} onRecordAnswer={recordAnswer} />
      ) : null}
      {view === 'review' ? (
        <ReviewMode
          questions={questions}
          terms={terms}
          termsById={termsById}
          imagesById={imagesById}
          data={learningData}
          onRecordAnswer={recordAnswer}
        />
      ) : null}
      {view === 'test' ? (
        <TestMode
          questions={questions}
          termsById={termsById}
          imagesById={imagesById}
          onRecordAnswer={recordAnswer}
          onSaveAttempt={saveAttempt}
        />
      ) : null}
      {view === 'questions' ? (
        <QuestionBrowser questions={questions} termsById={termsById} imagesById={imagesById} testSets={testSets} />
      ) : null}
      {view === 'plates' ? <PlateStudy images={images} termsById={termsById} /> : null}
      {view === 'history' ? (
        <HistoryBackup data={learningData} terms={terms} testSets={testSets} onImportData={importData} />
      ) : null}
      {view === 'credits' ? <ImageCredits images={images} /> : null}
      {isEditorMode && view === 'label_editor' ? <LabelEditor images={images} terms={terms} /> : null}
    </>
  );
}
