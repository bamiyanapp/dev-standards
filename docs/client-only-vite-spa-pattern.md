# 単一パッケージReactアプリ構成（Vite + TypeScript + Bootstrap、`client-only-vite-spa-pattern`）

shock-lab（[bamiyanapp/shock-lab](https://github.com/bamiyanapp/shock-lab)）で検証済みの構成がベースである。dev-standards標準のフロントエンド構成である（`docs/standard-tech-stack.md`「1. フロントエンド」参照）。単一`frontend/`パッケージ（React 19 + Vite + TypeScript + Bootstrap 5.3）で、ログイン・バックエンドAPIの要否を問わず全プロダクトに適用する。

ログイン・バックエンドAPIが不要なプロダクトはそのまま`frontend/`単体で完結する。ログインが必要な場合は「2. ログイン」、独自バックエンドAPI（WebSocketによるリアルタイム双方向通信を含む）が必要な場合は「3. バックエンドAPI」の標準構成と組み合わせる。後者の場合、`frontend/`は単独パッケージではなくnpm workspacesの一部として構成する（後述「npm workspacesでバックエンドと組み合わせる場合」参照）。

## アーキテクチャ

- 単一`frontend/`パッケージ（React 19 + Vite + **TypeScript**）。バックエンドAPIを持たない場合を考える。`reusable-ci.yml`の`packages`入力で指定する。`[{"dir":"frontend","build":true}]`のような形式である（`docs/cicd-pipeline-specification.md`参照）。バックエンドAPIと組み合わせる場合は後述「npm workspacesでバックエンドと組み合わせる場合」を参照
- **UIフレームワークはBootstrap 5.3を標準とする**。`index.html`のCDN `<link>`で読み込む（npmパッケージとして導入してもよい）。共通フォント・ダークモード対応・ボタン押下フィードバック等がある。これらは`shared/ui/bootstrap-theme.css`（`docs/shared-ui-components.md`）をsymlinkして`@import`する
- **ホスティングはS3 + CloudFront**（`docs/static-hosting-pattern.md`）に統一する。バックエンドAPIの有無・ログインの有無によらずホスティング方式は変わらない
- バックエンドAPI・認証基盤を持たない場合、データはすべてクライアント側（メモリ・URLクエリパラメータ・localStorage）で完結する

## デプロイの要点

ホスティング（S3 + CloudFrontのインフラ構築・キャッシュヘッダー戦略・デプロイ手順）は`docs/static-hosting-pattern.md`を参照する。CloudFrontは独自ドメイン直下（または任意のパス）で配信できる。そのため、GitHub Pagesのプロジェクトページのようなリポジトリ名サブパスへの対応（`vite.config.ts`の`base`調整）は基本的に不要である（サイトルート配信を既定とする）。

## TypeScript構成

`tsconfig.json`をproject referencesで分割する。`tsconfig.app.json`（アプリ本体）・`tsconfig.node.json`（`vite.config.ts`自体の型検査用）である。

```json
// tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsconfig.app.json`側で有効にしておくと良いオプション。

- `noUnusedLocals` / `noUnusedParameters`: 未使用変数・引数を検知する。ESLintの`@typescript-eslint/no-unused-vars`と役割が重複しない範囲の型レベルチェックである
- `erasableSyntaxOnly`: TypeScript独自の実行時表現（enum等）を禁止し、型注釈が完全にコンパイル時に消去できることを強制する
- `verbatimModuleSyntax` + `moduleDetection: "force"`: import/exportの扱いをESMに厳密化する
- `moduleResolution: "bundler"`: Viteのモジュール解決に合わせる

`build`スクリプトは`tsc -b && vite build`として、型検査を先に走らせる。

## 状態管理パターン（Zustand）

バックエンドAPIを持たない場合、外部データフェッチが無いためReduxやサーバーステート管理ライブラリ（TanStack Query等）は過剰でZustandのみで十分なことが多い。バックエンドAPIを持つ場合、API呼び出し結果のキャッシュ・再検証が必要ならTanStack Query等の導入を検討する。UIローカルな状態（フォーム入力・モーダル開閉等）はZustandで管理する、という役割分担が目安になる。

```ts
interface AppState {
  config: Config;
  setConfig: (config: Partial<Config>) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  config: DEFAULT_CONFIG,
  setConfig: (config) =>
    set((state) => ({ config: { ...state.config, ...config } })), // ネストしたオブジェクトはセクションごとにマージする
  reset: () => set({ config: DEFAULT_CONFIG }),
}));
```

- `set()`のアクションは全てstore内に閉じ、コンポーネント側は`useAppStore((state) => state.xxx)`のセレクタ経由でのみ状態を読む
- 「値を更新すると副作用として重い処理（Canvas上のシミュレーション世界の再構築等）を再実行したい」場合を考える。対象オブジェクトの参照を毎回作り直す（上記の`config`のように新しいオブジェクトを返す）。これにより、`useEffect`の依存配列にそのオブジェクトを含めるだけで自然に再実行させられる
- 「同じ値でも強制的に再実行したい」（例: 一時停止中の状態を初期位置へ戻して再開する）場合を考える。単調増加するトークン値（例: `runToken: number`）をstateに持たせる。インクリメントすることを専用アクションにする。`useEffect`の依存配列へこのトークンを含めれば、値そのものは使わずとも「変化したら再構築する」トリガーとして機能する

## テスト戦略

### PlaywrightでのBootstrap CDN読み込み実画面検証（Claude Codeサンドボックス環境）

Claude Codeのサンドボックス実行環境では、outbound HTTPSがポリシー適用のegressプロキシを経由する構成になっている。組織ポリシーにより`cdn.jsdelivr.net`等の一部CDNホストへの接続が拒否される（`CONNECT`が403で拒否される）ことがある。この状態でPlaywright等により`index.html`のBootstrap CDN `<link>`を含むページを実際にブラウザで開いても問題が見えにくい。CDNリクエストが失敗するだけでコンソールエラー以外の分かりやすい兆候が出ない。そのため「Bootstrapが読み込まれず素のHTML要素が描画されているだけ」の状態を「Bootstrapスタイルが適用された状態」と誤認しやすい。実際にこの誤認がexamination#309（family-create）で発生し、CDNが到達不能なままの状態を「スクリーンショットで見た目を確認済み」と誤って報告してしまった。

同じポリシーでも`registry.npmjs.org`は多くの場合noProxy（直接到達可能）対象に含まれる。視覚検証だけが目的であれば、検証対象と同じバージョンのBootstrapを`npm install bootstrap@<version>`で取得する。Playwrightの`page.route()`でCDNのURLパターンをインターセプトする。ローカルの`dist/css/bootstrap.min.css`の内容を返すことで、実際のBootstrap CSSを使った検証ができる。ただし本番のCDN到達性そのものはこの方法では検証できない点に注意する（CDN到達性は既存プロダクト（`bamiyanapp/kingyo`等）での実績を根拠とする）。

```js
const bootstrapCss = fs.readFileSync("node_modules/bootstrap/dist/css/bootstrap.min.css", "utf-8");
await page.route("**/bootstrap@5.3.8/dist/css/bootstrap.min.css", (route) =>
  route.fulfill({ status: 200, contentType: "text/css", body: bootstrapCss })
);
```

見た目の確認をPlaywrightで行う際は、必ずスクリーンショット取得前に対象CSSリクエストの成否を確認する。実際に200で成功しているか（`page.on("response", ...)`等で）確認してから「確認済み」と報告する。

### Canvas・物理演算等、jsdomで再現できない描画のモック

jsdomはCanvasの2Dコンテキストを提供しない。Matter.js等の物理演算エンジンやCanvas描画を伴うコンポーネントは、上位のレイアウトテストではモックに差し替え、UI要素の存在・操作のみを検証する。

```tsx
vi.mock("./components/PhysicsCanvas", () => ({
  PhysicsCanvas: () => <div data-testid="physics-canvas-stub" />,
}));
```

Canvas内部のロジック自体（物理演算の計算式、座標変換等）は、Canvas/DOMに依存しない純粋関数へ切り出す。その関数を単体テストする（Reactコンポーネント側は「純粋関数の戻り値をCanvasへ描画するだけ」の薄い層に保つ）。

### カバレッジ閾値運用

`coverage_threshold`（`reusable-ci.yml`の`packages`要素）を有効にする場合を考える。`package.json`の`test`スクリプト自体がjson-summaryレポートを出力する必要がある。`packages`構成のCIは`npm test --if-present`をそのまま実行するのみで、`--coverage`オプションを付与しない。

```json
{
  "scripts": {
    "test": "vitest run --coverage --coverage.reporter=text --coverage.reporter=json-summary"
  }
}
```

閾値は実測値（`npm test`実行時の各指標）のうち最も低いものに、多少の余裕を持たせた値から始める。

### `userEvent`のClipboardスタブに関する落とし穴

クリップボードコピー機能をテストする際、`navigator.clipboard`を`Object.defineProperty`で手動モックしても効果が無いことがある。`@testing-library/user-event`の`userEvent.setup()`が独自のClipboard実装（EventTargetベースの疑似実装）を後から設定する。そのため、手動モックが上書きされて呼ばれない。

```ts
// ✗ 動かない: userEvent.setup()が後からnavigator.clipboardを上書きする
Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn() } });
const user = userEvent.setup();

// ✓ userEvent自身が提供する擬似Clipboardをそのまま使い、実際に書き込まれた内容を読み戻して検証する
const user = userEvent.setup();
await user.click(copyButton);
const copiedText = await navigator.clipboard.readText();
expect(copiedText).toBe(expectedUrl);
```

### Node.js 22+の`localStorage`グローバルがjsdomの実装を覆ってしまう落とし穴

Node.js 22以降はフラグなしで`localStorage`グローバルを提供する。しかし`--localstorage-file`（ファイルへの永続化先）を指定しない場合を考える。この組み込み`localStorage`は`getItem`/`setItem`が機能しない状態のままである。それがjsdomが提供する動作するはずの`localStorage`実装を上書きしてしまう。`localStorage`を使うコンポーネント・hookのテストが、値の永続化を検証する箇所で原因不明に失敗する場合はこれを疑う。

`setupTests.js`（vitestの`setupFiles`）で、`setItem`が関数でない場合にのみメモリ実装を補完する。

```js
// Node 22+ がフラグなしの `localStorage` グローバルを提供するが、
// `--localstorage-file` 未指定だと getItem/setItem が機能せず jsdom の実装を覆ってしまう。
// テスト用にメモリ上で動作する localStorage を明示的に補完する。
if (typeof globalThis.localStorage?.setItem !== 'function') {
  class MemoryStorage {
    constructor() {
      this.store = new Map();
    }
    getItem(key) {
      return this.store.has(key) ? this.store.get(key) : null;
    }
    setItem(key, value) {
      this.store.set(key, String(value));
    }
    removeItem(key) {
      this.store.delete(key);
    }
    clear() {
      this.store.clear();
    }
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
  });
}
```

jsdom v30とNode 20の非互換（前述の`node_version`節参照）とは別種だが、同じ「Node.jsバージョンとjsdomの相互作用」に起因する既知の落とし穴がある。CIで`localStorage`関連のテストのみ不可解に失敗する場合は、まずNode.jsのバージョン・この補完コードの有無を確認する。

なお、CI実行はローカルより遅くなることがあり、`waitFor`系のデフォルトタイムアウト（1000ms）では音声再生・アニメーション待ちを伴うテストがまれにタイムアウトすることがある。同じ`setupTests.js`で`@testing-library/react`の`configure({ asyncUtilTimeout: 3000 })`により底上げしておくと安定する。

## lint

ESLintを標準とする（`docs/code-quality-conventions.md`「lint」参照）。`typescript-eslint`の推奨設定に複数のルールを組み合わせる。React Hooksのルール違反検知（`eslint-plugin-react-hooks`）・循環的複雑度（`complexity`ルール）である。加えて`eslint-plugin-sonarjs`・未使用変数の検知（`no-unused-vars`）も組み合わせる。ファイルサイズの検知（`max-lines`ルール）もあわせて組み合わせる。

```js
// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import sonarjs from "eslint-plugin-sonarjs";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, sonarjs.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      complexity: ["error", 15],
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
    },
  },
);
```

`lint`スクリプトは`eslint . --max-warnings 0`のように、警告を許容しない運用にする。

## CI/CDの構成例

```yaml
# .github/workflows/ci.yml
jobs:
  ci:
    uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@vX.Y.Z
    with:
      packages: '[{"dir":"frontend","build":true,"coverage_threshold":70,"node_version":22}]'
      enable_standards_check: true
      enable_duplication_check: true
      skip_verification_on_push: true # squash merge運用＋up-to-date required設定が前提（docs/cicd-pipeline-specification.md参照）
    secrets:
      BOT_TOKEN: ${{ secrets.BOT_TOKEN }}
```

`node_version`は既定20だが、依存パッケージ（jsdom v30等）がNode.js組み込みの新しいAPIを要求する場合はエラーになる。例えばjsdom v30は`webidl.util.markAsUncloneable`というNode.js 22以降のundiciで提供されるAPIに依存している。Node.js 20では`TypeError: webidl.util.markAsUncloneable is not a function`でテストがクラッシュする。依存パッケージの更新でCIが原因不明にcrashした場合、まずNode.jsバージョンとの相性を疑うこと。

## PWA・共有UIコンポーネント導入時の注意点

`shared/pwa/`（`docs/service-worker-update-pattern.md`）をTypeScriptプロジェクトへsymlink共有する場合を考える。`shared/ui/`（`docs/shared-ui-components.md`）も同様である。いずれもプレーンなJSXのため以下の対応が必要になる。

1. **`tsconfig.app.json`に`allowJs: true`を追加する**。symlinkされた`.jsx`ファイルをTypeScript側の型検査対象に含めなくても（`checkJs`は既定false）import解決自体はできるようにする必要がある
2. **`vite.config.ts`に`resolve.preserveSymlinks: true`を追加する**。symlink共有されたコンポーネントが`react`等のnpmパッケージをimportする場合を考える。Viteは既定でsymlinkの実体パス（`dev-standards/`配下）を起点に`node_modules`を探索してしまう。そのため、利用側にインストール済みのパッケージを解決できずビルドエラーになる
3. **`ServiceWorkerRegistration.jsx`はサブパス配信では`symlink`のまま使えない**。`register("/sw.js")`が絶対パス固定のため、サイトルート以外のサブパス配下に配信している場合は実際に配信されるURLと一致しない。`import.meta.env.BASE_URL`を使うよう修正したコピー（`.tsx`化し、専用テストを付けると良い）を個別管理すること（サイトルート配信の場合は対応不要）
4. **daisyUI固有のクラス名（`toast`/`modal`等）を使う共有コンポーネントを流用する場合、Bootstrap環境ではそのままでは無スタイルになりうる**。Bootstrap前提の場合は`shared/ui/bootstrap-theme.css`（`docs/shared-ui-components.md`）を導入する。それでも足りない配色は`App.css`等へ対象クラス名のみを狭くスコープして追加で補う

## npm workspacesでバックエンドと組み合わせる場合

独自バックエンドAPI（`docs/standard-tech-stack.md`「3. バックエンドAPI」参照）が必要な場合を考える。`frontend/`を単独パッケージではなくnpm workspacesの一部として構成する。

- ルートpackage.jsonへ`workspaces: ["frontend", "backend"]`を追加する。ルート直下の`package-lock.json`1本で両ワークスペースの依存を一括管理する
- `reusable-ci.yml`・`reusable-cd.yml`は`packages`入力ではなく`workspaces: true`入力を使う。`frontend_dir`/`backend_dir`が既定の`frontend`/`backend`のままなら追加指定は不要である。詳細は`docs/cicd-pipeline-specification.md`を参照
- `.nvmrc`でNode.jsバージョンをバックエンドのLambdaランタイムと統一する（frontend・backend・CI・CDの4箇所すべてで同じバージョンを指定する）
- ディレクトリ構成: `views/`＝画面単位のコンポーネント、`components/`＝画面内で再利用する部品、`hooks/`＝状態・副作用ロジック、`utils/`＝純関数。テストは実装と同じディレクトリに`*.test.tsx`/`*.test.ts`を併置する
- **E2Eテスト（Playwright）はモックを作らず、実際にデプロイ済みのバックエンドAPIへ直結して実行する**。外部要因（バックエンドのコールドスタート等）に起因する既知のflakyへの対応は`docs/serverless-spa-pattern.md`「CI/CD連携」参照
- バックエンドAPI自体の構成（OSLS/AWS SAM・API Gateway・DynamoDB等）は対象外とする。詳細は`docs/standard-tech-stack.md`「3. バックエンドAPI」の該当パターンを参照する

## 新規プロジェクトでの始め方

1. `docs/standard-tech-stack.md`の手順1（dev-standards取り込み）を実施する
2. Viteで`npm create vite@latest frontend -- --template react-ts`を実行する。上記の`tsconfig`・`vite.config.ts`（`preserveSymlinks`は後で必要になったら追加）・`eslint.config.js`を整える。バックエンドと組み合わせる場合は上記「npm workspacesでバックエンドと組み合わせる場合」に沿ってworkspaces構成にする
3. `vitest`・`@testing-library/react`・`@testing-library/jest-dom`を導入する。`@testing-library/user-event`・`@vitest/coverage-v8`・`jsdom`も導入する。上記のテスト戦略に沿ってセットアップする
4. 状態管理が必要なら`zustand`を導入し、上記のstore設計パターンに沿う
5. 上記の「CI/CDの構成例」に沿って`.github/workflows/ci.yml`・`cd.yml`を用意する。ホスティングは`docs/static-hosting-pattern.md`に沿ってS3 + CloudFrontを構築する
6. PWA対応・共有UIコンポーネントが必要になったら「PWA・共有UIコンポーネント導入時の注意点」を参照する
