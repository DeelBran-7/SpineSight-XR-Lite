import { ArrowLeft, LockKeyhole, MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { cn } from "@/lib/utils";

const pageNames: Record<string, string> = {
  "/": "2D posture observation", "/privacy": "Your privacy", "/instructions": "Capture setup",
  "/capture": "Camera", "/preview": "Review your photo", "/results": "Your observation", "/assistant": "Assistant",
};

export function Layout() {
  const location = useLocation();
  const previousPath = useRef(location.pathname);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    document.title = `${pageNames[location.pathname] ?? "2D posture observation"} · SpineSight XR Lite`;
  }, [location.pathname]);
  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <div className="layout">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="SpineSight XR Lite home">
            <img src="/mark.svg" alt="" width="40" height="40" />
            <span>SpineSight <span className="brand-lite">XR Lite</span></span>
          </Link>
          <nav className="site-nav" aria-label="Main navigation">
            <Link to="/privacy" className="nav-privacy" aria-current={location.pathname === "/privacy" ? "page" : undefined}><ShieldCheck size={17} /> <span>Privacy</span></Link>
            <Link to="/assistant" className="nav-assistant" aria-current={location.pathname === "/assistant" ? "page" : undefined}><MessageCircle size={17} /> <span>Assistant</span></Link>
          </nav>
        </div>
      </header>
      <main className="site-main" id="main" tabIndex={-1} ref={main}><Outlet /></main>
      <footer className="site-footer">
        <span><LockKeyhole size={14} /> No saved history</span>
        <span>Educational 2D posture observation</span>
        <Link to="/privacy">Privacy notice</Link>
      </footer>
    </div>
  );
}

const STEPS = ["Setup", "Capture", "Review", "Results"];

export function StepHeader({ step, back, title, description }: {
  step: number;
  back: string;
  title: string;
  description: string;
}) {
  return (
    <header className="page-intro">
      <Link className="back-link" to={back}><ArrowLeft size={17} /> Back</Link>
      <ol className="steps" aria-label="Observation progress">
        {STEPS.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined} className={cn(
            index === step && "step-current", index < step && "step-complete",
          )}><span>{label}</span></li>
        ))}
      </ol>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

export function PageHeading({ title, description, back = "/" }: {
  title: string;
  description: string;
  back?: string;
}) {
  return (
    <header className="page-intro">
      <Link className="back-link" to={back}><ArrowLeft size={17} /> Back</Link>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

export function Notice({ variant = "info", children }: { variant?: "info" | "error" | "success"; children: ReactNode }) {
  return <div className={`notice notice-${variant}`} role={variant === "error" ? "alert" : undefined}>{children}</div>;
}
