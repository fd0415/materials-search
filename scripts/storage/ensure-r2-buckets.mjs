import { existsSync, readFileSync, statSync } from "node:fs";
import { createR2Client, ensureR2Bucket } from "./r2.mjs";

loadDotEnv(".env.local");
loadDotEnv(".env");

const buckets = [
  process.env.R2_BUCKET_SUBTITLE_SOURCES ?? "bbt-subtitle-sources",
  process.env.R2_BUCKET_PUBLIC_ASSETS ?? "bbt-public-assets",
  process.env.R2_BUCKET_AUTHORIZED_VIDEO ?? "bbt-authorized-video"
];

const client = createR2Client();

for (const bucket of buckets) {
  await ensureR2Bucket(client, bucket);
  console.log(`R2 bucket ready: ${bucket}`);
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }

    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
