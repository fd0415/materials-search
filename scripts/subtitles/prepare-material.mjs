import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildMaterialPayload } from "./pipeline.mjs";

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out ?? "material/generated");

const payload = buildMaterialPayload({
  enPath: args.en ?? "material/en.srt",
  zhPath: args.zh ?? "material/zh.srt",
  videoPath: args.video ?? null,
  showTitle: args.showTitle ?? "The Big Bang Theory",
  showOriginalTitle: args.showOriginalTitle ?? "生活大爆炸",
  showSlug: args.showSlug ?? "the-big-bang-theory",
  seasonNo: Number(args.season ?? 1),
  episodeNo: Number(args.episode ?? 1),
  episodeCode: args.episodeCode ?? "S01E01",
  episodeTitle: args.episodeTitle ?? "Pilot",
  episodeOriginalTitle: args.episodeOriginalTitle ?? "试播集",
  airDate: args.airDate ?? "2007-09-24"
});

mkdirSync(outDir, { recursive: true });
writeJson(path.join(outDir, "subtitle-lines.json"), payload.subtitleLines);
writeJson(path.join(outDir, "subtitle-segments.json"), payload.subtitleSegments);
writeJson(path.join(outDir, "subtitles.validation.json"), payload.validation);
writeJson(path.join(outDir, "db-import.json"), payload.dbImport);

console.log(`Generated material payload in ${outDir}`);
console.log(
  JSON.stringify(
    {
      lines: payload.dbImport.subtitleLines.length,
      segments: payload.dbImport.subtitleSegments.length,
      droppedEn: payload.validation.cleaning.droppedEnCount,
      droppedZh: payload.validation.cleaning.droppedZhCount,
      matchRate: payload.validation.alignment.matchRate,
      unmatchedEn: payload.validation.alignment.unmatchedEn,
      missingEn: payload.validation.alignment.missingEn
    },
    null,
    2
  )
);

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
