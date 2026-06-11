import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_NOISE_PATTERNS = [
  /opensubtitles/i,
  /subtitle\s+download/i,
  /www\./i,
  /字幕组/,
  /校对/,
  /时间轴/,
  /翻译/
];

export function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function parseSrtFile(filePath) {
  return parseSrt(readFileSync(filePath, "utf8"), filePath);
}

export function parseSrt(content, sourceName = "inline") {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const entries = [];
  const badBlocks = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      continue;
    }

    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex === -1) {
      badBlocks.push({ sourceName, block: block.slice(0, 160), reason: "missing_timecode" });
      continue;
    }

    const timeLine = lines[timeLineIndex];
    const match = timeLine.match(
      /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/
    );
    if (!match) {
      badBlocks.push({ sourceName, block: block.slice(0, 160), reason: "invalid_timecode" });
      continue;
    }

    const indexCandidate = lines[timeLineIndex - 1];
    const sourceIndex = indexCandidate && /^\d+$/.test(indexCandidate) ? indexCandidate : String(entries.length + 1);
    const text = lines.slice(timeLineIndex + 1).join("\n").trim();

    entries.push({
      sourceIndex,
      startMs: parseTimecode(match[1]),
      endMs: parseTimecode(match[2]),
      text
    });
  }

  return { entries, badBlocks };
}

export function cleanEntries(entries, options = {}) {
  const dropped = [];
  const cleaned = [];

  for (const entry of entries) {
    const result = cleanText(entry.text, options);
    if (!result.text) {
      dropped.push({ ...entry, reason: result.dropReason ?? "empty_after_cleaning" });
      continue;
    }

    cleaned.push({
      ...entry,
      text: result.text,
      qualityFlags: result.qualityFlags
    });
  }

  return { entries: cleaned, dropped };
}

export function cleanText(input, options = {}) {
  const noisePatterns = options.noisePatterns ?? DEFAULT_NOISE_PATTERNS;
  const withoutTags = input
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\\[^}]+\}/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[♪♫]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!withoutTags) {
    return { text: "", qualityFlags: [], dropReason: "empty_after_cleaning" };
  }

  if (noisePatterns.some((pattern) => pattern.test(withoutTags))) {
    return { text: "", qualityFlags: ["noise_pattern"], dropReason: "drop_noise_pattern" };
  }

  if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(withoutTags)) {
    return { text: "", qualityFlags: ["symbol_only"], dropReason: "drop_symbol_only" };
  }

  if (/^[A-Z0-9]{3,6}$/.test(withoutTags)) {
    return { text: "", qualityFlags: ["uppercase_noise"], dropReason: "drop_uppercase_noise" };
  }

  const qualityFlags = [];
  if (/[*#=_]{2,}/.test(withoutTags) || /[A-Z]{2}\d{2,}/.test(withoutTags)) {
    qualityFlags.push("ocr_noise_suspected");
  }
  if (withoutTags.length <= 2) {
    qualityFlags.push("very_short_text");
  }

  return { text: withoutTags, qualityFlags };
}

export function alignBilingual(enEntries, zhEntries, options = {}) {
  const minOverlapMs = options.minOverlapMs ?? 150;
  const matchedEnIndexes = new Set();
  const lines = [];

  for (const zh of zhEntries) {
    const matches = enEntries.filter((en, index) => {
      const overlap = overlapMs(en, zh);
      if (overlap < minOverlapMs) {
        return false;
      }
      matchedEnIndexes.add(index);
      return true;
    });

    lines.push({
      startMs: zh.startMs,
      endMs: zh.endMs,
      textEn: joinUnique(matches.map((entry) => entry.text)),
      textZh: zh.text,
      source: {
        zhIndex: zh.sourceIndex,
        enIndexes: matches.map((entry) => entry.sourceIndex)
      },
      qualityFlags: uniqueFlags([zh, ...matches])
    });
  }

  enEntries.forEach((en, index) => {
    if (matchedEnIndexes.has(index)) {
      return;
    }

    lines.push({
      startMs: en.startMs,
      endMs: en.endMs,
      textEn: en.text,
      textZh: null,
      source: {
        zhIndex: null,
        enIndexes: [en.sourceIndex]
      },
      qualityFlags: en.qualityFlags ?? []
    });
  });

  const sorted = lines
    .filter((line) => line.textEn || line.textZh)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  return {
    lines: sorted.map((line, index) => ({
      lineIndex: index + 1,
      ...line,
      timecodeLabel: formatTimeRange(line.startMs, line.endMs)
    })),
    stats: buildAlignmentStats(enEntries, zhEntries, sorted, matchedEnIndexes)
  };
}

