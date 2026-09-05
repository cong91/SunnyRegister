import assert from "node:assert/strict";
import fs from "node:fs";

const contextSource = fs.readFileSync(new URL("../src/lib/i18n-context.tsx", import.meta.url), "utf8");

assert.match(contextSource, /export type Language\s*=\s*'vi-VN'\s*\|\s*'en-US'/u);
assert.match(contextSource, /const DEFAULT_LANGUAGE: Language = 'vi-VN'/u);
assert.match(contextSource, /localizeText/u);
assert.match(contextSource, /placeholder/u);
assert.match(contextSource, /aria-label/u);
assert.match(contextSource, /MutationObserver/u);

const localizerSource = fs.readFileSync(new URL("../src/lib/text-localizer.ts", import.meta.url), "utf8");
assert.match(localizerSource, /reverse proxy/u);
assert.match(localizerSource, /nhận mã SMS/u);

const pageSource = fs.readFileSync(new URL("../src/pages/SunnyRegister.tsx", import.meta.url), "utf8");
assert.doesNotMatch(pageSource, /data-i18n-ignore/u);

const mapSource = fs.readFileSync(new URL("../src/lib/vi-text-map.ts", import.meta.url), "utf8");
assert.doesNotMatch(mapSource, /^  ".*(?:<|className|onChange|value=|return |import ).*":/mu);
assert.doesNotMatch(mapSource, /sunny_token/iu);
assert.doesNotMatch(mapSource, /": "[^"]*[\u3400-\u9fff][^"]*",/u);

console.log("i18n smoke contract passed");
