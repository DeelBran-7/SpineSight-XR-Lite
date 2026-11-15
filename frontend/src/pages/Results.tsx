import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Cloud,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Notice, StepHeader } from "@/components/Layout";
import { PoseOverlay } from "@/components/PoseOverlay";
import { Button } from "@/components/ui/button";
import { usePhotoUrl } from "@/hooks/usePhotoUrl";
import { api, APIError, LANDMARK_NAMES, readableError, type LandmarkName, type PostureAnalysisResponse, type ReportResponse } from "@/lib/api";
import { analysisQuestions, describeLevel, describeTorso, formatAngle, formatPercent } from "@/lib/observations";
import { useSession } from "@/lib/session";

function MetricCard({ title, value, label, detail, description }: {
  title: string;
  value: string;
  label: string;
  detail?: string;
  description: string;
}) {
  return (
    <article className="metric-card">
      <h3>{title}</h3>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {detail && <div className="metric-sign">{detail}</div>}
      <p>{description}</p>
    </article>
  );
}

const measurementLimits = [
  "Camera height and tilt, body rotation, clothing, and pose-estimation error can affect the result.",
  "Shoulder and hip labels use the model’s anatomical left and right. Directional angles use the displayed image axes.",
  "This is a single 2D observation. It cannot diagnose or rule out scoliosis or another medical condition.",
];

function TechnicalDetails({ analysis, report }: { analysis: PostureAnalysisResponse; report: ReportResponse["report"] | null }) {
  return (
    <details className="surface technical">
      <summary><span>Technical details</span><ChevronDown size={20} /></summary>
      <div className="technical-content">
        <h3>Landmark coordinates</h3>
        <p>Normalized coordinates run from 0 to 1, with the origin at the upper left. The minimum landmark visibility is {analysis.quality.landmark_visibility_threshold.toFixed(2)}.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Landmark</th><th scope="col">X</th><th scope="col">Y</th><th scope="col">Visibility</th></tr></thead>
            <tbody>{(Object.keys(LANDMARK_NAMES) as LandmarkName[]).map((key) => {
              const { x, y, visibility } = analysis.landmarks[key];
              return <tr key={key}><th scope="row">{LANDMARK_NAMES[key]}</th><td>{x.toFixed(4)}</td><td>{y.toFixed(4)}</td><td>{visibility.toFixed(3)}</td></tr>;
            })}</tbody>
          </table>
        </div>
        <h3>Measurement definitions</h3>
        <p>The backend converts normalized coordinates to pixels using the image width and height. X increases to the right and Y increases downward.</p>
        <dl className="formula-list">
          <dt>Shoulder and hip relative vertical offset</dt><dd><code>100 × |Δy| ÷ |Δx|</code> along each pair of landmarks.</dd>
          <dt>Shoulder and hip line angle</dt><dd><code>atan2(Δy, Δx)</code> in degrees, from the left side of the image toward the right. Positive means the line slopes downward toward the right. The line angle is bounded by −90° and +90°.</dd>
          <dt>Torso lean angle</dt><dd><code>atan2(Sx − Hx, Hy − Sy)</code> in degrees, with S as the shoulder midpoint and H as the hip midpoint. Positive means the shoulders’ midpoint is to the right in the image.</dd>
        </dl>
        <p>Relative vertical offset and line angle describe the same geometry in different units.</p>
        <h3>Rule-based observations</h3>
        <ul className="technical-labels">
          {Object.entries(analysis.observations).map(([feature, observation]) => (
            <li key={feature}><strong>{feature}</strong><code>{observation.status}</code><code>{observation.direction}</code></li>
          ))}
        </ul>
        <h3>Limitations</h3>
        <ul className="plain-list">{measurementLimits.map((item) => <li key={item}>{item}</li>)}</ul>
        {report && <><h3>AI technical summary</h3><p>{report.technical_summary}</p></>}
      </div>
    </details>
  );
}

