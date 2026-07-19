import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const csvRoot = join(root, 'content', 'csv');
const dataRoot = join(root, 'src', 'data');

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
    const record = {};
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
  return parseCsv(readText(join(csvRoot, fileName)), fileName);
}

function emptyToUndefined(value) {
  const text = String(value ?? '').trim();
  return text === '' ? undefined : text;
}

function parseNumber(value, fieldName, rowId) {
  const text = emptyToUndefined(value);
  if (text === undefined) {
    return undefined;
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${rowId}: ${fieldName} must be numeric.`);
  }
  return parsed;
}

function parseBoolean(value, fieldName, rowId) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(text)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(text)) {
    return false;
  }
  throw new Error(`${rowId}: ${fieldName} must be true or false.`);
}

function parsePipeArray(value) {
  const text = String(value ?? '').trim();
  if (text === '') {
    return [];
  }
  return text
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePipeScalarOrArray(value) {
  const items = parsePipeArray(value);
  return items.length <= 1 ? items[0] ?? '' : items;
}

function normalizeTermReference(value) {
  return String(value ?? '').trim().toLowerCase();
}

function resolveTermReference(value, terms, context) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    throw new Error(`${context}: termId or anatomical name is required.`);
  }

  const normalizedValue = normalizeTermReference(rawValue);
  const matches = new Map();
  for (const term of terms) {
    const searchableValues = [term.id, term.japanese, term.english, term.latin].map(normalizeTermReference);
    if (searchableValues.includes(normalizedValue)) {
      matches.set(term.id, term);
    }
  }

  if (matches.size === 1) {
    return [...matches.values()][0];
  }

  if (matches.size === 0) {
    throw new Error(
      `${context}: term reference "${rawValue}" was not found in terms.csv by id, japanese, english, or latin.`,
    );
  }

  throw new Error(`${context}: term reference "${rawValue}" is ambiguous. Matches: ${[...matches.keys()].join(', ')}.`);
}

function parseOptionalHotspots(value, rowId) {
  const text = String(value ?? '').trim();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${rowId}: hotspots must be valid JSON when provided. ${error.message}`);
  }
}

function sortByOrderThenId(a, b) {
  const orderDiff = (a.order ?? 0) - (b.order ?? 0);
  return orderDiff === 0 ? String(a.id).localeCompare(String(b.id)) : orderDiff;
}

function buildTerms() {
  return readCsv('terms.csv').map((row) => ({
    id: row.id,
    japanese: row.japanese,
    english: row.english,
    latin: row.latin,
    category: row.category,
    region: row.region,
    testSet: parsePipeScalarOrArray(row.testSet),
    explanation: row.explanation,
  }));
}

function buildAuthoredQuestions() {
  return readCsv('questions.csv').map((row) => {
    const question = {
      id: row.id,
      type: row.type,
      testSet: row.testSet,
      prompt: row.prompt,
      answerTermId: row.answerTermId,
      choices: parsePipeArray(row.choices),
    };

    const imageId = emptyToUndefined(row.imageId);
    const targetLabel = emptyToUndefined(row.targetLabel);
    const explanation = emptyToUndefined(row.explanation);
    const hotspots = parseOptionalHotspots(row.hotspots, `Question ${row.id}`);

    if (imageId) {
      question.imageId = imageId;
    }
    if (targetLabel && row.type !== 'single_image_mcq') {
      question.targetLabel = targetLabel;
    }
    if (explanation) {
      question.explanation = explanation;
    }
    if (hotspots) {
      question.hotspots = hotspots;
    }

    return question;
  });
}

function termHasCompleteNames(term) {
  return Boolean(term?.japanese?.trim() && term?.english?.trim() && term?.latin?.trim());
}

