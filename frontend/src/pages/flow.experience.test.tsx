import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError, type ChatMessage, type PostureAnalysisResponse } from "@/lib/api";
import { analysisQuestions, describeLevel, explainOffset, findPreviousAnswer } from "@/lib/observations";
import type { useSession } from "@/lib/session";
import { Layout } from "@/components/Layout";
import { AssistantPage } from "./Assistant";
import { HomePage } from "./Overview";
import { ResultsPage } from "./Results";

const state = vi.hoisted(() => ({ current: {} as ReturnType<typeof useSession> }));
vi.mock("@/lib/session", () => ({ useSession: () => state.current }));

const analysis: PostureAnalysisResponse = {
  success: true,
  analysis_id: "test-analysis",
  image: { width: 600, height: 900 },
  landmarks: {
    left_shoulder: { x: .3, y: .3, visibility: .96 },
    right_shoulder: { x: .7, y: .32, visibility: .96 },
    left_hip: { x: .35, y: .6, visibility: .96 },
    right_hip: { x: .65, y: .6, visibility: .96 },
  },
  measurements: { shoulder_asymmetry_percent: 7.5, shoulder_angle_deg: 4.29, hip_asymmetry_percent: 0, hip_angle_deg: 0, torso_lean_angle_deg: 0 },
  quality: { valid: true, message: "All four required landmarks meet the visibility threshold.", landmark_visibility_threshold: .6 },
  observations: {
    shoulder: { status: "visible_vertical_offset", direction: "left_landmark_higher_in_image" },
    hip: { status: "no_vertical_offset", direction: "aligned_with_image_horizontal" },
    torso: { status: "no_lateral_offset", direction: "no_lateral_offset" },
  },
};

beforeEach(() => {
  state.current = {
    id: 1, consented: true, photo: null, analysis: null, report: null, messages: [], reportPending: false, reportError: null, chatRequest: null,
    consent: vi.fn(), clearObservation: vi.fn(), reopenPhoto: vi.fn(), setPhoto: vi.fn(),
    setAnalysis: vi.fn(), setReport: vi.fn(), addExchange: vi.fn(), requestReport: vi.fn(), sendQuestion: vi.fn(),
  };
});

function render(element: React.ReactNode, pathname = "/", question?: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[{ pathname, state: question ? { question } : undefined }]}>{element}</MemoryRouter>);
}

describe("measurement explanations", () => {
  it("explains percentages as image geometry rather than percentages of a body or health score", () => {
    expect(explainOffset(7.5)).toBe("7.5 units of height difference for every 100 units of horizontal distance between the points.");
    expect(explainOffset(120.125)).toContain("120.13 units");
    expect(explainOffset(0)).toContain("0 units of height difference");
    expect(describeLevel("left_landmark_higher_in_image")).toContain("model’s left landmark");
  });

  it("keeps the coordinate and health limits visible without requiring an AI report", () => {
    state.current.analysis = analysis;
    const html = render(<ResultsPage />, "/results");
    expect(html).toContain("7.5 units of height difference");
    expect(html).toContain("not your health");
    expect(html).toContain("It does not trace the spine");
    expect(html).toContain("Left and right follow the model");
    expect(html).toContain("Landmarks ready for measurement");
    expect(html).not.toContain("Landmark quality passed");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Landmark coordinates; scroll horizontally if needed"');
    expect(html).toContain("Generate AI summary");
  });
});

describe("resuming the current observation", () => {
  it("offers the current results without clearing them just by opening home", () => {
    state.current.analysis = analysis;
    const html = render(<HomePage />);
    expect(html).toContain('href="/results"');
    expect(html).toContain("View current results");
    expect(html).toContain("Start a new observation");
    expect(state.current.clearObservation).not.toHaveBeenCalled();
  });

  it("offers the still photo when analysis has not started", () => {
    state.current.photo = new File(["fixture"], "fixture.jpg", { type: "image/jpeg" });
    const html = render(<HomePage />);
    expect(html).toContain('href="/preview"');
    expect(html).toContain("Continue with your photo");
  });

  it("identifies the current navigation page for assistive technology", () => {
    const html = render(<Layout />, "/assistant");
    expect(html).toMatch(/class="nav-assistant" aria-current="page"/);
  });
});

