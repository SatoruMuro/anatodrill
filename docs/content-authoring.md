# Content Authoring

AnatoDrill content is authored in CSV and compiled into JSON for the browser app.

## Workflow

```bash
npm run build:data
npm run validate:data
npm run build
npm run dev
```

Edit files under `content/csv/`, not `src/data/`, when changing source content. The generated JSON files under `src/data/` are what the app imports at runtime.

Save CSV files as UTF-8. Spreadsheet tools sometimes export CSV using a local legacy encoding; if Japanese text looks garbled after `npm run build:data`, re-export as UTF-8 CSV.

After running the workflow, open the app and use `問題一覧` to verify newly added questions. The page lists generated questions without randomizing them, shows answer terms, choices, image previews, explanations, and browser-side diagnostics. If an image does not appear in Drill mode, first check whether it appears in `問題一覧` and whether the displayed `imageId` has an OK status.

## Pipe-Separated Values

Some fields accept multiple IDs separated by `|`.

Examples:

```csv
testSet
osteology_basic|upper_limb_basic
```

```csv
choices
median_nerve|ulnar_nerve|radial_nerve|musculocutaneous_nerve
```

The build script converts pipe-separated values into arrays where the JSON data model expects arrays. For `terms.csv`, a single test set remains a string and multiple test sets become an array.

## Add A Term

Edit `content/csv/terms.csv`.

Required columns:

```csv
id,japanese,english,latin,category,region,testSet,explanation
```

Example:

```csv
median_nerve,正中神経,median nerve,nervus medianus,nerve,upper limb,upper_limb_basic,正中神経は前腕屈筋群と手の一部に関わる主要な神経です。
```

Keep `id` stable. Question and image-label rows reference this ID.

## Add A Text MCQ Question

Edit `content/csv/questions.csv`.

For `text_mcq`, fill:

```csv
id,type,testSet,prompt,answerTermId,choices,imageId,targetLabel,explanation,hotspots
```

Example:

```csv
q_median_001,text_mcq,upper_limb_basic,正中神経に対応する英語はどれですか。,median_nerve,median_nerve|ulnar_nerve|radial_nerve|musculocutaneous_nerve,,,正中神経は median nerve です。,
```

`choices` must include `answerTermId` and should contain at least four term IDs when possible.
Do not place a whole structure and one of its constituent parts, or a generic structure and one of its specific types, in the same choice set. For example, `hip_bone` must not appear with `ilium`, `ischium`, or `pubis`, and `vertebra` must not appear with a named vertebral type. The validator rejects known hierarchical conflicts, and generated image questions skip them automatically.

## Add An Image Label MCQ Question

First add an image credit row in `content/csv/images.csv`, then reference its `id` from `questions.csv`.

Example:

```csv
q_image_median_001,image_label_mcq,upper_limb_basic,画像の矢印が示す構造はどれですか。,median_nerve,median_nerve|ulnar_nerve|radial_nerve|musculocutaneous_nerve,forearm_nerve_plate,,矢印は正中神経を示しています。,
```

For `image_label_mcq`, `imageId` is required. `targetLabel` is usually blank unless the image is also a numbered plate.

## Add A Single Image MCQ Question

Use `single_image_mcq` when the question shows one isolated structure and asks the learner to identify it.
This format is suitable for isolated bones, organs, specimens, histology images, and structure photos.

First add an image credit row in `content/csv/images.csv`. Every image used by this question type must have source, author, license, and modification metadata.

Then add a question row:

```csv
q_single_scapula_001,single_image_mcq,basic_upper,,scapula,scapula|clavicle|humerus|sternum,isolated_scapula_placeholder,,単独画像は肩甲骨を示しています。,
```

For `single_image_mcq`:

- `imageId` is required.
- `targetLabel` is ignored.
- If `prompt` is blank, the app displays `この構造物はどれか。`.
- `choices` must include `answerTermId` and should contain at least four term IDs when possible.

## Add An Image Number MCQ Question

Use `image_number_mcq` when the image has numbered markers defined in `image_labels.csv`.

Example:

```csv
q_plate_median_001,image_number_mcq,upper_limb_basic,図中の「3」で示す構造はどれか。,median_nerve,median_nerve|ulnar_nerve|radial_nerve|musculocutaneous_nerve,forearm_nerve_plate,3,番号3は正中神経を示しています。,
```

