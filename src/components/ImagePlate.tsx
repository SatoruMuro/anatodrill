import type { AnatomyImage, ImagePlateLabel } from '../types/anatodrill';
import { assetUrl } from '../lib/questions';

interface ImagePlateProps {
  image: AnatomyImage;
  activeLabel?: string;
  selectedLabel?: string;
  onSelectLabel?: (label: ImagePlateLabel) => void;
}

export function ImagePlate({ image, activeLabel, selectedLabel, onSelectLabel }: ImagePlateProps) {
  return (
    <div className="plate-viewer">
      <img src={assetUrl(image.file)} alt={image.title} />
      <div className="plate-marker-layer" aria-label="番号付き解剖図ラベル">
        {image.labels.map((label) => {
          const isActive = label.label === activeLabel;
          const isSelected = label.label === selectedLabel;
          const markerClass = ['plate-marker', isActive ? 'active' : '', isSelected ? 'selected' : '']
            .filter(Boolean)
            .join(' ');

          if (onSelectLabel) {
            return (
              <button
                key={label.label}
                type="button"
                className={markerClass}
                style={{ left: `${label.x * 100}%`, top: `${label.y * 100}%` }}
                onClick={() => onSelectLabel(label)}
                aria-label={`ラベル ${label.label}`}
              >
                <span className="plate-marker-visual">{label.label}</span>
              </button>
            );
          }

          return (
            <span
              key={label.label}
              className={markerClass}
              style={{ left: `${label.x * 100}%`, top: `${label.y * 100}%` }}
              aria-label={`ラベル ${label.label}`}
            >
              <span className="plate-marker-visual">{label.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
