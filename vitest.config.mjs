import { defineConfig } from "vitest/config";

// 共有コンポーネント（shared/ui・shared/pwa）のテストだけをVitestで実行する。
// *.test.js は従来どおり node --test が実行する（globが重ならないよう *.test.jsx に限定）
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["shared/**/*.test.jsx"],
    restoreMocks: true,
  },
});
