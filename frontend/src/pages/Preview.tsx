import { CircleAlert, LoaderCircle, RotateCcw, ScanLine, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Notice, StepHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { usePhotoUrl } from "@/hooks/usePhotoUrl";
import { api, readableError } from "@/lib/api";
import { useSession } from "@/lib/session";

export function PreviewPage() {
  const navigate = useNavigate();
  const { id, photo, analysis, setAnalysis } = useSession();
  const url = usePhotoUrl(photo);
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => pending.current?.abort(), []);

  async function analyze() {
    if (analysis) {
      void navigate("/results", { replace: true });
      return;
    }
    if (!photo || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = await api.analyze(photo, controller.signal);
      if (controller.signal.aborted) return;
      setAnalysis(result, id);
      void navigate("/results", { replace: true });
    } catch (failure) {
      if (!controller.signal.aborted) setError(readableError(failure, "The photo could not be analyzed. Try again."));
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="page-shell narrow">
      <StepHeader step={2} back="/capture" title="Review your photo" description="Check that your head, shoulders, hips, and upper thighs are visible before analyzing." />
      <section className="surface preview-panel" aria-label="Photo preview">
        <div className="still-image">{url && <img src={url} alt="The back-view photo selected for this observation" />}</div>
        <div className="preview-controls">
          {error && <Notice variant="error"><CircleAlert size={20} /><span>{error}</span></Notice>}
          <div className="page-actions">
            <Button size="large" type="button" disabled={busy} onClick={() => void analyze()}>
              {busy ? <LoaderCircle className="spin" size={20} /> : <ScanLine size={20} />} {busy ? "Analyzing photo…" : analysis ? "View results" : "Analyze photo"}
            </Button>
            <Button variant="secondary" asChild><Link to="/capture" replace><RotateCcw size={17} /> Retake</Link></Button>
          </div>
          {!analysis && <div className="privacy-inline"><ShieldCheck size={16} /> Analyze sends only this still photo to the analysis server.</div>}
        </div>
      </section>
    </div>
  );
}
