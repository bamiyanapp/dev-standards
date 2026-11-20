// コメント付きJSON（JSONC）を読む、テスト用の関数。tsconfigのベース・oxlintのプリセットは、コメントを含む。
import fs from "node:fs";

export function readJsonc(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(stripped);
}
