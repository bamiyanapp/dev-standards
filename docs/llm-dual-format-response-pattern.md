# LLM APIのdual-format JSON応答生成と、緩いJSONパース救済

Gemini・OpenAI等のLLM APIをチャット的な機能に統合する際の2つの設計判断をまとめる。examinationの`infra/bot-stack/functions/geminiConversation.js`（LINE bot・音声対話ページ共通の会話ロジック）で確立したパターン。コードの共有ではなく設計判断の共有が目的。

## パターン1: 1回の呼び出しで複数フォーマットを同時生成させる

同じ内容を複数のチャネル・UIで異なる形式で使いたい場合（例: 音声で読み上げる簡潔な話し言葉と、チャット画面に表示する詳しい文章）、チャネルごとに別々のLLM呼び出しをすると、課金・レート制限（`docs/daily-rate-limit-pattern.md`参照）を追加で消費してしまう。

代わりに、システムプロンプトで「必ず両フォーマットを含むJSON形式のみを出力せよ」と指示し、1回の呼び出しで両方を生成させる。

```js
function buildSystemPrompt({ /* ... */ }) {
  return (
    "..." +
    "出力は必ず次のJSON形式のみとし、他の文章を含めないでください。\n" +
    '{"voice": "音声で読み上げる自然な話し言葉。記号や箇条書きは使わず簡潔に。", ' +
    '"text": "チャットで読む用の詳しい内容。模範解答や改善ポイントを具体的に含めてよい。"}'
  );
}
```

呼び出し側は用途に応じて`voice`・`text`のどちらかを選んで使う。次ターンへの入力コンテキスト（会話履歴）にどちらを記録するかも、情報量が多い方（`text`）に統一する等、用途に応じて決める。

同様のパターンは、会話の振り返り（サマリー生成）と既存データとの照合を1回の呼び出しに統合する場合にも使える（`{"summary": "...", "questions": [...]}`のように、要約と構造化データを同時に出力させる）。

## パターン2: LLMの緩いJSON出力を救済してパースする

LLMは指示通りの厳密なJSONを返すとは限らない。特に、複数文にまたがる長い文字列値を含む場合、JSON文字列リテラル内であるべき改行を`\n`にエスケープせず生の改行文字のまま出力することがあり、通常の`JSON.parse`は`Unexpected token`で失敗する。

```js
// フィードバック＋次の質問という複数文を1つのJSON文字列値に収めると、LLMが
// 段落区切りとして「\n」ではなく生の改行文字をそのまま出力することがあり、
// 通常のJSON.parseでは失敗する。文字列リテラル内にいる間だけ改行等の制御文字を
// エスケープしてから渡すことで、この頻発するケースを救う
function escapeControlCharsInJsonStrings(raw) {
  let result = "";
  let inString = false;
  let escapedNext = false;
  for (const ch of raw) {
    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      continue;
    }
    if (escapedNext) {
      result += ch;
      escapedNext = false;
    } else if (ch === "\\") {
      result += ch;
      escapedNext = true;
    } else if (ch === '"') {
      inString = false;
      result += ch;
    } else if (ch === "\n" || ch === "\r" || ch === "\t") {
      result += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : "\\t";
    } else {
      result += ch;
    }
  }
  return result;
}

function parseReply(rawText) {
  try {
    // 前後に説明文が付くことがあるため、最初の{から最後の}までを抽出してから
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const jsonText = escapeControlCharsInJsonStrings(jsonMatch ? jsonMatch[0] : rawText);
    return JSON.parse(jsonText);
  } catch {
    // 完全に壊れている場合は生テキストへフォールバックする（呼び出し側の
    // 用途に応じて全フィールドへ同じ値を入れる等）
    return { voice: rawText, text: rawText };
  }
}
```

- 文字列リテラルの外側（構造上のJSON区切り文字）は変更せず、リテラル内の制御文字だけをエスケープするため、正しいJSONを壊すことはない
- それでもパースできない場合（LLMがJSON自体を返さなかった等）は、生テキストへフォールバックし機能全体を止めない設計にする（構造化データの取得に失敗しても、ユーザーへの応答自体は返す）

## 設計上の要点

- どちらのパターンも「LLMの出力は構造化を指示しても100%守られるとは限らない」という前提に立つ。厳密なスキーマ検証（JSON Schema等）で弾いて再試行させる設計も可能だが、追加のAPI呼び出し（＝追加コスト）を避けたい小規模プロダクトでは、緩いパース＋フォールバックの方が費用対効果が良い
- パターン1（dual-format）は、フォーマットの数を増やすほどプロンプトが複雑になりLLMの指示追従精度が下がるため、本当に必要な最小限のフォーマット数に留める

## 実例

examination `infra/bot-stack/functions/geminiConversation.js`の`buildSystemPrompt`/`parseDualReply`（パターン1・2）、`buildSummaryPrompt`/`parseReconciliationReply`（要約と構造化データの同時生成、パターン1の応用）。
