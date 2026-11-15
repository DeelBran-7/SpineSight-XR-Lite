import {
  ArrowDown,
  ArrowRight,
  Camera,
  Check,
  Footprints,
  Image,
  Info,
  Layers,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sun,
  Triangle,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Notice, PageHeading, StepHeader } from "@/components/Layout";
import { useSession } from "@/lib/session";

function GeometryIllustration() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="hero-visual-header"><ScanLine size={16} /><span>Back-view landmarks</span></div>
      <svg className="hero-figure" viewBox="0 0 360 330" fill="none">
        <defs>
          <pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M22 0H0V22" stroke="#d8e6f8" strokeWidth="1" />
          </pattern>
          <linearGradient id="bodyFill" x1="170" x2="240" y1="65" y2="309" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f8fcff" />
            <stop offset="1" stopColor="#dceafd" />
          </linearGradient>
        </defs>
        <rect x="45" y="18" width="270" height="288" rx="22" fill="url(#grid)" />
        <path d="M87 76V54a10 10 0 0 1 10-10h22m122 0h22a10 10 0 0 1 10 10v22M87 251v22a10 10 0 0 0 10 10h22m122 0h22a10 10 0 0 0 10-10v-22" stroke="#8ca9d2" strokeWidth="2" />
        <path d="M180 32v266m-116-133h232" stroke="#91afd9" strokeOpacity=".6" strokeDasharray="3 7" />
        <path d="M167 98c1 12-4 14-18 19l-17 5c-13 4-21 15-24 31l-16 77c-2 10 12 12 15 2l20-56c6 27 12 45 5 61-5 15-8 29-7 49h38l11-31h12l11 31h38c1-21-3-36-8-50-7-18-1-33 5-60l19 56c4 10 17 8 15-2l-16-76c-3-16-10-27-24-31l-19-6c-14-5-19-7-18-19" fill="url(#bodyFill)" stroke="#9db8dc" strokeWidth="2" strokeLinejoin="round" />
        <path d="M157 76c0-16 10-27 23-27s23 11 23 27c0 17-10 30-23 30s-23-13-23-30Z" fill="url(#bodyFill)" stroke="#9db8dc" strokeWidth="2" />
        <path d="M132 135 227 141M138 225l84-1" stroke="#2761cc" strokeWidth="2.75" strokeLinecap="round" />
        <path d="m179.5 138 .5 86.5" stroke="#2a78d0" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 6" />
        <g fill="#2761cc" stroke="#fff" strokeWidth="2.5">
          <circle cx="132" cy="135" r="6" /><circle cx="227" cy="141" r="6" />
          <circle cx="138" cy="225" r="6" /><circle cx="222" cy="224" r="6" />
        </g>
        <g stroke="#7698cb" strokeWidth="1.5" strokeLinecap="round">
          <path d="M112 129h-13l-7-7H61m185 27h16l8 8h30m-185 75H99l-7 7H61" />
        </g>
        <g fill="#8bacdd"><circle cx="59" cy="122" r="2.5" /><circle cx="301" cy="157" r="2.5" /><circle cx="59" cy="239" r="2.5" /></g>
      </svg>
      <div className="visual-legend"><span></span> Landmarks <i></i> Alignment lines</div>
    </div>
  );
}

export function HomePage() {
  const { clearObservation, consented } = useSession();

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><ScanLine size={17} /> 2D posture observation</p>
          <h1>See your posture in a new way.</h1>
          <p className="hero-description">Use one back-view photo to see the visible alignment of your shoulders, hips, and torso.</p>
          <div className="hero-actions">
            <Button asChild size="large" onClick={clearObservation}>
              <Link to={consented ? "/instructions" : "/privacy"} state={{ next: "/instructions" }}>
                Start observation <ArrowRight size={19} />
              </Link>
            </Button>
            <a className="how-link" href="#how-it-works">How it works <ArrowDown size={16} /></a>
          </div>
          <div className="hero-note"><LockKeyhole size={15} /> Your live camera feed stays on this device.</div>
        </div>
        <GeometryIllustration />
      </section>
      <section className="home-how" id="how-it-works" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <div className="how-cards">
          <article className="how-card"><span className="icon-box"><Camera size={23} /></span><h3>Take one photo</h3><p>Follow live guidance to frame your back from head to upper thighs.</p></article>
          <article className="how-card"><span className="icon-box"><Layers size={23} /></span><h3>See your landmarks</h3><p>Explore the shoulder and hip points, and the lines used to make each measurement.</p></article>
          <article className="how-card"><span className="icon-box"><Info size={23} /></span><h3>Explore the result</h3><p>Read an AI explanation or ask the assistant about a measurement.</p></article>
        </div>
      </section>
      <div className="home-disclaimer"><Info size={18} /><p>SpineSight is an educational prototype. It cannot diagnose or rule out a medical condition.</p></div>
    </div>
  );
}

