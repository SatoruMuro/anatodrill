import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = join(root, 'public');
const csvRoot = join(root, 'content', 'csv');

const QUESTION_TYPES = new Set([
  'text_mcq',
  'image_label_mcq',
  'image_number_mcq',
  'image_hotspot',
  'single_image_mcq',
]);
const MCQ_TYPES = new Set(['text_mcq', 'image_label_mcq', 'image_number_mcq', 'single_image_mcq']);
const IMAGE_QUESTION_TYPES = new Set(['image_label_mcq', 'image_number_mcq', 'image_hotspot', 'single_image_mcq']);

const errors = [];
const warnings = [];

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function readJson(path) {
  const absolutePath = join(root, path);
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    addError(`${path}: could not be loaded or parsed as JSON. ${error.message}`);
    return [];
  }
}

function readText(path) {
  return readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
}

function parseCsv(text, sourceName) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else if (char === '\r') {
      if (next === '\n') {
        continue;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (inQuotes) {
    throw new Error(`${sourceName}: unterminated quoted field.`);
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const meaningfulRows = rows.filter((items) => items.some((item) => item.trim() !== ''));
  if (meaningfulRows.length === 0) {
    return [];
  }

  const headers = meaningfulRows[0].map((header) => header.trim());
  return meaningfulRows.slice(1).map((items, rowIndex) => {
    const record = { __rowNumber: rowIndex + 2 };
    headers.forEach((header, columnIndex) => {
      record[header] = items[columnIndex] ?? '';
    });

    if (items.length > headers.length) {
      throw new Error(`${sourceName}: row ${rowIndex + 2} has more columns than the header.`);
    }

    return record;
  });
}

function readCsv(fileName) {
  try {
    return parseCsv(readText(join(csvRoot, fileName)), `content/csv/${fileName}`);
  } catch (error) {
    addError(`content/csv/${fileName}: could not be loaded or parsed as CSV. ${error.message}`);
    return [];
  }
}

function normalizeTermReference(value) {
  return String(value ?? '').trim().toLowerCase();
}

function resolveCsvTermReference(value, csvTerms) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return { status: 'empty', rawValue, matches: [] };
  }

  const normalizedValue = normalizeTermReference(rawValue);
  const matches = new Map();
  for (const term of csvTerms) {
    const searchableValues = [term.id, term.japanese, term.english, term.latin].map(normalizeTermReference);
    if (searchableValues.includes(normalizedValue)) {
      matches.set(term.id, term);
    }
  }

  if (matches.size === 1) {
    return { status: 'resolved', rawValue, matches: [...matches.values()] };
  }
  if (matches.size === 0) {
    return { status: 'missing', rawValue, matches: [] };
  }
  return { status: 'ambiguous', rawValue, matches: [...matches.values()] };
}

function validateCsvImageLabelTermReferences(csvTerms, csvImageLabels) {
  for (const row of csvImageLabels) {
    const context = `content/csv/image_labels.csv row ${row.__rowNumber ?? '?'} (${row.imageId || '(missing imageId)'}:${
      row.label || '(missing label)'
    })`;
    const resolution = resolveCsvTermReference(row.termId, csvTerms);

    if (resolution.status === 'empty') {
      addError(`${context}: termId or anatomical name is required.`);
    } else if (resolution.status === 'missing') {
      addError(
        `${context}: termId/name "${resolution.rawValue}" could not be resolved against terms.csv by id, japanese, english, or latin.`,
      );
    } else if (resolution.status === 'ambiguous') {
      addError(
        `${context}: termId/name "${resolution.rawValue}" is ambiguous in terms.csv. Matches: ${resolution.matches
          .map((term) => term.id)
          .join(', ')}. Use the internal termId.`,
      );
    }
  }
}

