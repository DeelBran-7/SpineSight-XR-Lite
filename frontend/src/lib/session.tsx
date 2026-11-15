import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ChatMessage, PostureAnalysisResponse, ReportResponse } from "./api";

interface ObservationSession {
  id: number;
  photo: File | null;
  analysis: PostureAnalysisResponse | null;
  report: ReportResponse["report"] | null;
  messages: ChatMessage[];
}

function emptyObservation(id: number): ObservationSession {
  return { id, photo: null, analysis: null, report: null, messages: [] };
}

interface SessionContextValue extends ObservationSession {
  consented: boolean;
  consent: () => void;
  clearObservation: () => void;
  setPhoto: (photo: File, sessionId: number) => void;
  setAnalysis: (analysis: PostureAnalysisResponse, sessionId: number) => void;
  setReport: (report: ReportResponse["report"], sessionId: number) => void;
  addExchange: (messages: ChatMessage[], sessionId: number) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [consented, setConsented] = useState(false);
  const [session, setSession] = useState(() => emptyObservation(0));
  const consent = useCallback(() => setConsented(true), []);
  const clearObservation = useCallback(() => {
    setSession((current) => emptyObservation(current.id + 1));
  }, []);
  const setPhoto = useCallback((photo: File, id: number) => {
    setSession((current) => current.id === id ? { ...current, photo } : current);
  }, []);
  const setAnalysis = useCallback((analysis: PostureAnalysisResponse, id: number) => {
    setSession((current) => current.id === id ? { ...current, analysis, report: null, messages: [] } : current);
  }, []);
  const setReport = useCallback((report: ReportResponse["report"], id: number) => {
    setSession((current) => current.id === id ? { ...current, report } : current);
  }, []);
  const addExchange = useCallback((exchange: ChatMessage[], id: number) => {
    setSession((current) => current.id === id
      ? { ...current, messages: [...current.messages, ...exchange] }
      : current);
  }, []);
  const value = useMemo(() => ({
    ...session, consented, consent, clearObservation, setPhoto, setAnalysis, setReport, addExchange,
  }), [session, consented, consent, clearObservation, setPhoto, setAnalysis, setReport, addExchange]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("SessionProvider is required.");
  return session;
}
