import { describe, expect, it, vi } from "vitest";

import { JevScope } from "@/clients/jevscope";

/** A fake server that records requests and answers step posts slowly, in reverse. */
function fakeServer() {
  const posted: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  let delay = 30;
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path === "/api/runs") return Response.json({ run: { id: "run_1" } }, { status: 201 });
    if (path.endsWith("/steps")) {
      // Earlier requests take longer, so any ordering bug would show.
      await new Promise((resolve) => setTimeout(resolve, (delay -= 10)));
      posted.push({ method: init!.method!, path, body });
      if (body.content === "boom") return new Response("bad", { status: 400 });
      return Response.json({ step: { id: `s${posted.length}` }, evaluation: null }, { status: 201 });
    }
    posted.push({ method: init!.method!, path, body });
    return Response.json({});
  });
  return { posted, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe("JevScope client", () => {
  it("sends background reports strictly in order and finishes after them", async () => {
    const { posted, fetchImpl } = fakeServer();
    const run = await new JevScope({ fetch: fetchImpl }).startRun({ name: "n", task: "t" });

    run.report({ eventType: "message", content: "one" });
    run.report({ eventType: "message", content: "two" });
    run.report({ eventType: "message", content: "three" });
    await run.finish();

    expect(posted.map((p) => p.body.content ?? p.body.status)).toEqual([
      "one",
      "two",
      "three",
      "completed",
    ]);
    expect(run.url).toBe("http://localhost:3000/runs/run_1");
  });

  it("routes a failed report to onError and keeps going", async () => {
    const { posted, fetchImpl } = fakeServer();
    const onError = vi.fn();
    const run = await new JevScope({ fetch: fetchImpl, onError }).startRun({ name: "n", task: "t" });

    run.report({ eventType: "message", content: "boom" });
    run.report({ eventType: "message", content: "after" });
    await run.flush();

    expect(onError).toHaveBeenCalledOnce();
    expect(posted.at(-1)?.body.content).toBe("after");
  });

  it("reports a wrapped tool without changing its result or its error", async () => {
    const { posted, fetchImpl } = fakeServer();
    const run = await new JevScope({ fetch: fetchImpl }).startRun({ name: "n", task: "t" });

    await expect(run.tool("add", { a: 1 }, () => 2)).resolves.toBe(2);
    await expect(
      run.tool("fail", {}, () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
    await run.flush();

    expect(posted.map((p) => p.body.toolResult)).toEqual([2, { error: "nope" }]);
  });

  it("shortens oversized payloads instead of letting the server reject them", async () => {
    const { posted, fetchImpl } = fakeServer();
    const run = await new JevScope({ fetch: fetchImpl }).startRun({ name: "n", task: "t" });

    const log = `start ${"x".repeat(50_000)} FINAL: 2 failed`;
    await run.step({ eventType: "test", content: "Running tests.", toolResult: log });

    const sent = posted[0].body.toolResult as string;
    expect(sent.length).toBeLessThan(20_000);
    expect(sent.startsWith("start")).toBe(true);
    expect(sent.endsWith("FINAL: 2 failed")).toBe(true);
  });
});