function validateCsvImageSuggestions(csvSuggestions, validImageIds) {
  const seenImageIds = new Set();

  for (const row of csvSuggestions) {
    const imageId = String(row.imageId ?? '').trim();
    const context = `content/csv/image_suggestions.csv row ${row.__rowNumber ?? '?'}`;
    if (!imageId) {
      addError(`${context}: imageId is required.`);
      continue;
    }
    if (seenImageIds.has(imageId)) {
      addError(`${context}: duplicate imageId "${imageId}".`);
    }
    seenImageIds.add(imageId);

    if (!validImageIds.has(imageId)) {
      addError(`${context}: imageId "${imageId}" does not exist in images.json.`);
    }

    const items = String(row.suggestions ?? '')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length === 0) {
      addError(`${context}: at least one suggestion is required.`);
      continue;
    }

    const seenSuggestions = new Set();
    items.forEach((item, index) => {
      const parts = item.split('::');
      const suggestionContext = `${context} suggestion ${index + 1}`;
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        addError(`${suggestionContext}: use the format "Japanese::English".`);
        return;
      }

      const key = `${normalizeTermReference(parts[0])}:${normalizeTermReference(parts[1])}`;
      if (seenSuggestions.has(key)) {
        addError(`${suggestionContext}: duplicate suggestion "${item}".`);
      }
      seenSuggestions.add(key);
    });
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasRequiredFields(record, fields, context) {
  if (!isPlainObject(record)) {
    addError(`${context}: record must be an object.`);
    return false;
  }

  let valid = true;
  for (const field of fields) {
    if (!(field in record) || record[field] === null || record[field] === undefined) {
      addError(`${context}: required field "${field}" is missing.`);
      valid = false;
    }
  }
  return valid;
}

function collectIds(records, entityName) {
  const ids = new Set();
  const seen = new Set();

  records.forEach((record, index) => {
    const context = `${entityName} at index ${index}`;
    if (!isPlainObject(record)) {
      addError(`${context}: record must be an object.`);
      return;
    }

    if (typeof record.id !== 'string' || record.id.trim() === '') {
      addError(`${context}: id is required.`);
      return;
    }

    if (seen.has(record.id)) {
      addError(`${entityName}: duplicate id "${record.id}".`);
      return;
    }

    seen.add(record.id);
    ids.add(record.id);
  });

  return ids;
}

function requireArray(value, context) {
  if (!Array.isArray(value)) {
    addError(`${context}: must be an array.`);
    return [];
  }
  return value;
}

function validatePublicFile(file, context) {
  if (typeof file !== 'string' || file.trim() === '') {
    addError(`${context}: file is required.`);
    return;
  }

  const publicRelativeFile = file.replace(/^[/\\]+/, '');
  const absolutePath = resolve(publicRoot, publicRelativeFile);
  const relativePath = relative(publicRoot, absolutePath);
  if (relativePath.startsWith('..') || relativePath === '' || resolve(relativePath) === absolutePath) {
    addError(`${context}: file "${file}" must resolve under public/.`);
    return;
  }

  if (!existsSync(absolutePath)) {
    addError(`${context}: file "public/${publicRelativeFile}" does not exist.`);
  }
}

const terms = requireArray(readJson('src/data/terms.json'), 'src/data/terms.json');
const questions = requireArray(readJson('src/data/questions.json'), 'src/data/questions.json');
const images = requireArray(readJson('src/data/images.json'), 'src/data/images.json');
const testSets = requireArray(readJson('src/data/testSets.json'), 'src/data/testSets.json');
const csvTerms = readCsv('terms.csv');
const csvImageLabels = readCsv('image_labels.csv');
const csvImageSuggestions = readCsv('image_suggestions.csv');

const termIds = collectIds(terms, 'Term');
const questionIds = collectIds(questions, 'Question');
const imageIds = collectIds(images, 'Image');
const testSetIds = collectIds(testSets, 'TestSet');
const imageById = new Map(images.filter((image) => image?.id).map((image) => [image.id, image]));
const termById = new Map(terms.filter((term) => term?.id).map((term) => [term.id, term]));
const questionCountsByTestSet = new Map();
const numberedQuestionsByLabel = new Map();

validateCsvImageLabelTermReferences(csvTerms, csvImageLabels);
validateCsvImageSuggestions(csvImageSuggestions, imageIds);

for (const term of terms) {
  const context = `Term ${term?.id ?? '(missing id)'}`;
  if (
    !hasRequiredFields(
      term,
      ['id', 'japanese', 'english', 'latin', 'category', 'region', 'testSet', 'explanation'],
      context,
    )
  ) {
    continue;
  }

  const termTestSets = Array.isArray(term.testSet) ? term.testSet : [term.testSet];
  for (const testSet of termTestSets) {
    if (!testSetIds.has(testSet)) {
      addError(`${context}: testSet "${testSet}" does not exist.`);
    }
  }
}