function testSetForTerm(term) {
  const category = String(term?.category ?? '').toLowerCase();
  const region = String(term?.region ?? '').toLowerCase();

  if (category.includes('muscle')) {
    return 'basic_muscle';
  }
  if (region.includes('head') || region.includes('neck')) {
    return 'basic_head';
  }
  if (region.includes('upper limb')) {
    return 'basic_upper';
  }
  if (region.includes('lower limb') || region.includes('knee') || region.includes('pelvis')) {
    return 'basic_lower';
  }
  if (region.includes('trunk') || region.includes('thorax') || region.includes('spine') || region.includes('back')) {
    return 'basic_trunk';
  }

  const configuredTestSets = Array.isArray(term?.testSet) ? term.testSet : [term?.testSet];
  return configuredTestSets.find((testSet) => testSet && testSet !== 'pdf_reference_terms') ?? 'osteology_basic';
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function isReferenceOnlyTerm(term) {
  const configuredTestSets = Array.isArray(term?.testSet) ? term.testSet : [term?.testSet];
  return configuredTestSets.length > 0 && configuredTestSets.every((testSet) => testSet === 'pdf_reference_terms');
}

function generatedChoiceIds(answerTermId, image, terms) {
  const imageTermIds = uniqueValues(image.labels.map((label) => label.termId));
  const answerIndex = imageTermIds.indexOf(answerTermId);
  const rotatedImageTerms =
    answerIndex >= 0
      ? [...imageTermIds.slice(answerIndex + 1), ...imageTermIds.slice(0, answerIndex)]
      : imageTermIds;
  const answerTerm = terms.find((term) => term.id === answerTermId);
  const eligibleTerms = terms.filter(
    (term) => term.id !== answerTermId && termHasCompleteNames(term) && !isReferenceOnlyTerm(term),
  );
  const sameRegionAndCategory = eligibleTerms
    .filter((term) => term.region === answerTerm?.region && term.category === answerTerm?.category)
    .map((term) => term.id);
  const sameCategory = eligibleTerms.filter((term) => term.category === answerTerm?.category).map((term) => term.id);
  const candidates = uniqueValues([
    ...rotatedImageTerms,
    ...sameRegionAndCategory,
    ...sameCategory,
    ...eligibleTerms.map((term) => term.id),
  ]).filter((termId) => termId !== answerTermId);

  return [answerTermId, ...candidates.slice(0, 3)];
}

function generatedQuestionId(imageId, label, termId) {
  const safePart = (value) => String(value).replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `q_auto_${safePart(imageId)}_label_${safePart(label)}_${safePart(termId)}`;
}

function buildQuestions(terms, images) {
  const termsById = new Map(terms.map((term) => [term.id, term]));
  const authoredQuestions = buildAuthoredQuestions().map((question) => {
    if (question.type !== 'image_number_mcq') {
      return question;
    }

    const answerTerm = termsById.get(question.answerTermId);
    return answerTerm ? { ...question, testSet: testSetForTerm(answerTerm) } : question;
  });
  const coveredLabels = new Set(
    authoredQuestions
      .filter((question) => question.type === 'image_number_mcq' && question.imageId && question.targetLabel)
      .map((question) => `${question.imageId}:${question.targetLabel}`),
  );
  const generatedQuestions = [];

  for (const image of images) {
    for (const label of image.labels) {
      const labelKey = `${image.id}:${label.label}`;
      if (coveredLabels.has(labelKey)) {
        continue;
      }

      const answerTerm = termsById.get(label.termId);
      if (!answerTerm) {
        throw new Error(`Image label ${labelKey}: termId "${label.termId}" does not exist.`);
      }
      if (!termHasCompleteNames(answerTerm)) {
        throw new Error(
          `Image label ${labelKey}: term "${answerTerm.id}" needs Japanese, English, and Latin before a question can be generated.`,
        );
      }

      const choices = generatedChoiceIds(answerTerm.id, image, terms);
      if (choices.length < 4) {
        throw new Error(`Image label ${labelKey}: could not generate four answer choices.`);
      }

      generatedQuestions.push({
        id: generatedQuestionId(image.id, label.label, answerTerm.id),
        type: 'image_number_mcq',
        testSet: testSetForTerm(answerTerm),
        prompt: `図中の「${label.label}」で示す構造はどれか。`,
        answerTermId: answerTerm.id,
        choices,
        imageId: image.id,
        targetLabel: label.label,
        explanation: `番号${label.label}は${answerTerm.japanese}を示しています。${answerTerm.explanation}`,
      });
      coveredLabels.add(labelKey);
    }
  }

  return [...authoredQuestions, ...generatedQuestions];
}

function buildImages(terms) {
  const labelsByImageId = new Map();
  for (const row of readCsv('image_labels.csv')) {
    const imageId = row.imageId;
    if (!labelsByImageId.has(imageId)) {
      labelsByImageId.set(imageId, []);
    }

    const context = `Image label ${imageId}:${row.label}`;
    const rawTermReference = String(row.termId ?? '').trim();
    const resolvedTerm = resolveTermReference(rawTermReference, terms, context);
    const label = {
      label: row.label,
      termId: resolvedTerm.id,
      x: parseNumber(row.x, 'x', context),
      y: parseNumber(row.y, 'y', context),
    };

    const note = emptyToUndefined(row.note) ?? (rawTermReference === resolvedTerm.japanese ? rawTermReference : undefined);
    if (note) {
      label.note = note;
    }

    labelsByImageId.get(imageId).push(label);
  }

  return readCsv('images.csv').map((row) => {
    const image = {
      id: row.id,
      file: row.file,
      title: row.title,
      source: row.source,
      sourceType: row.sourceType,
      author: row.author,
      license: row.license,
      sourceUrl: row.sourceUrl,
      modified: parseBoolean(row.modified, 'modified', `Image ${row.id}`),
      modificationDescription: row.modificationDescription,
      labels: labelsByImageId.get(row.id) ?? [],
    };

    const editionYear = parseNumber(row.editionYear, 'editionYear', `Image ${row.id}`);
    image.editionYear = editionYear ?? row.editionYear;

    return image;
  });
}

function buildTestSets() {
  return readCsv('test_sets.csv')
    .map((row) => ({
      id: row.id,
      titleJa: row.titleJa,
      titleEn: row.titleEn,
      descriptionJa: row.descriptionJa,
      descriptionEn: row.descriptionEn,
      category: row.category,
      region: row.region,
      passingScore: parseNumber(row.passingScore, 'passingScore', `TestSet ${row.id}`),
      defaultQuestionCount: parseNumber(row.defaultQuestionCount, 'defaultQuestionCount', `TestSet ${row.id}`),
      version: row.version,
      isActive: parseBoolean(row.isActive, 'isActive', `TestSet ${row.id}`),
      order: parseNumber(row.order, 'order', `TestSet ${row.id}`),
    }))
    .sort(sortByOrderThenId);
}

function writeJson(fileName, value) {
  mkdirSync(dataRoot, { recursive: true });
  writeFileSync(join(dataRoot, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

try {
  const terms = buildTerms();
  const images = buildImages(terms);
  const questions = buildQuestions(terms, images);
  const testSets = buildTestSets();

  writeJson('terms.json', terms);
  writeJson('questions.json', questions);
  writeJson('images.json', images);
  writeJson('testSets.json', testSets);

  console.log(
    `Built JSON data from CSV: ${terms.length} terms, ${questions.length} questions, ${images.length} images, ${testSets.length} test sets.`,
  );
} catch (error) {
  console.error(`Failed to build JSON data from CSV: ${error.message}`);
  process.exit(1);
}
