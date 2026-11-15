import { useLayoutEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Layout } from "@/components/Layout";
import { SessionProvider, useSession } from "@/lib/session";
import { HomePage, InstructionsPage, PrivacyPage } from "@/pages/Overview";
import { CapturePage } from "@/pages/Capture";
import { PreviewPage } from "@/pages/Preview";
import { ResultsPage } from "@/pages/Results";
import { AssistantPage } from "@/pages/Assistant";

function CaptureEntry() {
  const { id, photo, clearObservation } = useSession();
  const [retaking, setRetaking] = useState(() => photo !== null);
  const cleared = useRef(false);

  useLayoutEffect(() => {
    if (!retaking || cleared.current) return;
    cleared.current = true;
    clearObservation();
    setRetaking(false);
  }, [clearObservation, retaking]);

  return retaking ? null : <CapturePage key={id} />;
}

function ObservationRoutes() {
  const { consented, photo, analysis, id } = useSession();
  const steps = consented ? <InstructionsPage /> : <Navigate to="/privacy" state={{ next: "/instructions" }} replace />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="instructions" element={steps} />
        <Route path="capture" element={consented ? <CaptureEntry /> : <Navigate to="/instructions" replace />} />
        <Route path="preview" element={photo ? <PreviewPage key={id} /> : <Navigate to="/instructions" replace />} />
        <Route path="results" element={analysis && photo ? <ResultsPage key={id} /> : <Navigate to="/instructions" replace />} />
        <Route path="assistant" element={consented
          ? <AssistantPage key={id} />
          : <Navigate to="/privacy" state={{ next: "/assistant" }} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return <BrowserRouter><SessionProvider><ObservationRoutes /></SessionProvider></BrowserRouter>;
}