for (const question of questions) {
  const context = `Question ${question?.id ?? '(missing id)'}`;
  if (!hasRequiredFields(question, ['id', 'type', 'testSet', 'prompt', 'answerTermId', 'choices'], context)) {
    continue;
  }

  questionCountsByTestSet.set(question.testSet, (questionCountsByTestSet.get(question.testSet) ?? 0) + 1);

  if (!QUESTION_TYPES.has(question.type)) {
    addError(`${context}: type "${question.type}" is not supported.`);
  }

  if (!termIds.has(question.answerTermId)) {
    addError(`${context}: answerTermId "${question.answerTermId}" does not exist.`);
  }

  if (!testSetIds.has(question.testSet)) {
    addError(`${context}: testSet "${question.testSet}" does not exist.`);
  }

  const choices = requireArray(question.choices, `${context}: choices`);
  const uniqueChoices = new Set(choices);
  if (!uniqueChoices.has(question.answerTermId)) {
    addError(`${context}: choices must include answerTermId "${question.answerTermId}".`);
  }

  for (const choice of choices) {
    if (!termIds.has(choice)) {
      addError(`${context}: choice "${choice}" does not exist in terms.json.`);
      continue;
    }

    const choiceTerm = termById.get(choice);
    if (!choiceTerm?.japanese?.trim() || !choiceTerm?.english?.trim() || !choiceTerm?.latin?.trim()) {
      addError(`${context}: choice term "${choice}" needs non-empty Japanese, English, and Latin names.`);
    }
  }

  if (uniqueChoices.size !== choices.length) {
    addError(`${context}: choices contain duplicate term IDs.`);
  }

  const minimumChoiceCount = Math.min(4, termIds.size);
  if (MCQ_TYPES.has(question.type) && uniqueChoices.size < minimumChoiceCount) {
    addError(`${context}: multiple-choice questions need at least ${minimumChoiceCount} choices when possible.`);
  }

  if (IMAGE_QUESTION_TYPES.has(question.type)) {
    if (typeof question.imageId !== 'string' || question.imageId.trim() === '') {
      addError(`${context}: image-based question is missing imageId.`);
      continue;
    }

    const image = imageById.get(question.imageId);
    if (!image) {
      addError(`${context}: imageId "${question.imageId}" does not exist in images.json.`);
      continue;
    }

    if (question.type === 'image_number_mcq') {
      if (typeof question.targetLabel !== 'string' || question.targetLabel.trim() === '') {
        addError(`${context}: image_number_mcq requires targetLabel.`);
      } else {
        const labelKey = `${question.imageId}:${question.targetLabel}`;
        const matchingQuestions = numberedQuestionsByLabel.get(labelKey) ?? [];
        matchingQuestions.push(question.id);
        numberedQuestionsByLabel.set(labelKey, matchingQuestions);
        if (matchingQuestions.length > 1) {
          addError(`${context}: image label "${labelKey}" is already used by ${matchingQuestions.slice(0, -1).join(', ')}.`);
        }

        const target = image.labels?.find((label) => label.label === question.targetLabel);
        if (!target) {
          addError(`${context}: targetLabel "${question.targetLabel}" does not exist on image "${image.id}".`);
        } else if (target.termId !== question.answerTermId) {
          addError(
            `${context}: targetLabel "${question.targetLabel}" points to "${target.termId}", not answerTermId "${question.answerTermId}".`,
          );
        }
      }
    }

    if (question.type === 'image_hotspot') {
      const hotspots = requireArray(question.hotspots ?? [], `${context}: hotspots`);
      if (hotspots.length === 0) {
        addWarning(`${context}: image_hotspot has no hotspot definitions.`);
      }

      hotspots.forEach((hotspot, index) => {
        const hotspotContext = `${context} hotspot ${index}`;
        if (!isPlainObject(hotspot)) {
          addError(`${hotspotContext}: hotspot must be an object.`);
          return;
        }

        if (hotspot.termId && !termIds.has(hotspot.termId)) {
          addError(`${hotspotContext}: termId "${hotspot.termId}" does not exist in terms.json.`);
        }

        if (hotspot.answerTermId && !termIds.has(hotspot.answerTermId)) {
          addError(`${hotspotContext}: answerTermId "${hotspot.answerTermId}" does not exist in terms.json.`);
        }

        for (const field of ['x', 'y', 'radius']) {
          if (typeof hotspot[field] !== 'number' || !Number.isFinite(hotspot[field])) {
            addError(`${hotspotContext}: "${field}" must be a finite number.`);
          }
        }
      });
    }
  }
}

