import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_SOURCE_PDF = "source/三等業餘無線電人員資格測試題庫.pdf";
const DEFAULT_OUTPUT_JSON = "data/amateurRadioLevel3.generated.json";
const DEFAULT_PDFJS_PATH =
  "../nkutve-system/frontend-app/node_modules/pdfjs-dist/legacy/build/pdf.mjs";

const CATEGORIES = [
  {
    key: "regulations",
    name: "無線電規章與相關法規",
    startPage: 19,
    endPage: 58,
    expectedCount: 229
  },
  {
    key: "communication_methods",
    name: "無線電通訊方法",
    startPage: 59,
    endPage: 80,
    expectedCount: 132
  },
  {
    key: "radio_system_principles",
    name: "無線電系統原理",
    startPage: 81,
    endPage: 105,
    expectedCount: 145
  },
  {
    key: "safety_protection",
    name: "無線電相關安全防護",
    startPage: 106,
    endPage: 111,
    expectedCount: 36
  },
  {
    key: "electromagnetic_compatibility",
    name: "電磁相容性技術",
    startPage: 112,
    endPage: 113,
    expectedCount: 10
  },
  {
    key: "rf_interference_prevention",
    name: "射頻干擾的預防與排除",
    startPage: 114,
    endPage: 117,
    expectedCount: 18
  }
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    sourcePdf: DEFAULT_SOURCE_PDF,
    outputJson: DEFAULT_OUTPUT_JSON,
    pdfjsPath: process.env.PDFJS_DIST_PATH || DEFAULT_PDFJS_PATH
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--pdf") options.sourcePdf = args[++index];
    else if (arg === "--out") options.outputJson = args[++index];
    else if (arg === "--pdfjs") options.pdfjsPath = args[++index];
    else if (arg === "--help") {
      console.log(
        [
          "Usage: node scripts/extract-pdf-questions.mjs [--pdf path] [--out path] [--pdfjs path]",
          "",
          `Default PDF: ${DEFAULT_SOURCE_PDF}`,
          `Default output: ${DEFAULT_OUTPUT_JSON}`
        ].join("\n")
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveFromCwd(value) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

async function importPdfJs(pdfjsPath) {
  const resolvedPath = resolveFromCwd(pdfjsPath);
  try {
    await fs.access(resolvedPath);
  } catch {
    throw new Error(
      `Cannot find pdfjs-dist at ${resolvedPath}. Pass --pdfjs or set PDFJS_DIST_PATH.`
    );
  }

  return import(pathToFileURL(resolvedPath).href);
}

function normalizeText(value) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/\s+([?？,，.。:：;；!！])/g, "$1")
    .replace(/([（(])\s+/g, "$1")
    .replace(/\s+([）)])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanPageText(text, category) {
  let cleaned = normalizeText(text);
  cleaned = cleaned.replace(/^\d+\s*/, "");
  cleaned = cleaned.replace(new RegExp(`^${category.name}題庫\\s*`), "");
  cleaned = cleaned.replace(/^射頻干擾的預防與排除題庫\s*/, "");
  return cleaned.trim();
}

async function extractPageText(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const textContent = await page.getTextContent();
  return textContent.items.map((item) => item.str).join(" ");
}

function splitQuestionBlocks(categoryText, expectedCount) {
  const candidates = [];
  const questionStartPattern = /[（(]\s*([1-4])\s*[）)]\s*(\d+)[.．]\s*/g;
  let match;

  while ((match = questionStartPattern.exec(categoryText)) !== null) {
    candidates.push({
      index: match.index,
      bodyStart: questionStartPattern.lastIndex,
      answer: match[1],
      number: Number(match[2])
    });
  }

  const starts = [];
  let nextNumber = 1;
  for (const candidate of candidates) {
    if (candidate.number !== nextNumber) continue;
    starts.push(candidate);
    nextNumber += 1;
    if (starts.length === expectedCount) break;
  }

  return starts.map((start, index) => {
    const next = starts[index + 1];
    return {
      answer: start.answer,
      number: start.number,
      body: categoryText.slice(start.bodyStart, next ? next.index : undefined).trim()
    };
  });
}

function parseOptions(body) {
  const matches = [];
  const optionPattern = /[（(]\s*([1-4])\s*[）)]/g;
  let match;

  while ((match = optionPattern.exec(body)) !== null) {
    matches.push({
      key: match[1],
      index: match.index,
      textStart: optionPattern.lastIndex
    });
  }

  if (matches.length !== 4) {
    return null;
  }

  const question = normalizeText(body.slice(0, matches[0].index));
  const options = matches.map((item, index) => {
    const next = matches[index + 1];
    return {
      key: item.key,
      text: normalizeText(body.slice(item.textStart, next ? next.index : undefined))
    };
  });

  return { question, options };
}

function makeQuestionId(category, number) {
  return `radio-level3-${category.key}-${String(number).padStart(3, "0")}`;
}

function validateQuestions(questions, categoryReports) {
  const errors = [];

  for (const report of categoryReports) {
    if (report.actualCount !== report.expectedCount) {
      errors.push(
        `${report.name}: expected ${report.expectedCount}, got ${report.actualCount}`
      );
    }
  }

  for (const question of questions) {
    if (!question.question) errors.push(`${question.id}: missing question`);
    if (question.options.length !== 4) errors.push(`${question.id}: missing options`);
    if (!["1", "2", "3", "4"].includes(question.answer)) {
      errors.push(`${question.id}: invalid answer ${question.answer}`);
    }
  }

  if (questions.length !== 570) {
    errors.push(`total: expected 570, got ${questions.length}`);
  }

  if (errors.length) {
    throw new Error(`Validation failed:\n${errors.join("\n")}`);
  }
}

async function main() {
  const options = parseArgs();
  const sourcePdf = resolveFromCwd(options.sourcePdf);
  const outputJson = resolveFromCwd(options.outputJson);
  const pdfjsLib = await importPdfJs(options.pdfjsPath);
  const data = new Uint8Array(await fs.readFile(sourcePdf));
  const pdf = await pdfjsLib.getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false
  }).promise;

  const questions = [];
  const categoryReports = [];

  for (const category of CATEGORIES) {
    const pageTexts = [];
    for (let pageNumber = category.startPage; pageNumber <= category.endPage; pageNumber += 1) {
      const pageText = await extractPageText(pdf, pageNumber);
      pageTexts.push(cleanPageText(pageText, category));
    }

    const categoryText = pageTexts.join(" ");
    const blocks = splitQuestionBlocks(categoryText, category.expectedCount);
    categoryReports.push({
      key: category.key,
      name: category.name,
      expectedCount: category.expectedCount,
      actualCount: blocks.length,
      pageRange: `${category.startPage}-${category.endPage}`
    });

    for (const block of blocks) {
      const parsed = parseOptions(block.body);
      if (!parsed) {
        throw new Error(`${category.name} #${block.number}: expected exactly 4 options`);
      }

      questions.push({
        id: makeQuestionId(category, block.number),
        category: category.name,
        categoryKey: category.key,
        sourcePageRange: `${category.startPage}-${category.endPage}`,
        number: block.number,
        type: "single_choice",
        question: parsed.question,
        options: parsed.options,
        answer: block.answer,
        explanation: ""
      });
    }
  }

  validateQuestions(questions, categoryReports);

  const output = {
    metadata: {
      title: "三等業餘無線電人員資格測試題庫",
      level: "level3",
      sourceFile: path.basename(sourcePdf),
      generatedAt: new Date().toISOString(),
      totalQuestions: questions.length,
      answerSource: "答案列於 PDF 題號前方",
      categories: categoryReports
    },
    questions
  };

  await fs.mkdir(path.dirname(outputJson), { recursive: true });
  await fs.writeFile(outputJson, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        output: outputJson,
        totalQuestions: questions.length,
        categories: categoryReports
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