The validator checks that `targetLabel` exists on the referenced image and that the label points to the same `termId` as `answerTermId`.

## Add A Numbered Image Plate

Add a row to `content/csv/images.csv`:

```csv
id,file,title,source,sourceType,author,editionYear,license,sourceUrl,modified,modificationDescription
forearm_nerve_plate,images/forearm-nerve-plate.svg,Forearm nerve plate,Original AnatoDrill placeholder diagram,placeholder,AnatoDrill project,2026,CC0-1.0 placeholder asset,,true,Added numbered markers for quiz use.
```

Place the image file under `public/images/`. The `file` path is relative to `public/`.

Then add numbered labels to `content/csv/image_labels.csv`.

## How image_labels.csv Works

Required columns:

```csv
imageId,label,termId,x,y,note
```

Example:

```csv
forearm_nerve_plate,3,median_nerve,0.52,0.47,Anterior forearm nerve.
```

The `termId` column can contain the internal term ID, or an exact anatomical name from `terms.csv`:

- `id`
- `japanese`
- `english`
- `latin`

For example, `頸椎` resolves to `cervical_vertebra` when `terms.csv` contains that Japanese name. If there is no exact match, or if multiple terms match the same text, `npm run build:data` fails with an error so the source row can be fixed. The generated `src/data/images.json` always stores the resolved internal `termId`.

Some Japanese names intentionally have multiple anatomical meanings. For example, the hand scaphoid and foot navicular are both called `舟状骨`; use `scaphoid_bone` for the hand and `navicular_bone` for the foot. The editor shows both candidates and exports the selected internal ID.

All rows with the same `imageId` are grouped into the `labels` array of that image in `src/data/images.json`.

Each label also automatically generates one `image_number_mcq` during `npm run build:data` unless `questions.csv` already contains a question for the same `imageId` and `targetLabel`. The generator:

- requires Japanese, English, and Latin names for the referenced term;
- prefers distractors from other labels on the same image;
- supplements choices with terms from the same anatomical category/region;
- assigns the question to a regional test set from the answer term metadata;
- creates a stable `q_auto_...` question ID.

The validator fails if a label has no numbered question, if two numbered questions use the same image/label pair, or if a quiz term lacks any of the three language names.

## Label Creation Tool

For numbered image plates, start the local dev server and open:

```text
http://localhost:5173/anatodrill/?dev=1
```

After deployment, trusted editors can also open:

```text
https://SatoruMuro.github.io/anatodrill/?dev=1
```

The online editor URL is intentionally hidden from normal navigation, but it has no password gate. Anyone who knows the `?dev=1` URL can open it, so do not deploy private source material or secrets with the app.

Then click `ラベル作成`.

This developer-only page is hidden unless `?dev=1` is present. It lists numbered-plate targets rather than isolated single-structure images, lets you click the image to place normalized `x` / `y` markers, search terms by ID/Japanese/English/Latin, edit labels, and export JSON or CSV rows.

The editor also shows optional structure suggestions derived in advance from wording visible in each plate, its source-language labels, and the subject of the illustration. These are only authoring aids and must be checked against the image before use. Registered suggestions select their quiz-ready term with one tap. An unregistered suggestion can still be used as a pending label and is included in the export bundle's registration list.

In the `構造名 / termId` field, you can type a Japanese anatomical name such as `頸椎`, `胸椎`, `腰椎`, `仙骨`, or `尾骨`. The editor resolves it through the loaded term data from `terms.csv` / `terms.json`. If the input exactly matches one term, the label is resolved automatically. If multiple exact matches exist, select the correct candidate. If there is no exact match, use `要登録としてラベルを追加` and continue the labeling session without interrupting the work to edit `terms.csv`.

The recommended exports are `一括更新JSON` and `一括更新CSV`. Both contain the image labels and a de-duplicated `termsToRegister` / `term_to_register` list. A pending term records the entered name, any Japanese/English suggestion available from the plate, a suggested ID when one can be generated, and every image/label that uses it. This lets a single follow-up update register the missing terms in `terms.csv` and resolve the corresponding rows in `image_labels.csv` together.

The bundle format is `anatodrill-label-update-v1`. Its JSON form has this shape:

```json
{
  "format": "anatodrill-label-update-v1",
  "images": [
    {
      "imageId": "example_plate",
      "replaceExistingLabels": true,
      "labels": [{ "label": "1", "termId": "未登録構造", "x": 0.5, "y": 0.4 }]
    }
  ],
  "termsToRegister": [
    {
      "input": "未登録構造",
      "suggestedId": "",
      "japanese": "未登録構造",
      "english": "",
      "latin": "",
      "usedBy": ["example_plate:1"]
    }
  ]
}
```

The CSV bundle is a single table whose `recordType` is either `label` or `term_to_register`. It is an exchange file, not a direct replacement for `content/csv/image_labels.csv`. Complete the missing English, Latin, category, region, test set, and explanation fields while applying the bundle, register the terms, and then write the resolved term IDs to `image_labels.csv`.

For backward compatibility, `ラベルJSONのみ` remains available. Direct `image_labels.csv` exports are enabled only when the selected labels contain no pending terms. Duplicate label numbers, ambiguous exact term matches, blank labels, and invalid coordinates still block export; an unregistered term does not.

Added and edited labels are automatically saved in the current browser. A saved draft is used only while the source image labels are unchanged, so a newer deployed CSV safely supersedes stale local drafts. Use `全図版CSV` to download one complete replacement CSV containing every labeled plate, or reset the current image to its deployed CSV state.

The tool does not write source files. Apply the completed bundle to both:

```text
content/csv/terms.csv
content/csv/image_labels.csv
```

## Image Structure Suggestions

Edit `content/csv/image_suggestions.csv` to maintain the optional candidates shown in the label editor.

Required columns:

```csv
imageId,suggestions
```

Write each candidate as `Japanese::English`, and separate candidates with `|`:

```csv
gray290_foot_medial_plate,距骨::talus|踵骨::calcaneus|舟状骨::navicular bone
```

During `npm run build:data`, every candidate must match exactly one term that already has Japanese, English, and Latin names. An unknown or ambiguous candidate fails the build instead of appearing as an unregistered hint. The validator also rejects unknown image IDs, malformed entries, and duplicates within the same image.

After updating CSV, run:

```bash
npm run build:data
npm run validate:data
npm run build
```

## Normalized Coordinates

`x` and `y` are normalized coordinates from `0` to `1`.

- `x = 0` is the left edge.
- `x = 1` is the right edge.
- `y = 0` is the top edge.
- `y = 1` is the bottom edge.

For example, a marker at the center of the image is:

```csv
x,y
0.5,0.5
```

The React app converts these values to CSS percentages when rendering markers.

## Image Hotspot Questions

The requested CSV schema does not include dedicated hotspot columns. To preserve the current sample hotspot question, `questions.csv` includes an optional development-only `hotspots` column containing JSON.

Example:

```csv
hotspots
"[{""x"":74,""y"":68,""radius"":11,""termId"":""calcaneus""}]"
```

Hotspot `x`, `y`, and `radius` currently use the app's click-percent convention.

## Gray's Anatomy Public-Domain Plates

Public-domain Gray's Anatomy plates are supported through image credit metadata.
Gray single-structure images in `public/images/gray/single/` are suitable for `single_image_mcq` rows.
Gray plate images in `public/images/gray/plates/` can be registered in `images.csv`, but do not create `image_number_mcq` rows for them until numbered markers have been added to `image_labels.csv`.

Use `sourceType`:

```csv
gray_anatomy
```

Example image credit:

```csv
gray_plate_123,images/gray-plate-123.png,Gray plate 123,"Gray, Henry. Anatomy of the Human Body, 20th U.S. edition, 1918.",gray_anatomy,Henry Vandyke Carter,1918,Public domain,https://example.org/gray-plate-123,true,Added numbered markers for AnatoDrill quiz use.
```

If you crop, recolor, add arrows, add labels, or otherwise alter the image, set `modified` to `true` and describe the change in `modificationDescription`.

## Copyrighted Textbook Images

Do not use copyrighted textbook images unless the project has explicit permission and the permission terms are recorded. Prefer:

- Original placeholder diagrams.
- OpenStax images with attribution.
- Wikimedia Commons images with compatible licenses.
- Public-domain Gray's Anatomy plates.
- Other public-domain or Creative Commons images with clear source URLs and license metadata.

Every image used by an image-based question should have a row in `images.csv`.
