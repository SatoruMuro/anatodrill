# AnatoDrill

[Open AnatoDrill](https://satorumuro.github.io/anatodrill/)

AnatoDrill is a browser-only self-study app for memorizing anatomy terminology with randomized drills, spaced repetition reviews, image-based questions, self-check tests, local backup, and PDF certificate generation. Drill, review, and test choices can be displayed in Japanese/English/Latin together, Japanese only, English only, or Latin only.

## Tech Stack

- React
- Vite
- TypeScript
- CSS
- localStorage persistence
- jsPDF certificate generation

The app does not require authentication, a backend, a database, server-side processing, or external APIs.

## Local Development

```bash
npm install
npm run dev
```

Because Vite is configured with `base: "/anatodrill/"`, open the dev server at:

```text
http://localhost:5173/anatodrill/
```

## Build

```bash
npm run build
```

The static output is generated in `dist/`.

## Data Validation

Validate local data before building or deploying:

```bash
npm run validate:data
```

The validator checks term references, three-language completeness for quiz terms, choice references, test set IDs, image IDs, image files under `public/`, numbered image target labels, one-to-one coverage between image labels and numbered questions, duplicate label use, and whether each active test set has at least one question.

## CSV Content Pipeline

Source content can be edited as UTF-8 CSV files under `content/csv/`:

- `content/csv/terms.csv`
- `content/csv/questions.csv`
- `content/csv/images.csv`
- `content/csv/image_labels.csv`
- `content/csv/test_sets.csv`

Generate runtime JSON data from CSV:

```bash
npm run build:data
```

Then validate and build:

```bash
npm run validate:data
npm run build
```

Use pipe-separated IDs for array-like fields. For example, `choices` in `questions.csv` uses `term_a|term_b|term_c|term_d`, and a term that belongs to multiple test sets can use `test_a|test_b` in `terms.csv`.

The CSV build script is development-only. The deployed browser app still imports static JSON files and does not parse CSV at runtime. The script uses a built-in CSV parser, so no extra CSV parsing dependency is required.

Every valid row in `image_labels.csv` automatically becomes one `image_number_mcq` unless an authored question already uses the same image/label pair. Generated choices prefer other structures on the same plate, and numbered questions are routed to head/neck, upper limb, lower limb, trunk, or muscle test sets from the answer term metadata.

More authoring details are in `docs/content-authoring.md`.

After editing CSV content, a typical local review workflow is:

```bash
npm run build:data
npm run validate:data
npm run build
npm run dev
```

Open the app and use `問題一覧` to review every generated question without randomization. If an image does not appear in Drill mode, first check whether the question and image appear correctly in `問題一覧`; it shows image previews, references, choices, explanations, and browser-side diagnostics.

## GitHub Pages Deployment

This project is configured for the repository name `anatodrill` and the public URL:

```text
https://SatoruMuro.github.io/anatodrill/
```

Vite uses `base: "/anatodrill/"`, so all built asset URLs are compatible with GitHub Pages under that repository path.

1. Create a GitHub repository named `anatodrill`.
2. Push this project to the repository's `main` branch.
3. In the GitHub repository, open `Settings > Pages`.
4. Set `Source` to `GitHub Actions`.
5. Pushes to `main` will run `.github/workflows/deploy.yml` and publish the built `dist/` directory.

The published URL should be:

```text
https://SatoruMuro.github.io/anatodrill/
```

Editor-only tools can be opened online with the hidden query-string URL:

```text
https://SatoruMuro.github.io/anatodrill/?dev=1
```

The editor page is protected by a client-side password gate. This is a lightweight static-site guard for trusted editors, not server-side authentication. The app still has no backend, login system, or external API dependency.

The deployment workflow runs:

```bash
npm ci
npm run build:data
npm run validate:data
npm run build
```

The GitHub Actions workflow is:

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build:data
      - run: npm run validate:data
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Data Files

Local JSON data lives in:

- `src/data/terms.json`
- `src/data/questions.json`
- `src/data/images.json`
- `src/data/testSets.json`

Image assets live in:

- `public/images/`

Image-based questions should reference `imageId`, not a raw file path. The `imageId` must exist in `src/data/images.json`, which stores title, source, author, edition/year, license, source URL, modification status, and modification description for every image used by the app.

The supported multiple-choice question types include `text_mcq`, `image_label_mcq`, `image_number_mcq`, and `single_image_mcq`. Use `single_image_mcq` for one isolated structure image, such as a bone, organ, specimen, histology image, or structure photo. If its CSV `prompt` field is blank, the app asks `この構造物はどれか。`.

Reusable numbered image plates are also defined in `images.json`. A plate uses the same image metadata plus a `labels` array:

```json
{
  "label": "1",
  "termId": "clavicle",
  "x": 0.27,
  "y": 0.24,
  "note": "Horizontal bone at the anterior shoulder girdle."
}
```

The `x` and `y` coordinates are normalized `0` to `1` positions from the top-left corner of the image. The app overlays numbered markers at those positions for image plate study and `image_number_mcq` questions.

Supported source types are:

- `placeholder`
- `gray_anatomy`
- `openstax`
- `wikimedia_commons`
- `other`

For public-domain Gray's Anatomy plates, use metadata like:

```json
{
  "source": "Gray, Henry. Anatomy of the Human Body, 20th U.S. edition, 1918.",
  "sourceType": "gray_anatomy",
  "author": "Henry Vandyke Carter",
  "editionYear": "1918",
  "license": "Public domain",
  "sourceUrl": "https://...",
  "modified": true,
  "modificationDescription": "Added arrow/label/highlight for quiz use."
}
```

Do not add copyrighted textbook images unless the project has explicit permission and records the license in `images.json`.

Gray single-structure files under `public/images/gray/single/` are used for `single_image_mcq` questions. Gray plate files under `public/images/gray/plates/` should be registered with credits first. Adding valid numbered markers to `image_labels.csv` generates the corresponding `image_number_mcq` questions during `npm run build:data`.

## Tests And Results

Test mode does not ask users to select a regional test set. It draws 30 questions at random from every question that supports the selected Japanese, English, Latin, or trilingual answer mode. The setup screen shows the full eligible pool size; if fewer than 30 questions are eligible, AnatoDrill uses all available questions. The passing score is 80%.

Regional test-set metadata remains in the generated data for internal question organization and compatibility with older test history, but it does not limit the current test pool.

Completed test attempts store the full-range scope ID, Japanese title, version, passing score, completion time, duration, score, pass/fail result, certificate ID, and app version. After a test, users can download:

- PDF certificate, only when passing
- JSON result record
- CSV result record

The PDF certificate includes the app name, certificate title, name, student ID, question scope, scope ID, scope version, date/time, question count, correct answers, score percentage, passing score, pass/fail result, certificate ID, app version, and this disclaimer:

```text
This certificate is a self-check record generated by a browser-based learning app. It is not an official academic transcript.
```

JSON and CSV result exports include:

- `appVersion`
- `certificateId`
- `name`
- `studentId`
- `testSetId`
- `testSetTitleJa`
- `testSetVersion`
- `choiceLanguageMode`
- `choiceLanguageLabel`
- `dateTime`
- `totalQuestions`
- `correctAnswers`
- `scorePercentage`
- `passingScore`
- `pass`
- `durationSeconds`

The History / Backup page keeps the full localStorage backup/import flow and adds a `テスト結果のエクスポート` section. Recent stored attempts show date/time, name, student ID, Japanese test set title, score percentage, pass/fail result, and certificate ID. Each stored attempt can be downloaded as JSON or CSV, and passing attempts can also re-download the PDF certificate.

## Learning Data

Progress and test attempts are stored in the current browser's `localStorage`. Progress is tracked separately for trilingual, Japanese-only, English-only, and Latin-only study. Legacy Japanese/English progress remains preserved as the old bilingual mode. Use the History / Backup screen to export learning data as JSON before clearing browser data or moving to another device.

## Japanese PDF Fonts

Certificate PDFs use local Noto Sans JP font files so Japanese names, Japanese test set names, and Japanese labels render correctly in jsPDF:

- `public/fonts/NotoSansJP-Regular.ttf`
- `public/fonts/NotoSansJP-Bold.ttf`
- `public/fonts/OFL.txt`

At runtime, the app loads these files from the Vite base path, for example:

```text
/anatodrill/fonts/NotoSansJP-Regular.ttf
/anatodrill/fonts/NotoSansJP-Bold.ttf
```

The font ArrayBuffer is converted to base64 in the browser, then registered with jsPDF through `addFileToVFS` and `addFont`. If the Japanese font cannot be loaded, certificate generation falls back to an English-only PDF and writes a console warning.

Noto Sans JP is distributed under the SIL Open Font License 1.1. The app does not load external fonts or external font APIs at runtime.
