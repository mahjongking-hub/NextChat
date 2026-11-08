import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { CN_MASKS } from "./cn";
import { TW_MASKS } from "./tw";
import { EN_MASKS } from "./en";

import { type BuiltinMask } from "./typing";

const BUILTIN_MASKS: Record<string, BuiltinMask[]> = {
  cn: CN_MASKS,
  tw: TW_MASKS,
  en: EN_MASKS,
};

const dirname = path.dirname(fileURLToPath(import.meta.url));

fs.writeFileSync(
  dirname + "/../../public/masks.json",
  JSON.stringify(BUILTIN_MASKS, null, 4),
);