for (const image of images) {
  const context = `Image ${image?.id ?? '(missing id)'}`;
  if (
    !hasRequiredFields(
      image,
      [
        'id',
        'file',
        'title',
        'source',
        'sourceType',
        'author',
        'license',
        'sourceUrl',
        'modified',
        'modificationDescription',
        'labels',
        'suggestions',
      ],
      context,
    )
  ) {
    continue;
  }

  validatePublicFile(image.file, context);

  const labels = requireArray(image.labels, `${context}: labels`);
  const labelIds = new Set();
  for (const label of labels) {
    const labelContext = `${context} label ${label?.label ?? '(missing label)'}`;
    if (!hasRequiredFields(label, ['label', 'termId', 'x', 'y'], labelContext)) {
      continue;
    }

    if (labelIds.has(label.label)) {
      addError(`${context}: duplicate label "${label.label}".`);
    }
    labelIds.add(label.label);

    if (!termIds.has(label.termId)) {
      addError(
        `${labelContext}: termId "${label.termId}" does not exist in terms.json. If this came from image_labels.csv, use an existing termId or an exact Japanese/English/Latin term name resolvable from terms.csv.`,
      );
    } else {
      const term = termById.get(label.termId);
      if (!term?.japanese?.trim() || !term?.english?.trim() || !term?.latin?.trim()) {
        addError(`${labelContext}: the referenced term needs non-empty Japanese, English, and Latin names.`);
      }
    }

    const labelKey = `${image.id}:${label.label}`;
    const matchingQuestions = numberedQuestionsByLabel.get(labelKey) ?? [];
    if (matchingQuestions.length === 0) {
      addError(`${labelContext}: no image_number_mcq was generated for this label.`);
    }

    if (typeof label.x !== 'number' || label.x < 0 || label.x > 1) {
      addError(`${labelContext}: x must be a normalized 0-1 coordinate.`);
    }

    if (typeof label.y !== 'number' || label.y < 0 || label.y > 1) {
      addError(`${labelContext}: y must be a normalized 0-1 coordinate.`);
    }
  }

  const suggestions = requireArray(image.suggestions, `${context}: suggestions`);
  const suggestionKeys = new Set();
  suggestions.forEach((suggestion, index) => {
    const suggestionContext = `${context} suggestion ${index + 1}`;
    if (!hasRequiredFields(suggestion, ['japanese', 'english'], suggestionContext)) {
      return;
    }
    if (typeof suggestion.japanese !== 'string' || suggestion.japanese.trim() === '') {
      addError(`${suggestionContext}: japanese must be a non-empty string.`);
    }
    if (typeof suggestion.english !== 'string' || suggestion.english.trim() === '') {
      addError(`${suggestionContext}: english must be a non-empty string.`);
    }

    const key = `${normalizeTermReference(suggestion.japanese)}:${normalizeTermReference(suggestion.english)}`;
    if (suggestionKeys.has(key)) {
      addError(`${suggestionContext}: duplicate Japanese/English suggestion.`);
    }
    suggestionKeys.add(key);

    if (suggestion.termId !== undefined) {
      if (typeof suggestion.termId !== 'string' || !termIds.has(suggestion.termId)) {
        addError(`${suggestionContext}: termId "${suggestion.termId}" does not exist.`);
      } else {
        const term = termById.get(suggestion.termId);
        if (!term?.japanese?.trim() || !term?.english?.trim() || !term?.latin?.trim()) {
          addError(`${suggestionContext}: registered suggestion term needs Japanese, English, and Latin names.`);
        }
      }
    }
  });
}

for (const testSet of testSets) {
  const context = `TestSet ${testSet?.id ?? '(missing id)'}`;
  if (
    !hasRequiredFields(
      testSet,
      [
        'id',
        'titleJa',
        'titleEn',
        'descriptionJa',
        'descriptionEn',
        'category',
        'region',
        'passingScore',
        'defaultQuestionCount',
        'version',
        'isActive',
        'order',
      ],
      context,
    )
  ) {
    continue;
  }

  if (typeof testSet.isActive !== 'boolean') {
    addError(`${context}: isActive must be boolean.`);
  }

  for (const field of ['passingScore', 'defaultQuestionCount', 'order']) {
    if (typeof testSet[field] !== 'number' || !Number.isFinite(testSet[field])) {
      addError(`${context}: ${field} must be a finite number.`);
    }
  }

  const questionCount = questionCountsByTestSet.get(testSet.id) ?? 0;
  if (testSet.isActive && questionCount === 0) {
    addError(`${context}: active testSet has no questions.`);
  }

}

if (warnings.length > 0) {
  console.warn(`Data validation completed with ${warnings.length} warning(s):`);
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error(`Data validation failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Data validation passed: ${terms.length} terms, ${questions.length} questions, ${images.length} images, ${testSets.length} test sets.`,
);
