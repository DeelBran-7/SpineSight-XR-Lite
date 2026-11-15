import { ArrowRight, ArrowUp, CircleAlert, Layers, LoaderCircle, MessageCircle, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router";
import { Notice, PageHeading } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { api, APIError, CHAT_MESSAGE_LIMIT, readableError } from "@/lib/api";
import { analysisQuestions, generalQuestions } from "@/lib/observations";
import { useSession } from "@/lib/session";

export function AssistantPage() {
  const location = useLocation();
  const session = useSession();
  const { analysis, messages, addExchange, clearObservation, id } = session;
  const analysisId = analysis?.analysis_id ?? null;
  const questions = analysisId ? analysisQuestions : generalQuestions;
  const suggested = typeof location.state?.question === "string" && questions.includes(location.state.question)
    ? location.state.question : "";
  const [draft, setDraft] = useState(suggested);
  const [outbox, setOutbox] = useState("");
  const [error, setError] = useState<{ text: string; expired: boolean } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const last = useRef<HTMLDivElement>(null);

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (messages.length || outbox) last.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages.length, outbox, waiting]);

  function chooseQuestion(question: string) {
    setDraft(question);
    input.current?.focus();
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || message.length > CHAT_MESSAGE_LIMIT || pending.current || error?.expired) return;
    const controller = new AbortController();
    pending.current = controller;
    setDraft("");
    setOutbox(message);
    setError(null);
    setWaiting(true);
    try {
      const result = await api.assistant(analysisId, message, messages, controller.signal);
      if (controller.signal.aborted) return;
      addExchange([{ role: "user", content: message }, { role: "assistant", content: result.reply }], id);
      setOutbox("");
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError({
        text: readableError(failure, "The assistant could not respond. Try again."),
        expired: failure instanceof APIError && failure.code === "ANALYSIS_SESSION_EXPIRED",
      });
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setWaiting(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send(draft);
  }

  return (
    <div className="page-shell assistant-shell">
      <PageHeading title="SpineSight Assistant" description="Ask about capture, the measurements, or what a back-view photo can show." back={analysisId ? "/results" : "/"} />
      <section className="surface chat" aria-label="AI assistant">
        <div className="chat-context">
          <span className="icon-box">{analysisId ? <Layers size={20} /> : <MessageCircle size={20} />}</span>
          <div>
            <strong>{analysisId ? "Current observation attached" : "No observation attached"}</strong>
            <p>{analysisId ? "Ask about the measurements from your current photo." : "You can ask general questions about the capture process."}</p>
          </div>
          {analysisId && <Link className="text-link" to="/results">View results <ArrowRight size={16} /></Link>}
        </div>
        <div className="chat-body" role="log" aria-label="Conversation" aria-live="polite">
          {!messages.length && !outbox && (
            <div className="chat-empty">
              <span className="chat-empty-icon"><Sparkles size={27} /></span>
              <h2>What would you like to understand?</h2>
              <div className="chat-suggestions">
                {questions.map((question) => (
                  <button key={question} onClick={() => chooseQuestion(question)}>{question} <ArrowRight size={16} /></button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div className={`chat-message chat-${message.role}`} key={index}>
              <span className="chat-speaker">{message.role === "user" ? "You" : "Assistant"}</span>
              <p>{message.content}</p>
            </div>
          ))}
          {outbox && <div className="chat-message chat-user"><span className="chat-speaker">You</span><p>{outbox}</p></div>}
          {waiting && <div className="chat-pending"><LoaderCircle className="spin" size={18} /> Assistant is responding…</div>}
          {error && (
            <Notice variant="error">
              <CircleAlert size={19} /><span>{error.text}</span>
              {error.expired ? (
                <Button variant="secondary" asChild onClick={clearObservation}><Link to="/instructions">Start another observation</Link></Button>
              ) : (
                <Button variant="secondary" onClick={() => void send(outbox)}><RotateCcw size={17} /> Retry</Button>
              )}
            </Notice>
          )}
          <div ref={last} />
        </div>
        <form className="chat-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="assistant-message">Your question</label>
          <div className="compose">
            <textarea id="assistant-message" ref={input} rows={2} maxLength={CHAT_MESSAGE_LIMIT}
              value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={sendOnEnter}
              placeholder="Ask a question…" disabled={waiting || error?.expired} />
            <Button type="submit" size="icon" aria-label="Send question" disabled={waiting || !draft.trim() || error?.expired}><ArrowUp size={20} /></Button>
          </div>
          <p className="privacy-inline"><ShieldCheck size={15} /> Messages go to DeepSeek. Keep identifying details out of chat.</p>
        </form>
      </section>
    </div>
  );
}
