// 去水印：裁掉封面顶部一条（平台水印固定在右上角最顶部），批量输出到 public/covers。
// 用法：node scripts/media/clean-covers.mjs
// 依赖：sharp。源图取自 material/covers（保持原图不动），结果写入 public/covers。

import sharp from "sharp";
import { readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

const SRC = "material/covers";
const OUT = "public/covers";
const CROP_TOP = 42; // 顶部裁掉的像素高度，正好去掉水印
const WIDTH = 640;
const HEIGHT = 298;

mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC)
  .filter((f) => f.endsWith(".webp"))
  .sort();

let done = 0;
for (const f of files) {
  await sharp(path.join(SRC, f))
    .extract({ left: 0, top: CROP_TOP, width: WIDTH, height: HEIGHT - CROP_TOP })
    .webp({ quality: 82 })
    .toFile(path.join(OUT, f));
  done += 1;
}

console.log(`已去水印并写入 ${OUT}: ${done} 张`);
