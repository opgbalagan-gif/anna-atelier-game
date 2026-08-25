import { readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const videoDirectory = fileURLToPath(new URL("../public/assets/videos/", import.meta.url));
const containerTypes = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "udta", "dinf", "mvex", "moof", "traf", "mfra", "meta"]);

function readBox(buffer, offset, limit) {
  if (offset + 8 > limit) return null;
  let size = buffer.readUInt32BE(offset);
  const type = buffer.toString("ascii", offset + 4, offset + 8);
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > limit) return null;
    size = Number(buffer.readBigUInt64BE(offset + 8));
    headerSize = 16;
  } else if (size === 0) {
    size = limit - offset;
  }
  if (size < headerSize || offset + size > limit) return null;
  return { offset, size, type, headerSize, end: offset + size };
}

function topLevelBoxes(buffer) {
  const boxes = [];
  for (let offset = 0; offset < buffer.length;) {
    const box = readBox(buffer, offset, buffer.length);
    if (!box) throw new Error(`Invalid MP4 box at byte ${offset}`);
    boxes.push(box);
    offset = box.end;
  }
  return boxes;
}

function patchChunkOffsets(moov, delta) {
  let patchedEntries = 0;

  function visit(start, end) {
    for (let offset = start; offset < end;) {
      const box = readBox(moov, offset, end);
      if (!box) throw new Error(`Invalid nested MP4 box at byte ${offset}`);

      if (box.type === "stco" || box.type === "co64") {
        const entryCount = moov.readUInt32BE(offset + box.headerSize + 4);
        const entrySize = box.type === "stco" ? 4 : 8;
        const entriesStart = offset + box.headerSize + 8;
        if (entriesStart + entryCount * entrySize > box.end) throw new Error(`Invalid ${box.type} table`);
        for (let index = 0; index < entryCount; index += 1) {
          const entryOffset = entriesStart + index * entrySize;
          if (box.type === "stco") {
            const value = moov.readUInt32BE(entryOffset) + delta;
            if (value > 0xffffffff) throw new Error("stco offset exceeds 32-bit range");
            moov.writeUInt32BE(value, entryOffset);
          } else {
            moov.writeBigUInt64BE(moov.readBigUInt64BE(entryOffset) + BigInt(delta), entryOffset);
          }
          patchedEntries += 1;
        }
      } else if (containerTypes.has(box.type)) {
        const fullBoxHeader = box.type === "meta" ? 4 : 0;
        visit(offset + box.headerSize + fullBoxHeader, box.end);
      }

      offset = box.end;
    }
  }

  visit(8, moov.length);
  return patchedEntries;
}

for (const filename of readdirSync(videoDirectory).filter((name) => extname(name).toLowerCase() === ".mp4")) {
  const inputPath = join(videoDirectory, filename);
  const input = readFileSync(inputPath);
  const boxes = topLevelBoxes(input);
  const ftyp = boxes.find((box) => box.type === "ftyp");
  const mdat = boxes.find((box) => box.type === "mdat");
  const moov = boxes.find((box) => box.type === "moov");
  if (!ftyp || !mdat || !moov) throw new Error(`${filename}: required MP4 boxes are missing`);
  if (moov.offset < mdat.offset) {
    console.log(`${filename}: already optimized`);
    continue;
  }

  const patchedMoov = Buffer.from(input.subarray(moov.offset, moov.end));
  const patchedEntries = patchChunkOffsets(patchedMoov, moov.size);
  if (patchedEntries === 0) throw new Error(`${filename}: no media chunk offsets found`);

  const output = Buffer.concat([
    input.subarray(0, ftyp.end),
    patchedMoov,
    input.subarray(ftyp.end, moov.offset),
    input.subarray(moov.end),
  ]);
  if (output.length !== input.length) throw new Error(`${filename}: output size changed unexpectedly`);

  const temporaryPath = `${inputPath}.faststart.tmp`;
  const backupPath = `${inputPath}.before-faststart`;
  writeFileSync(temporaryPath, output);
  const optimizedBoxes = topLevelBoxes(output);
  if (optimizedBoxes.find((box) => box.type === "moov").offset > optimizedBoxes.find((box) => box.type === "mdat").offset) {
    throw new Error(`${filename}: optimization validation failed`);
  }

  renameSync(inputPath, backupPath);
  renameSync(temporaryPath, inputPath);
  unlinkSync(backupPath);
  console.log(`${filename}: moved playback index to the beginning (${patchedEntries} chunk offsets)`);
}
