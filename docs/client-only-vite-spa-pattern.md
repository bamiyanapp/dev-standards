# 単一パッケージReactアプリ構成（Vite + TypeScript + Bootstrap、`client-only-vite-spa-pattern`）

shock-lab（[bamiyanapp/shock-lab](https://github.com/bamiyanapp/shock-lab)）で検証済みの構成をベースにした、dev-standards標準のフロントエンド構成（`docs/standard-tech-stack.md`「1. フロントエンド」参照）。単一`frontend/`パッケージ（React 19 + Vite + TypeScript + Bootstrap 5.3）で、ログイン・バックエンドAPIの要否を問わず全プロダクトに適用する。

ログイン・バックエンドAPIが不要なプロダクトはそのまま`frontend/`単体で完結する。ログインが必要な場合は「2. ログイン」、独自バックエンドAPI（WebSocketによるリアルタイム双方向通信を含む）が必要な場合は「3. バックエンドAPI」の標準構成と組み合わせる。後者の場合、`frontend/`は単独パッケージではなくnpm workspacesの一部として構成する（後述「npm workspacesでバックエンドと組み合わせる場合」参照）。

## アーキテクチャ

- 単一`frontend/`パッケージ（React 19 + Vite + **TypeScript**）。バックエンドAPIを持たない場合は`reusable-ci.yml`の`packages`入力で`[{"dir":"frontend","build":true}]`のように指定する（`docs/cicd-pipeline-specification.md`参照）。バックエンドAPIと組み合わせる場合は後述「npm workspacesでバックエンドと組み合わせる場合」を参照
- **UIフレームワークはBootstrap 5.3を標準とする**。`index.html`のCDN `<link>`で読み込む（npmパッケージとして導入してもよい）。共通フォント・ダークモード対応・ボタン押下フィードバック等は`shared/ui/bootstrap-theme.css`（`docs/shared-ui-components.md`）をsymlinkして`@import`する
- **ホスティングはS3 + CloudFront**（`docs/static-hosting-pattern.md`）に統一する。バックエンドAPIの有無・ログインの有無によらずホスティング方式は変わらない
- バックエンドAPI・認証基盤を持たない場合、データはすべてクライアント側（メモリ・URLクエリパラメータ・localStorage）で完結する

## デプロイの要点

ホスティング（S3 + CloudFrontのインフラ構築・キャッシュヘッダー戦略・デプロイ手順）は`docs/static-hosting-pattern.md`を参照する。CloudFrontは独自ドメイン直下（または任意のパス）で配信できるため、GitHub Pagesのプロジェクトページのようなリポジトリ名サブパスへの対応（`vite.config.ts`の`base`調整）は基本的に不要（サイトルート配信を既定とする）。

## TypeScript構成

`tsconfig.json`をproject referencesで`tsconfig.app.json`（アプリ本体）・`tsconfig.node.json`（`vite.config.ts`自体の型検査用）へ分割する。

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

- `noUnusedLocals` / `noUnusedParameters`: 未使用変数・引数を検知する（`oxlint`と役割が重複しない範囲の型レベルチェック）
- `erasableSyntaxOnly`: TypeScript独自の実行時表現（enum等）を禁止し、型注釈が完全にコンパイル時に消去できることを強制する
- `verbatimModuleSyntax` + `moduleDetection: "force"`: import/exportの扱いをESMに厳密化する
- `moduleResolution: "bundler"`: Viteのモジュール解決に合わせる

`build`スクリプトは`tsc -b && vite build`として、型検査を先に走らせる。

## 状態管理パターン（Zustand）

バックエンドAPIを持たない場合、外部データフェッチが無いためReduxやサーバーステート管理ライブラリ（TanStack Query等）は過剰でZustandのみで十分なことが多い。バックエンドAPIを持つ場合、API呼び出し結果のキャッシュ・再検証が必要ならTanStack Query等の導入を検討し、UIローカルな状態（フォーム入力・モーダル開閉等）はZustandで管理する、という役割分担が目安になる。

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
- 「値を更新すると副作用として重い処理（Canvas上のシミュレーション世界の再構築等）を再実行したい」場合、対象オブジェクトの参照を毎回作り直す（上記の`config`のように新しいオブジェクトを返す）ことで、`useEffect`の依存配列にそのオブジェクトを含めるだけで自然に再実行させられる
- 「同じ値でも強制的に再実行したい」（例: 一時停止中の状態を初期位置へ戻して再開する）場合は、単調増加するトークン値（例: `runToken: number`）をstateに持たせ、インクリメントすることを専用アクションにする。`useEffect`の依存配列へこのトークンを含めれば、値そのものは使わずとも「変化したら再構築する」トリガーとして機能する

## テスト戦略

### Canvas・物理演算等、jsdomで再現できない描画のモック

jsdomはCanvasの2Dコンテキストを提供しない。Matter.js等の物理演算エンジンやCanvas描画を行うコンポーネントは、上位のレイアウトテストではモックに差し替え、UI要素の存在・操作のみを検証する。

```tsx
vi.mock("./components/PhysicsCanvas", () => ({
  PhysicsCanvas: () => <div data-testid="physics-canvas-stub" />,
}));
```

Canvas内部のロジック自体（物理演算の計算式、座標変換等）は、Canvas/DOMに依存しない純粋関数へ切り出し、その関数を単体テストする（Reactコンポーネント側は「純粋関数の戻り値をCanvasへ描画するだけ」の薄い層に保つ）。

### カバレッジ閾値運用

`coverage_threshold`（`reusable-ci.yml`の`packages`要素）を有効にする場合、`package.json`の`test`スクリプト自体がjson-summaryレポートを出力する必要がある（`packages`構成のCIは`npm test --if-present`をそのまま実行するのみで、`--coverage`オプションを付与しない）。

```json
{
  "scripts": {
    "test": "vitest run --coverage --coverage.reporter=text --coverage.reporter=json-summary"
  }
}
```

閾値は実測値（`npm test`実行時の各指標）のうち最も低いものに、多少の余裕を持たせた値から始める。

### `userEvent`のClipboardスタブに関する落とし穴

クリップボードコピー機能をテストする際、`navigator.clipboard`を`Object.defineProperty`で手動モックしても、`@testing-library/user-event`の`userEvent.setup()`が独自のClipboard実装（EventTargetベースの疑似実装）を後から設定するため、手動モックが上書きされて呼ばれない。

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

## lint

`oxlint`は設定ファイルが小さく高速。React Hooksのルール違反検知は明示的に有効化する。

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

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

`node_version`は既定20だが、依存パッケージ（jsdom v30等）がNode.js組み込みの新しいAPIを要求する場合はエラーになる（例: jsdom v30は`webidl.util.markAsUncloneable`というNode.js 22以降のundiciで提供されるAPIに依存しており、Node.js 20では`TypeError: webidl.util.markAsUncloneable is not a function`でテストがクラッシュする）。依存パッケージの更新でCIが原因不明にcrashした場合、まずNode.jsバージョンとの相性を疑うこと。

## PWA・共有UIコンポーネント導入時の注意点

`shared/pwa/`（`docs/service-worker-update-pattern.md`）・`shared/ui/`（`docs/shared-ui-components.md`）をTypeScriptプロジェクトへsymlink共有する場合、いずれもプレーンなJSXのため以下の対応が必要になる。

1. **`tsconfig.app.json`に`allowJs: true`を追加する**。symlinkされた`.jsx`ファイルをTypeScript側の型検査対象に含めなくても（`checkJs`は既定false）import解決自体はできるようにする必要がある
2. **`vite.config.ts`に`resolve.preserveSymlinks: true`を追加する**。symlink共有されたコンポーネントが`react`等のnpmパッケージをimportする場合、Viteは既定でsymlinkの実体パス（`dev-standards/`配下）を起点に`node_modules`を探索してしまい、利用側にインストール済みのパッケージを解決できずビルドエラーになる
3. **`ServiceWorkerRegistration.jsx`はサブパス配信では`symlink`のまま使えない**。`register("/sw.js")`が絶対パス固定のため、サイトルート以外のサブパス配下に配信している場合は実際に配信されるURLと一致しない。`import.meta.env.BASE_URL`を使うよう修正したコピー（`.tsx`化し、専用テストを付けると良い）を個別管理すること（サイトルート配信の場合は対応不要）
4. **daisyUI固有のクラス名（`toast`/`modal`等）を使う共有コンポーネントを流用する場合、Bootstrap環境ではそのままでは無スタイルになりうる**。Bootstrap前提の場合は`shared/ui/bootstrap-theme.css`（`docs/shared-ui-components.md`）を導入し、それでも足りない配色は`App.css`等へ対象クラス名のみを狭くスコープして追加で補う

## npm workspacesでバックエンドと組み合わせる場合

独自バックエンドAPI（`docs/standard-tech-stack.md`「3. バックエンドAPI」参照）が必要な場合、`frontend/`を単独パッケージではなくnpm workspacesの一部として構成する。

- ルートpackage.jsonへ`workspaces: ["frontend", "backend"]`を追加する。ルート直下の`package-lock.json`1本で両ワークスペースの依存を一括管理する
- `reusable-ci.yml`・`reusable-cd.yml`は`packages`入力ではなく`workspaces: true`入力を使う（`frontend_dir`/`backend_dir`が既定の`frontend`/`backend`のままなら追加指定不要。`docs/cicd-pipeline-specification.md`参照）
- `.nvmrc`でNode.jsバージョンをバックエンドのLambdaランタイムと統一する（frontend・backend・CI・CDの4箇所すべてで同じバージョンを指定する）
- ディレクトリ構成: `views/`＝画面単位のコンポーネント、`components/`＝画面内で再利用する部品、`hooks/`＝状態・副作用ロジック、`utils/`＝純関数。テストは実装と同じディレクトリに`*.test.tsx`/`*.test.ts`を併置する
- **E2Eテスト（Playwright）はモックを作らず、実際にデプロイ済みのバックエンドAPIへ直結して実行する**。外部要因（バックエンドのコールドスタート等）に起因する既知のflakyへの対応は`docs/serverless-spa-pattern.md`「CI/CD連携」参照
- バックエンドAPI自体の構成（OSLS/AWS SAM・API Gateway・DynamoDB等）は`docs/standard-tech-stack.md`「3. バックエンドAPI」の該当パターンを参照する

## 新規プロジェクトでの始め方

1. `docs/standard-tech-stack.md`の手順1（dev-standards取り込み）を実施する
2. Viteで`npm create vite@latest frontend -- --template react-ts`を実行し、上記の`tsconfig`・`vite.config.ts`（`preserveSymlinks`は後で必要になったら追加）・`.oxlintrc.json`を整える。バックエンドと組み合わせる場合は上記「npm workspacesでバックエンドと組み合わせる場合」に沿ってworkspaces構成にする
3. `vitest`・`@testing-library/react`・`@testing-library/jest-dom`・`@testing-library/user-event`・`@vitest/coverage-v8`・`jsdom`を導入し、上記のテスト戦略に沿ってセットアップする
4. 状態管理が必要なら`zustand`を導入し、上記のstore設計パターンに沿う
5. 上記の「CI/CDの構成例」に沿って`.github/workflows/ci.yml`・`cd.yml`を用意する。ホスティングは`docs/static-hosting-pattern.md`に沿ってS3 + CloudFrontを構築する
6. PWA対応・共有UIコンポーネントが必要になったら「PWA・共有UIコンポーネント導入時の注意点」を参照する
