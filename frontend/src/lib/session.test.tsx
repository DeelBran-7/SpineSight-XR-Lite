// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "./session";
import type { PostureAnalysisResponse, ReportResponse } from "./api";

const requests = vi.hoisted(() => ({ clear: vi.fn(), report: vi.fn(), assistant: vi.fn() }));
vi.mock("./api", () => ({ clearAPIRequests: requests.clear, CHAT_MESSAGE_LIMIT: 1200, api: { report: requests.report, assistant: requests.assistant } }));
let root: Root;
let session: ReturnType<typeof useSession>;
const photo = new File(["still"], "back.jpg", { type: "image/jpeg" });
const analysis = { analysis_id: "one" } as PostureAnalysisResponse;
const report = { simple_summary: "Summary" } as ReportResponse["report"];
function Probe() { session = useSession(); return null; }
function View({ page = "report" }: { page?: string }) { return <StrictMode><SessionProvider><Probe key={page} /></SessionProvider></StrictMode>; }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  requests.clear.mockReset(); requests.report.mockReset(); requests.assistant.mockReset();
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<View />));
});
afterEach(async () => { await act(async () => root.unmount()); });

it("rejects old-session writes even before React commits the new observation", async () => {
  const oldId = session.id;
  await act(async () => {
    session.setPhoto(photo, oldId);
    session.setAnalysis(analysis, oldId);
    session.clearObservation();
    session.setReport(report, oldId);
    session.addExchange([{ role: "assistant", content: "Old reply" }], oldId);
    session.setPhoto(photo, oldId);
  });
  expect(session.id).toBe(oldId + 1);
  expect(session.photo).toBeNull();
  expect(session.analysis).toBeNull();
  expect(session.report).toBeNull();
  expect(session.messages).toEqual([]);
});

it("reopens an expired photo under a new session without its old report or chat", async () => {
  const oldId = session.id;
  await act(async () => {
    session.consent();
    session.setPhoto(photo, oldId);
    session.setAnalysis(analysis, oldId);
    session.setReport(report, oldId);
    session.addExchange([{ role: "user", content: "Old question" }], oldId);
  });
  const clears = requests.clear.mock.calls.length;
  await act(async () => session.reopenPhoto());
  expect(session.id).toBe(oldId + 1);
  expect(session.photo).toBe(photo);
  expect(session.consented).toBe(true);
  expect(session.analysis).toBeNull();
  expect(session.report).toBeNull();
  expect(session.messages).toEqual([]);
  expect(requests.clear).toHaveBeenCalledTimes(clears + 1);
});

it("keeps consecutive exchanges and discards general chat when a photo is selected", async () => {
  await act(async () => {
    session.addExchange([{ role: "user", content: "First" }], session.id);
    session.addExchange([{ role: "assistant", content: "Second" }], session.id);
  });
  expect(session.messages.map(({ content }) => content)).toEqual(["First", "Second"]);
  await act(async () => session.setPhoto(photo, session.id));
  expect(session.messages).toEqual([]);
});

it("commits one paid report after the initiating page unmounts", async () => {
  let finish!: (result: { report: typeof report }) => void;
  requests.report.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await act(async () => { session.setPhoto(photo, session.id); session.setAnalysis(analysis, session.id); });
  await act(async () => { void session.requestReport(); void session.requestReport(); });
  expect(session.reportPending).toBe(true);
  await act(async () => root.render(<View page="other" />));
  await act(async () => finish({ report }));
  expect(session.report).toBe(report);
  expect(session.reportPending).toBe(false);
  await act(async () => session.requestReport());
  expect(requests.report).toHaveBeenCalledOnce();
});

it("keeps the pending chat message across pages and appends its exchange exactly once", async () => {
  let finish!: (result: { reply: string }) => void;
  requests.assistant.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await act(async () => { void session.sendQuestion("Setup?"); void session.sendQuestion("Setup?"); });
  expect(session.chatRequest).toMatchObject({ message: "Setup?", pending: true });
  await act(async () => root.render(<View page="capture" />));
  await act(async () => finish({ reply: "Use a stable stand." }));
  expect(session.messages).toEqual([{ role: "user", content: "Setup?" }, { role: "assistant", content: "Use a stable stand." }]);
  expect(session.chatRequest).toBeNull();
  expect(requests.assistant).toHaveBeenCalledOnce();
});

it("ignores late chat success after the same session attaches a new photo", async () => {
  let finish!: (result: { reply: string }) => void;
  requests.assistant.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await act(async () => { void session.sendQuestion("Setup?"); });
  await act(async () => session.setPhoto(photo, session.id));
  await act(async () => finish({ reply: "Old reply" }));
  expect(session.messages).toEqual([]);
  expect(session.chatRequest).toBeNull();
});

it("keeps a failed question available for explicit retry and never retries automatically", async () => {
  const error = new Error("Offline");
  requests.assistant.mockRejectedValue(error);
  await act(async () => session.sendQuestion("Setup?"));
  await act(async () => root.render(<View page="return" />));
  expect(session.chatRequest).toEqual({ message: "Setup?", pending: false, error });
  expect(session.messages).toEqual([]);
  expect(requests.assistant).toHaveBeenCalledOnce();
});
