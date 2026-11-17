import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import BackendCacheWarmer from "./BackendCacheWarmer.jsx";

beforeEach(() => {
  sessionStorage.clear();
  globalThis.fetch = vi.fn().mockResolvedValue({});
});
afterEach(cleanup);

describe("BackendCacheWarmer", () => {
  it("全エンドポイントを認証なしで先読みし、フラグを立てる", async () => {
    render(<BackendCacheWarmer endpoints={["/a", "/b"]} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenCalledWith("/a", undefined);
    expect(sessionStorage.getItem("backend-cache-warmed")).toBe("1");
  });

  it("トークンがあればBearerヘッダーを付ける", async () => {
    render(<BackendCacheWarmer endpoints={["/a"]} getAuthToken={async () => "tok"} warmedFlagKey="k" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith("/a", { headers: { Authorization: "Bearer tok" } });
    expect(sessionStorage.getItem("k")).toBe("1");
  });

  it("同一セッションでは2回目以降は実行しない", () => {
    sessionStorage.setItem("backend-cache-warmed", "1");
    render(<BackendCacheWarmer endpoints={["/a"]} />);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetch・トークン取得の失敗は握りつぶす", async () => {
    fetch.mockRejectedValue(new Error("net"));
    render(<BackendCacheWarmer endpoints={["/a"]} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    sessionStorage.clear();
    const getAuthToken = vi.fn().mockRejectedValue(new Error("auth"));
    render(<BackendCacheWarmer endpoints={["/b"]} getAuthToken={getAuthToken} />);
    await waitFor(() => expect(getAuthToken).toHaveBeenCalled());
  });
});