export function ResultsPage() {
  const { analysis, photo, report, id, setReport, clearObservation } = useSession();
  const url = usePhotoUrl(photo);
  const [overlay, setOverlay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; expired: boolean } | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function generateReport() {
    if (!analysis?.quality.valid || report || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await api.report(analysis.analysis_id, controller.signal);
      if (!controller.signal.aborted) setReport(result.report, id);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError({
        text: readableError(failure, "The AI summary could not be generated. You can still view your measurements."),
        expired: failure instanceof APIError && failure.code === "ANALYSIS_SESSION_EXPIRED",
      });
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  if (!analysis) return null;
  const { width, height } = analysis.image;
  const { measurements, observations, quality } = analysis;

  return (
    <div className="page-shell results-shell">
      <StepHeader step={3} back="/preview" title="Your posture observation" description="Explore alignment measured from the visible landmarks in your photo." />
      <div className="results-grid">
        <figure className="surface result-photo-card">
          <div className="still-image result-image" style={{ aspectRatio: width / height, width: `min(100%, calc(var(--result-max-height) * ${width / height}))` }}>
            {url && <img src={url} alt="Your back-view photo" />}
            {overlay && <PoseOverlay landmarks={analysis.landmarks} width={width} height={height} />}
          </div>
          <figcaption>
            <span className="photo-legend"><i /> {overlay ? "Shoulder, hip, and midpoint lines" : "Original photo"}</span>
            <Button type="button" variant="secondary" className="overlay-toggle" aria-pressed={overlay} onClick={() => setOverlay((visible) => !visible)}>
              {overlay ? <EyeOff size={17} /> : <Eye size={17} />} {overlay ? "Hide lines" : "Show lines"}
            </Button>
          </figcaption>
        </figure>
        <section className="results-measurements" aria-labelledby="metrics-title">
          <Notice variant={quality.valid ? "success" : "error"}>
            {quality.valid ? <Check size={19} /> : <CircleAlert size={19} />}
            <span><strong>{quality.valid ? "Landmark quality passed" : "Landmark quality unavailable"}</strong>{quality.message}</span>
          </Notice>
          <h2 id="metrics-title">Measurements</h2>
          <div className="metrics">
            <MetricCard title="Shoulder alignment" value={formatPercent(measurements.shoulder_asymmetry_percent)}
              label="Relative vertical offset" detail={`${formatAngle(measurements.shoulder_angle_deg)} line angle`}
              description={describeLevel(observations.shoulder.direction)} />
            <MetricCard title="Hip alignment" value={formatPercent(measurements.hip_asymmetry_percent)}
              label="Relative vertical offset" detail={`${formatAngle(measurements.hip_angle_deg)} line angle`}
              description={describeLevel(observations.hip.direction)} />
            <MetricCard title="Torso lean" value={formatAngle(measurements.torso_lean_angle_deg)}
              label="Angle from image vertical" description={describeTorso(observations.torso.direction)} />
          </div>
        </section>
      </div>
      <div className="results-explain">
        <section className="surface summary-card" aria-labelledby="summary-title">
          <div className="summary-head"><span className="icon-box"><Sparkles size={21} /></span><h2 id="summary-title">AI summary</h2></div>
          {report ? (
            <div className="report-content">
              <p className="report-summary">{report.simple_summary}</p>
              <dl className="report-findings">
                <dt>Shoulders</dt><dd>{report.findings.shoulder}</dd>
                <dt>Hips</dt><dd>{report.findings.hip}</dd>
                <dt>Torso</dt><dd>{report.findings.torso}</dd>
              </dl>
              <h3>Limitations</h3>
              <ul className="plain-list">{report.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
              <p className="report-disclaimer">{report.disclaimer}</p>
            </div>
          ) : (
            <>
              <p>Get a plain-language explanation of the measurements and what can affect them.</p>
              <p className="privacy-inline"><Cloud size={17} /> DeepSeek receives the measurements for this summary.</p>
              {error && <Notice variant="error"><CircleAlert size={19} /><span>{error.text}</span></Notice>}
              {error?.expired ? (
                <Button variant="secondary" asChild onClick={clearObservation}><Link to="/instructions">Start another observation <ArrowRight size={17} /></Link></Button>
              ) : (
                <Button onClick={() => void generateReport()} disabled={!quality.valid || busy} aria-busy={busy}>
                  {busy ? <LoaderCircle className="spin" size={18} /> : error ? <RotateCcw size={17} /> : <Sparkles size={17} />}
                  {busy ? "Generating summary…" : error ? "Retry AI summary" : "Generate AI summary"}
                </Button>
              )}
            </>
          )}
        </section>
        <section className="surface summary-card question-card" aria-labelledby="question-title">
          <div className="summary-head"><span className="icon-box"><MessageCircle size={21} /></span><h2 id="question-title">Ask the assistant</h2></div>
          <div className="question-list">
            {analysisQuestions.map((question) => (
              <Link key={question} to="/assistant" state={{ question }}>{question} <ArrowRight size={16} /></Link>
            ))}
          </div>
        </section>
      </div>
      <TechnicalDetails analysis={analysis} report={report} />
      <Notice><Info size={18} /><span>These measurements describe one image. Camera position and body rotation can change the result.</span></Notice>
      <div className="page-actions">
        <Button variant="secondary" asChild onClick={clearObservation}><Link to="/instructions"><RotateCcw size={17} /> New observation</Link></Button>
        <Link to="/" className="text-link">Return home</Link>
      </div>
    </div>
  );
}
