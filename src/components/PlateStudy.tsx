import { useMemo, useState } from 'react';
import type { AnatomyImage, ImagePlateLabel, Term } from '../types/anatodrill';
import { detailLabel } from '../lib/questions';
import { ImagePlate } from './ImagePlate';

interface PlateStudyProps {
  images: AnatomyImage[];
  termsById: Map<string, Term>;
}

export function PlateStudy({ images, termsById }: PlateStudyProps) {
  const plates = useMemo(() => images.filter((image) => image.labels.length > 0), [images]);
  const [selectedPlateId, setSelectedPlateId] = useState(plates[0]?.id ?? '');
  const [selectedLabel, setSelectedLabel] = useState<ImagePlateLabel | null>(null);
  const selectedPlate = plates.find((plate) => plate.id === selectedPlateId);
  const selectedTerm = selectedLabel ? termsById.get(selectedLabel.termId) : undefined;

  if (!selectedPlate) {
    return (
      <main className="page-shell">
        <section className="empty-state">
          <h2>利用できる番号付き図版がありません</h2>
          <p>images.json に labels を持つ image plate を追加してください。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="mode-heading">
        <div>
          <p className="eyebrow">Image plate study</p>
          <h2>図版学習</h2>
        </div>
        <label className="compact-select">
          図版
          <select
            value={selectedPlateId}
            onChange={(event) => {
              setSelectedPlateId(event.target.value);
              setSelectedLabel(null);
            }}
          >
            {plates.map((plate) => (
              <option key={plate.id} value={plate.id}>
                {plate.title}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="content-grid plate-study-layout">
        <article className="panel">
          <ImagePlate
            image={selectedPlate}
            selectedLabel={selectedLabel?.label}
            onSelectLabel={(label) => setSelectedLabel(label)}
          />
        </article>

        <article className="panel term-reveal-panel">
          <h3>番号ラベル</h3>
          {selectedLabel && selectedTerm ? (
            <div className="term-detail">
              <span className="large-label">{selectedLabel.label}</span>
              <h4>{detailLabel(selectedTerm)}</h4>
              <p>{selectedTerm.explanation}</p>
              {selectedLabel.note ? <p className="muted">Note: {selectedLabel.note}</p> : null}
            </div>
          ) : (
            <p className="muted">図中の番号をタップすると用語が表示されます。</p>
          )}
        </article>
      </section>
    </main>
  );
}
