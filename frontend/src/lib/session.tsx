import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, CHAT_MESSAGE_LIMIT, clearAPIRequests, type ChatMessage, type PostureAnalysisResponse, type ReportResponse } from "./api";

interface ObservationSession {
  id: number;
  photo: File | null;
  analysis: PostureAnalysisResponse | null;
  report: ReportResponse["report"] | null;
  messages: ChatMessage[];
  reportPending: boolean;
  reportError: unknown | null;
  chatRequest: { message: string; pending: boolean; error: unknown | null } | null;
}

function emptyObservation(id: number): ObservationSession {
  return { id, photo: null, analysis: null, report: null, messages: [], reportPending: false, reportError: null, chatRequest: null };
}

interface SessionContextValue extends ObservationSession {
  consented: boolean;
  consent: () => void;
  clearObservation: () => void;
  reopenPhoto: () => void;
  requestReport: () => Promise<void>;
  sendQuestion: (message: string) => Promise<void>;
  setPhoto: (photo: File, sessionId: number) => void;
  setAnalysis: (analysis: PostureAnalysisResponse, sessionId: number) => void;
  setReport: (report: ReportResponse["report"], sessionId: number) => void;
  addExchange: (messages: ChatMessage[], sessionId: number) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [consented, setConsented] = useState(false);
  const [session, setSession] = useState(() => emptyObservation(0));
  const current = useRef(session);
  const epoch = useRef(0);
  const active = useRef(false);
  const update = useCallback((next: ObservationSession) => {
    current.current = next;
    setSession(next);
  }, []);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; epoch.current += 1; clearAPIRequests(); };
  }, []);
  const consent = useCallback(() => setConsented(true), []);
  const clearObservation = useCallback(() => {
    epoch.current += 1;
    clearAPIRequests();
    update(emptyObservation(current.current.id + 1));
  }, [update]);
  const reopenPhoto = useCallback(() => {
    epoch.current += 1;
    clearAPIRequests();
    update({ ...emptyObservation(current.current.id + 1), photo: current.current.photo });
  }, [update]);
  const setPhoto = useCallback((photo: File, id: number) => {
    if (current.current.id !== id) return;
    epoch.current += 1;
    clearAPIRequests();
    update({ ...emptyObservation(id), photo });
  }, [update]);
  const setAnalysis = useCallback((analysis: PostureAnalysisResponse, id: number) => {
    if (current.current.id !== id || !current.current.photo) return;
    epoch.current += 1;
    clearAPIRequests();
    update({ ...current.current, analysis, report: null, messages: [], reportPending: false, reportError: null, chatRequest: null });
  }, [update]);
  const setReport = useCallback((report: ReportResponse["report"], id: number) => {
    if (current.current.id === id) update({ ...current.current, report });
  }, [update]);
  const addExchange = useCallback((exchange: ChatMessage[], id: number) => {
    if (current.current.id === id) update({ ...current.current, messages: [...current.current.messages, ...exchange] });
  }, [update]);
  const requestReport = useCallback(async () => {
    const snapshot = current.current;
    if (!snapshot.analysis || snapshot.report || snapshot.reportPending) return;
    const token = epoch.current;
    update({ ...snapshot, reportPending: true, reportError: null });
    try {
      const result = await api.report(snapshot.analysis.analysis_id, new AbortController().signal);
      if (active.current && epoch.current === token) update({ ...current.current, report: result.report, reportPending: false });
    } catch (error) {
      if (active.current && epoch.current === token) update({ ...current.current, reportError: error, reportPending: false });
    }
  }, [update]);
  const sendQuestion = useCallback(async (question: string) => {
    const message = question.trim();
    const snapshot = current.current;
    if (!message || message.length > CHAT_MESSAGE_LIMIT || snapshot.chatRequest?.pending) return;
    const token = epoch.current;
    update({ ...snapshot, chatRequest: { message, pending: true, error: null } });
    try {
      const result = await api.assistant(snapshot.analysis?.analysis_id ?? null, message, snapshot.messages, new AbortController().signal);
      if (active.current && epoch.current === token) update({
        ...current.current, chatRequest: null,
        messages: [...current.current.messages, { role: "user", content: message }, { role: "assistant", content: result.reply }],
      });
    } catch (error) {
      if (active.current && epoch.current === token) update({ ...current.current, chatRequest: { message, pending: false, error } });
    }
  }, [update]);
  const value = useMemo(() => ({
    ...session, consented, consent, clearObservation, reopenPhoto, requestReport, sendQuestion, setPhoto, setAnalysis, setReport, addExchange,
  }), [session, consented, consent, clearObservation, reopenPhoto, requestReport, sendQuestion, setPhoto, setAnalysis, setReport, addExchange]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("SessionProvider is required.");
  return session;
}
