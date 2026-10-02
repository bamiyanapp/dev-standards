"use strict";

const fs = require("node:fs");
const { packageNameFromKey } = require("./dependency-update-info.js");

// issue #648（OSS依存更新の自動安全判定基盤 Phase 3）package script/diff検査。
// サプライチェーン攻撃（event-stream事件等）の典型的な手口の1つは、依存パッケージへ
// install script（preinstall/install/postinstall）を新規に仕込むことである（#645
// 「5. Supply Chainチェック」参照）。npm lockfileVersion 3は、各パッケージエントリに
// 実際のscript本文ではなく`hasInstallScript: true`という真偽値フラグのみを記録する
// （本文自体はpackage.json側にあり、lockfileには含まれない）。このフラグの新規出現を
// 検知するだけであれば、package-lock.jsonの比較のみで足り、外部通信・npm registryへの
// 問い合わせが一切不要となる
//
// 検知対象は以下の2パターン。
// - 既存パッケージがバージョン更新に伴いinstall scriptを新規に持つようになった
// - 新規に追加されたパッケージ（直接・間接問わず）がinstall scriptを持つ
//   （dependency-update-info.jsのdiffPackageLocksは追加・削除のみのパッケージを
//   対象外とするため、本モジュールは独立してpackages全体を比較する）
//
// 既存パッケージがinstall scriptを失う（削除された）場合は、リスクの観点では
// 無害（より安全な状態への変化）なため検知対象としない

function diffInstallScripts(oldLockJson, newLockJson) {
  const oldPackages = oldLockJson?.packages ?? {};
  const newPackages = newLockJson?.packages ?? {};

  const anomalies = [];
  for (const [key, newEntry] of Object.entries(newPackages)) {
    if (key === "") continue;
    if (!newEntry.hasInstallScript) continue;

    const oldEntry = oldPackages[key];
    if (oldEntry?.hasInstallScript) continue; // 既存のまま変化なし

    const name = packageNameFromKey(key);
    if (!name) continue;

    anomalies.push({
      name,
      version: newEntry.version ?? null,
      kind: oldEntry ? "existing_package_gained_install_script" : "new_package_with_install_script",
    });
  }
  return anomalies.sort((a, b) => a.name.localeCompare(b.name));
}

function readJsonFile(path) {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

function main() {
  const [, , oldLockPath, newLockPath] = process.argv;
  if (!oldLockPath || !newLockPath) {
    console.error("Usage: node dependency-package-anomaly-info.js <old-package-lock.json> <new-package-lock.json>");
    process.exitCode = 1;
    return;
  }
  const anomalies = diffInstallScripts(readJsonFile(oldLockPath), readJsonFile(newLockPath));
  console.log(JSON.stringify(anomalies, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  diffInstallScripts,
};
