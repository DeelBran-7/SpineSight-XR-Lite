import { ArrowRight, ArrowUp, Check, ChevronDown, CircleAlert, Layers, LoaderCircle, MessageCircle, Pencil, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router";
import { Notice, PageHeading } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { APIError, CHAT_MESSAGE_LIMIT, readableError } from "@/lib/api";
import { analysisQuestions, findPreviousAnswer, generalQuestions } from "@/lib/observations";
import { useSession } from "@/lib/session";

export function AssistantPage() {
  const location = useLocation();
  const { analysis, messages, chatRequest, reportError, sendQuestion, reopenPhoto } = useSession();
  const analysisId = analysis?.analysis_id ?? null;
  const questions = analysisId ? analysisQuestions : generalQuestions;
  const suggested = typeof location.state?.question === "string" && questions.includes(location.state.question)
    ? location.state.question : "";
  const previousAnswer = findPreviousAnswer(messages, suggested);
  const [draft, setDraft] = useState(previousAnswer === null ? suggested : "");
  const outbox = chatRequest?.message ?? "";
  const waiting = chatRequest?.pending ?? false;
  const expiredFailure = [reportError, chatRequest?.error].find((failure) => failure instanceof APIError && failure.code === "ANALYSIS_SESSION_EXPIRED");
  const failure = expiredFailure ?? chatRequest?.error;
  const error = failure ? {
    text: readableError(failure, "The assistant could not respond. Try again."),
    expired: Boolean(expiredFailure),
  } : null;
  const [highlightedAnswer, setHighlightedAnswer] = useState<number | null>(previousAnswer);
  const [announcement, setAnnouncement] = useState(previousAnswer !== null ? "Showing the existing answer to your question. No new AI request was sent." : "");
  const input = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const messageElements = useRef(new Map<number, HTMLDivElement>());
  const questionTools = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const element = conversation.current;
    if (!element) return;
    const answer = highlightedAnswer === null ? null : messageElements.current.get(highlightedAnswer);
    if (answer) element.scrollTop += answer.getBoundingClientRect().top - element.getBoundingClientRect().top - 12;
    else element.scrollTop = element.scrollHeight;
  }, [messages.length, outbox, waiting, highlightedAnswer]);

  function chooseQuestion(question: string) {
    const existingAnswer = findPreviousAnswer(messages, question);
    if (questionTools.current) questionTools.current.open = false;
    if (existingAnswer !== null) {
      setHighlightedAnswer(existingAnswer);
      setAnnouncement("Showing the existing answer to your question. No new AI request was sent.");
      const answer = messageElements.current.get(existingAnswer);
      if (answer && conversation.current) conversation.current.scrollTop += answer.getBoundingClientRect().top - conversation.current.getBoundingClientRect().top - 12;
      answer?.focus({ preventScroll: true });
      return;
    }
    setHighlightedAnswer(null);
    setAnnouncement("");
    setDraft(question);
    input.current?.focus();
  }

  function send(text: string, retry = false) {
    const message = text.trim();
    if (!message || message.length > CHAT_MESSAGE_LIMIT || waiting || error?.expired) return;
    // A retry belongs to the previous message, so preserve any next question being drafted.
    if (!retry) setDraft("");
    setHighlightedAnswer(null);
    setAnnouncement("");
    void sendQuestion(message);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send(draft);
  }

  function editFailedQuestion() {
    // Keep a newer draft intact. Retry remains available until the next send.
    if (draft.trim()) return;
    setDraft(outbox);
    input.current?.focus();
  }

  function askAgain() {
    if (highlightedAnswer === null) return;
    const question = messages[highlightedAnswer - 1];
    if (question?.role !== "user") return;
    setDraft(question.content);
    setHighlightedAnswer(null);
    setAnnouncement("");
    input.current?.focus();
  }

  function suggestionButtons() {
    return questions.map((question) => {
      const answered = findPreviousAnswer(messages, question) !== null;
      return <button type="button" key={question} disabled={waiting || (error?.expired && !answered)} onClick={() => chooseQuestion(question)}>
        <span>{question}{answered && <small><Check size={12} /> Read existing answer</small>}</span><ArrowRight size={16} />
      </button>;
    });
  }

  return (
    <div className="page-shell assistant-shell">
      <PageHeading title="SpineSight Assistant" description="Ask about capture, the measurements, or what a back-view photo can show." back={analysisId ? "/results" : "/"} />
      <section className="surface chat" aria-label="AI assistant">
        <div className="chat-context">
          <span className="icon-box">{analysisId ? <Layers size={20} /> : <MessageCircle size={20} />}</span>
          <div>
            <strong>{error?.expired ? "Observation access expired" : analysisId ? "Current observation attached" : "No observation attached"}</strong>
            <p>{error?.expired ? "Your photo and existing results remain in this tab." : analysisId ? "Answers use the measurements from your current photo." : "Ask general questions about capture and how the app works."}</p>
          </div>
          {analysisId && <Link className="text-link" to="/results">View results <ArrowRight size={16} /></Link>}
        </div>
        {announcement && <div className="chat-announcement"><p role="status"><Check size={16} />{announcement}</p><button type="button" className="text-link" onClick={askAgain} disabled={waiting || error?.expired}>Ask again <ArrowRight size={15} /></button></div>}
        <div className="chat-body" ref={conversation} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text" aria-busy={waiting} tabIndex={0}>
          {!messages.length && !outbox && (
            <div className="chat-empty">
              <span className="chat-empty-icon"><Sparkles size={27} /></span>
              <h2>What would you like to understand?</h2>
              <p>Choose a question, then send when you’re ready.</p>
              <div className="chat-suggestions">{suggestionButtons()}</div>
            </div>
          )}
          {messages.map((message, index) => (
            <div className={`chat-message chat-${message.role}${highlightedAnswer === index ? " chat-highlighted" : ""}`} key={index}
              ref={(element) => { if (element) messageElements.current.set(index, element); else messageElements.current.delete(index); }}
              tabIndex={-1} aria-label={message.role === "user" ? "Your message" : "Assistant answer"}>
              <span className="chat-speaker">{message.role === "user" ? "You" : "Assistant"}</span>
              <p>{message.content}</p>
            </div>
          ))}
          {outbox && <div className="chat-message chat-user"><span className="chat-speaker">You{error ? " · No reply received" : ""}</span><p>{outbox}</p></div>}
          {waiting && <div className="chat-pending"><LoaderCircle className="spin" size={18} /> Assistant is responding…</div>}
          {error && (
            <Notice variant="error">
              <CircleAlert size={19} /><span>{error.text}{error.expired && " Review and analyze the photo again to renew access."}</span>
              {error.expired ? (
                <Button variant="secondary" asChild onClick={reopenPhoto}><Link to="/preview">Review and reanalyze photo</Link></Button>
              ) : (
                <div className="chat-error-actions">
                  <Button variant="secondary" onClick={() => void send(outbox, true)}><RotateCcw size={17} /> Retry question</Button>
                  {!draft.trim() && <Button variant="quiet" onClick={editFailedQuestion}><Pencil size={16} /> Edit question</Button>}
                </div>
              )}
            </Notice>
          )}
        </div>
        {messages.length > 0 && <details className="chat-question-tools" ref={questionTools}>
          <summary>Quick questions <ChevronDown size={17} /></summary>
          <div className="chat-suggestions">{suggestionButtons()}</div>
        </details>}
        <form className="chat-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="assistant-message">Your question</label>
          <div className="compose">
            <textarea id="assistant-message" ref={input} rows={2} maxLength={CHAT_MESSAGE_LIMIT}
              value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={sendOnEnter}
              aria-describedby="message-help message-privacy" enterKeyHint="enter"
              placeholder={waiting ? "Draft your next question…" : "Ask a question…"} disabled={error?.expired} />
            <Button type="submit" size="icon" aria-label="Send question" disabled={waiting || !draft.trim() || error?.expired}><ArrowUp size={20} /></Button>
          </div>
          <div className="compose-help" id="message-help"><span>Enter adds a line. <span className="keyboard-shortcut">Ctrl or ⌘ + Enter sends.</span></span><span className={draft.length >= CHAT_MESSAGE_LIMIT - 100 ? "count-near-limit" : undefined}>{draft.length.toLocaleString("en")} / {CHAT_MESSAGE_LIMIT.toLocaleString("en")}</span></div>
          <p className="privacy-inline" id="message-privacy"><ShieldCheck size={15} /> Messages go to DeepSeek. Avoid identifying details. Chat clears when this tab is refreshed or a new observation begins.</p>
        </form>
      </section>
      <p className="assistant-boundary">This assistant explains 2D image geometry. It cannot diagnose conditions or recommend treatment.</p>
    </div>
  );
}
