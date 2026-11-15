import { useCallback, useEffect, useRef, useState } from "react";
import { guidance, type Guidance } from "@/lib/framing";

export function speechAvailable(browser: Partial<Window> = window) {
  return !!browser.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined";
}

export function useVoiceGuidance(status: Guidance, announcement?: string) {
  const available = speechAvailable();
  const [muted, setMuted] = useState(true);
  const previous = useRef<string | null>(null);

  const announce = useCallback((next: string) => {
    if (!available || document.visibilityState === "hidden" || previous.current === next) return;
    const utterance = new SpeechSynthesisUtterance(next);
    utterance.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    previous.current = next;
  }, [available]);

  const toggle = useCallback(() => {
    if (!available) return;
    if (muted) {
      announce(announcement ?? guidance[status].title);
      setMuted(false);
    } else {
      window.speechSynthesis.cancel();
      previous.current = null;
      setMuted(true);
    }
  }, [announce, announcement, available, muted, status]);

  useEffect(() => {
    if (!muted) announce(announcement ?? guidance[status].title);
  }, [announce, announcement, muted, status]);

  useEffect(() => {
    const pause = () => {
      if (available && document.visibilityState === "hidden") {
        window.speechSynthesis.cancel();
        previous.current = null;
      }
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      document.removeEventListener("visibilitychange", pause);
      if (available) window.speechSynthesis.cancel();
    };
  }, [available]);

  return { available, muted, toggle };
}
