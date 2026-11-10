import { BLOCKS } from "../packages/dialog/src/questionnaire";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const outputIndex = process.argv.indexOf("--output");
if (outputIndex < 0 || !process.argv[outputIndex + 1]) throw new Error("Pass --output PATH_TO_BACKEND/core/questionnaire.json");
const path = resolve(process.argv[outputIndex + 1]!);
const content = JSON.stringify(BLOCKS, null, 2);
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== content) throw new Error("Questionnaire schemas differ; export and commit the updated schema to the backend repository.");
} else writeFileSync(path, content);