const privacyPoints = [
  { icon: Camera, title: "Camera and photo", text: "Live camera guidance runs on your device. When you choose Analyze, the app sends one photo to the developer’s local analysis server through the configured connection. Phone access uses HTTPS. The app processes the photo in memory and does not intentionally save it." },
  { icon: Layers, title: "Measurements and AI", text: "The server returns structured measurements. DeepSeek receives those measurements for AI summaries and, when an observation is attached, for chat. It also receives the messages you send in chat. The photo stays out of requests to DeepSeek." },
  { icon: LockKeyhole, title: "Session and personal details", text: "This tab holds consent, the photo, results, and chat in memory. The server keeps structured measurements temporarily. Keep identifying details out of chat." },
  { icon: Info, title: "Educational use", text: "This prototype describes visible geometry in a single image. It cannot diagnose or rule out scoliosis or any other medical condition." },
];

export function PrivacyPage() {
  const { consented, consent } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const next = location.state?.next === "/assistant" ? "/assistant"
    : location.state?.next === "/instructions" ? "/instructions"
    : null;
  const requiresConfirmation = !consented && next !== null;

  function accept() {
    consent();
    navigate(next ?? "/", { replace: true });
  }

  return (
    <div className="page-shell narrow">
      <PageHeading title="Your privacy" description="Review how SpineSight handles your photo and chat." />
      <section className="surface detail-list" aria-label="Privacy details">
        {privacyPoints.map(({ icon: Icon, title, text }) => (
          <div className="detail-row" key={title}>
            <span className="icon-box"><Icon size={22} /></span>
            <div><h2>{title}</h2><p>{text}</p></div>
          </div>
        ))}
      </section>
      {requiresConfirmation ? (
        <div className="page-actions">
          <Button onClick={accept} size="large"><Check size={19} /> I agree, continue</Button>
          <Button variant="secondary" asChild><Link to="/">Cancel</Link></Button>
        </div>
      ) : (
        <div className="page-actions"><Button variant="secondary" asChild><Link to="/">Return home</Link></Button></div>
      )}
    </div>
  );
}

const setupPoints = [
  { icon: Smartphone, title: "Set up your phone", text: "Place it on a stable stand. Use the rear camera, with the phone level and pointed straight toward where you’ll stand." },
  { icon: Image, title: "Frame head to upper thighs", text: "Keep your head, shoulders, torso, hips, and upper thighs in view. Leave space around both sides." },
  { icon: Footprints, title: "Face away and stand naturally", text: "Keep your back toward the camera and your arms slightly away from your torso. Stand as you normally would." },
  { icon: Sun, title: "Keep the scene simple", text: "Use even lighting and a plain background. Make sure you’re the only person in the frame." },
];

export function InstructionsPage() {
  return (
    <div className="page-shell narrow">
      <StepHeader step={0} back="/" title="Set up your capture" description="A steady phone and a clear back view help SpineSight locate your shoulders and hips." />
      <section className="surface detail-list" aria-label="Camera setup instructions">
        {setupPoints.map(({ icon: Icon, title, text }) => (
          <div className="detail-row" key={title}><span className="icon-box"><Icon size={23} /></span><div><h2>{title}</h2><p>{text}</p></div></div>
        ))}
      </section>
      <Notice><Triangle size={18} /><span>Taking the photo yourself? Turn on the timer and voice guidance on the camera screen.</span></Notice>
      <div className="page-actions">
        <Button asChild size="large"><Link to="/capture"><Camera size={19} /> Continue to camera <ArrowRight size={18} /></Link></Button>
        <Link to="/privacy" className="text-link"><ShieldCheck size={17} /> Privacy notice</Link>
      </div>
    </div>
  );
}
