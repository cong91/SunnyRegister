import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFiles = [
  "src/App.tsx",
  "src/components/ui/confirm-bubble.tsx",
  "src/pages/SunnyRegister.tsx",
  "src/pages/CheckoutManager.tsx",
  "src/pages/PaymentManagement.tsx",
  "src/pages/payments/MomoPayment.tsx",
  "src/pages/payments/DirectCardPayment.tsx",
  "src/pages/AuditLogPage.tsx",
  "src/pages/PublicLanding.tsx",
];
async function requestTranslation(value) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", value);
    url.searchParams.set("langpair", "zh-CN|vi");
    const response = await fetch(url, { headers: { "User-Agent": "SunnyRegister-i18n-generator/1.0" } });
    if (response.ok) {
      const payload = await response.json();
      const translated = String(payload?.responseData?.translatedText || "").trim() || value;
      return translated.replace(/\r?\n/gu, " ").replace(/[\u3400-\u9fff]/gu, "").replace(/\s{2,}/gu, " ").trim() || value;
    }
    if (response.status !== 429) throw new Error(`Translation request failed: ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error("Translation request rate limited after retries");
}

async function translate(value) {
  const tokenPattern = /\{[\w]+\}|https?:\/\/\S+/gu;
  const matches = [...value.matchAll(tokenPattern)];
  if (!matches.length) return requestTranslation(value);
  let translated = "";
  let cursor = 0;
  for (const match of matches) {
    const part = value.slice(cursor, match.index);
    if (part) translated += await requestTranslation(part);
    translated += match[0];
    cursor = (match.index || 0) + match[0].length;
  }
  const tail = value.slice(cursor);
  if (tail) translated += await requestTranslation(tail);
  return translated || value;
}

async function mapWithConcurrency(values, workerCount = 4) {
  const results = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const value = values[cursor++];
      try {
        results.set(value, await translate(value));
      } catch (error) {
        console.warn(`translation fallback for ${JSON.stringify(value)}: ${error.message}`);
        results.set(value, value);
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

const values = new Set();
for (const relativeFile of sourceFiles) {
  const file = path.join(root, relativeFile);
  const source = await fs.readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
      const value = node.text ?? node.getText(sourceFile);
      if (value && value.length <= 320 && /[\u4e00-\u9fff]/u.test(value) && value.trim().length > 0 && !/[<>]/u.test(value) && !/(?:className|onChange|value=|return |import )/u.test(value)) values.add(value);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}
const sortedValues = [...values].sort();
const translations = await mapWithConcurrency(sortedValues);
const lines = [
  "/* Generated from the frontend's current visible strings. Keep technical identifiers in the source text. */",
  "export const viTextMap: Readonly<Record<string, string>> = {",
  ...sortedValues.map((value) => `  ${JSON.stringify(value)}: ${JSON.stringify(translations.get(value))},`),
  "};",
  "",
];
await fs.mkdir(path.join(root, "src/lib"), { recursive: true });
await fs.writeFile(path.join(root, "src/lib/vi-text-map.ts"), lines.join("\n"), "utf8");
console.log(`generated ${sortedValues.length} Vietnamese translations`);