describe("existing suggested answers", () => {
  it("finds the most recent completed adjacent answer, ignoring unfinished questions", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: " What can affect these measurements? " },
      { role: "assistant", content: "The camera." },
      { role: "user", content: "What can affect these measurements?" },
      { role: "assistant", content: "Camera position and rotation." },
      { role: "user", content: "What can affect these measurements?" },
    ];
    expect(findPreviousAnswer(messages, "WHAT CAN AFFECT THESE MEASUREMENTS?")).toBe(3);
    expect(findPreviousAnswer(messages, "How should I stand?")).toBeNull();
    expect(findPreviousAnswer(messages, " ")).toBeNull();
    expect(findPreviousAnswer([{ role: "user", content: "Question" }, { role: "assistant", content: " " }], "Question")).toBeNull();
  });

  it("opens an already answered report question with a visible option to ask again", () => {
    state.current.analysis = analysis;
    state.current.messages = [{ role: "user", content: analysisQuestions[0] }, { role: "assistant", content: "Existing explanation of the shoulder points." }];
    const html = render(<AssistantPage />, "/assistant", analysisQuestions[0]);
    expect(html).toContain("Showing the existing answer");
    expect(html).toContain("No new AI request was sent");
    expect(html).toContain("Ask again");
    expect(html).toContain("Read existing answer");
    expect(html).toContain("chat-highlighted");
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
  });

  it("prefills an unanswered suggestion for explicit sending and exposes mobile composition help", () => {
    state.current.analysis = analysis;
    const html = render(<AssistantPage />, "/assistant", analysisQuestions[1]);
    expect(html).toContain(`>${analysisQuestions[1]}</textarea>`);
    expect(html).toContain('enterKeyHint="enter"');
    expect(html).toContain("Enter adds a line");
    expect(html).toContain('aria-describedby="message-help message-privacy"');
    expect(html).toContain("1,200");
    expect(html).not.toContain("No new AI request was sent");
  });

  it("keeps the assistant useful without an attached observation", () => {
    const html = render(<AssistantPage />, "/assistant");
    expect(html).toContain("No observation attached");
    expect(html).toContain("Ask general questions about capture");
    expect(html).not.toContain("View results");
    expect(html).toContain("Chat clears when this tab is refreshed");
  });
});

describe("returning to an in-progress session", () => {
  it("shows a report still being prepared after returning to results", () => {
    state.current.analysis = analysis;
    state.current.reportPending = true;
    const html = render(<ResultsPage />, "/results");
    expect(html).toContain("Generating summary");
    expect(html).toContain('aria-busy="true"');
    expect(state.current.requestReport).not.toHaveBeenCalled();
  });

  it("shows a completed report immediately without offering another request", () => {
    state.current.analysis = analysis;
    state.current.report = {
      simple_summary: "The current photo has a visible shoulder height difference.",
      technical_summary: "The offset is based on backend image coordinates.",
      findings: { shoulder: "Shoulder points differ in height.", hip: "Hip points share a height.", torso: "The midpoints share an image vertical." },
      limitations: ["Camera angle affects the image."],
      disclaimer: "An educational image observation.",
    };
    const html = render(<ResultsPage />, "/results");
    expect(html).toContain(state.current.report.simple_summary);
    expect(html).not.toContain("Generate AI summary");
    expect(state.current.requestReport).not.toHaveBeenCalled();
  });

  it("keeps an in-flight chat question visible while leaving the next draft editable", () => {
    state.current.chatRequest = { message: "Explain the camera setup", pending: true, error: null };
    const html = render(<AssistantPage />, "/assistant");
    expect(html).toContain("Explain the camera setup");
    expect(html).toContain("Assistant is responding");
    expect(html).toContain("Draft your next question");
    expect(html).not.toMatch(/<textarea[^>]*disabled/);
    expect(html).toMatch(/aria-label="Send question" disabled/);
    expect(state.current.sendQuestion).not.toHaveBeenCalled();
  });

  it("recovers an expired report by reviewing the same photo", () => {
    state.current.analysis = analysis;
    state.current.reportError = new APIError("ANALYSIS_SESSION_EXPIRED", "The observation expired.", 404);
    const html = render(<ResultsPage />, "/results");
    expect(html).toContain("Your photo is still in this tab");
    expect(html).toContain("Review and reanalyze photo");
    expect(html).toMatch(/href="\/preview"[^>]*>Review and reanalyze photo/);
    expect(state.current.reopenPhoto).not.toHaveBeenCalled();
  });

  it("carries a known expiry from the report into chat without making another request", () => {
    state.current.analysis = analysis;
    state.current.reportError = new APIError("ANALYSIS_SESSION_EXPIRED", "The observation expired.", 404);
    const html = render(<AssistantPage />, "/assistant");
    expect(html).toContain("Observation access expired");
    expect(html).toContain("Review and reanalyze photo");
    expect(html).toMatch(/<textarea[^>]*disabled/);
    expect(state.current.sendQuestion).not.toHaveBeenCalled();
  });
});
