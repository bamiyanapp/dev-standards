import { JSDOM } from "jsdom";

// Node標準のテストランナー（node:test）はブラウザ環境を持たないため、
// @testing-library/reactのrenderHookが要求するdocument等のグローバルを
// jsdomで明示的に用意する。各テストファイルの先頭でimportすること。
const dom = new JSDOM("", { url: "http://localhost/" });

// Node自体が`navigator`等を読み取り専用のgetterとしてグローバルに
// 定義済みのため、単純な代入ではなくdefinePropertyで上書きする
const defineGlobal = (name, value) =>
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

defineGlobal("window", dom.window);
defineGlobal("document", dom.window.document);
defineGlobal("navigator", dom.window.navigator);
defineGlobal("localStorage", dom.window.localStorage);
defineGlobal("sessionStorage", dom.window.sessionStorage);
defineGlobal("Event", dom.window.Event);