export function buildSegments(lines, options = {}) {
  const maxGapMs = options.maxGapMs ?? 4500;
  const maxDurationMs = options.maxDurationMs ?? 16000;
  const maxLines = options.maxLines ?? 6;
  const segments = [];
  let current = [];
  let skippedNoiseOrEmptyLines = 0;

  const flush = () => {
    if (current.length === 0) {
      return;
    }

    const start = current[0];
    const end = current[current.length - 1];
    segments.push({
      id: `segment-${String(segments.length + 1).padStart(4, "0")}`,
      startMs: start.startMs,
      endMs: end.endMs,
      capturedAtMs: Math.floor((start.startMs + end.endMs) / 2),
      timecodeLabel: formatTimeRange(start.startMs, end.endMs),
      durationMs: end.endMs - start.startMs,
      lineIndexes: current.map((line) => line.lineIndex),
      lineCount: current.length,
      textEn: current.map((line) => line.textEn).filter(Boolean).join(" "),
      textZh: current.map((line) => line.textZh).filter(Boolean).join(" "),
      qualityFlags: [...new Set(current.flatMap((line) => line.qualityFlags ?? []))],
      lines: current
    });
    current = [];
  };

  for (const line of lines) {
    if (!line.textEn && !line.textZh) {
      skippedNoiseOrEmptyLines += 1;
      continue;
    }

    const previous = current[current.length - 1];
    const wouldExceedGap = previous && line.startMs - previous.endMs > maxGapMs;
    const wouldExceedDuration = current[0] && line.endMs - current[0].startMs > maxDurationMs;
    const wouldExceedLines = current.length >= maxLines;

    if (wouldExceedGap || wouldExceedDuration || wouldExceedLines) {
      flush();
    }

    current.push(line);
  }

  flush();

  return {
    strategy: {
      name: "subtitle_timing_dialogue_windows",
      maxGapMs,
      maxDurationMs,
      maxLines,
      skippedNoiseOrEmptyLines
    },
    segments
  };
}

export function buildMaterialPayload(options) {
  const enPath = path.resolve(options.enPath);
  const zhPath = path.resolve(options.zhPath);
  const enParsed = parseSrtFile(enPath);
  const zhParsed = parseSrtFile(zhPath);
  const enCleaned = cleanEntries(enParsed.entries);
  const zhCleaned = cleanEntries(zhParsed.entries);
  const aligned = alignBilingual(enCleaned.entries, zhCleaned.entries, {
    minOverlapMs: options.minOverlapMs
  });
  const builtSegments = buildSegments(aligned.lines, options.segmentOptions);
  const generatedAt = new Date().toISOString();

  const subtitleLines = {
    sourceVideo: options.videoPath ?? null,
    subtitleSources: {
      en: options.enPath,
      zh: options.zhPath,
      enSha256: sha256File(enPath),
      zhSha256: sha256File(zhPath)
    },
    alignmentStrategy: "zh_timeline_primary_time_overlap_en_joined_with_unmatched_en",
    lineCount: aligned.lines.length,
    lines: aligned.lines
  };

  const subtitleSegments = {
    version: 1,
    generatedAt,
    source: {
      subtitleLines: "generated/subtitle-lines.json",
      sourceVideo: options.videoPath ?? null,
      subtitleSources: subtitleLines.subtitleSources,
      alignmentStrategy: subtitleLines.alignmentStrategy
    },
    strategy: builtSegments.strategy,
    segmentCount: builtSegments.segments.length,
    segments: builtSegments.segments
  };

  const dbImport = {
    version: 1,
    generatedAt,
    checksumSha256: createHash("sha256").update(JSON.stringify({ subtitleLines, subtitleSegments })).digest("hex"),
    show: {
      title: options.showTitle,
      originalTitle: options.showOriginalTitle,
      slug: options.showSlug
    },
    episode: {
      seasonNo: options.seasonNo,
      episodeNo: options.episodeNo,
      code: options.episodeCode,
      title: options.episodeTitle,
      originalTitle: options.episodeOriginalTitle,
      airDate: options.airDate ?? null,
      durationMs: Math.max(...aligned.lines.map((line) => line.endMs))
    },
    subtitleSources: subtitleLines.subtitleSources,
    subtitleLines: aligned.lines,
    subtitleSegments: builtSegments.segments
  };

  return {
    subtitleLines,
    subtitleSegments,
    dbImport,
    validation: buildValidationReport({
      enParsed,
      zhParsed,
      enCleaned,
      zhCleaned,
      alignmentStats: aligned.stats,
      segmentCount: builtSegments.segments.length
    })
  };
}

export function buildValidationReport(input) {
  return {
    generatedAt: new Date().toISOString(),
    input: {
      enEntryCount: input.enParsed.entries.length,
      zhEntryCount: input.zhParsed.entries.length,
      enBadBlocks: input.enParsed.badBlocks,
      zhBadBlocks: input.zhParsed.badBlocks
    },
    cleaning: {
      droppedEnCount: input.enCleaned.dropped.length,
      droppedZhCount: input.zhCleaned.dropped.length,
      droppedEnExamples: input.enCleaned.dropped.slice(0, 12),
      droppedZhExamples: input.zhCleaned.dropped.slice(0, 12)
    },
    alignment: input.alignmentStats,
    output: {
      segmentCount: input.segmentCount
    }
  };
}

function parseTimecode(value) {
  const [hours, minutes, secondsWithMs] = value.replace(",", ".").split(":");
  const [seconds, ms = "0"] = secondsWithMs.split(".");
  return (
    Number(hours) * 60 * 60 * 1000 +
    Number(minutes) * 60 * 1000 +
    Number(seconds) * 1000 +
    Number(ms.padEnd(3, "0").slice(0, 3))
  );
}

function overlapMs(a, b) {
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
}

function joinUnique(texts) {
  return [...new Set(texts.filter(Boolean))].join(" ") || null;
}

function uniqueFlags(entries) {
  return [...new Set(entries.flatMap((entry) => entry.qualityFlags ?? []))];
}

function buildAlignmentStats(enEntries, zhEntries, alignedLines, matchedEnIndexes) {
  const missingZh = alignedLines.filter((line) => !line.textZh).length;
  const missingEn = alignedLines.filter((line) => !line.textEn).length;
  const startDeltas = alignedLines
    .filter((line) => line.source.enIndexes.length > 0 && line.source.zhIndex)
    .map((line) => {
      const firstEn = enEntries.find((entry) => entry.sourceIndex === line.source.enIndexes[0]);
      return firstEn ? Math.abs(firstEn.startMs - line.startMs) : null;
    })
    .filter((value) => value !== null);

  return {
    matchedEn: matchedEnIndexes.size,
    unmatchedEn: enEntries.length - matchedEnIndexes.size,
    missingZh,
    missingEn,
    matchRate: enEntries.length === 0 ? 0 : Number((matchedEnIndexes.size / enEntries.length).toFixed(3)),
    avgAbsStartDeltaMs:
      startDeltas.length === 0
        ? 0
        : Number((startDeltas.reduce((sum, value) => sum + value, 0) / startDeltas.length).toFixed(1)),
    outputLineCount: alignedLines.length,
    zhEntryCount: zhEntries.length,
    examples: alignedLines.slice(0, 8),
    unmatchedEnExamples: alignedLines.filter((line) => !line.textZh).slice(0, 8)
  };
}

function formatTimeRange(startMs, endMs) {
  return `${formatShortTime(startMs)}-${formatShortTime(endMs)}`;
}

function formatShortTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
