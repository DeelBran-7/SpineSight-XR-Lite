import { useCallback, useEffect, useRef, useState } from "react";
import { guidance, type Guidance } from "@/lib/framing";

export function speechAvailable(browser: Partial<Window> = window) {
  return !!browser.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined";
}

export function useVoiceGuidance(status: Guidance) {
  const available = speechAvailable();
  const [muted, setMuted] = useState(true);
  const previous = useRef<Guidance | null>(null);

  const announce = useCallback((next: Guidance) => {
    if (!available || previous.current === next) return;
    const utterance = new SpeechSynthesisUtterance(guidance[next].title);
    utterance.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    previous.current = next;
  }, [available]);

  const toggle = useCallback(() => {
    if (!available) return;
    if (muted) {
      announce(status);
      setMuted(false);
    } else {
      window.speechSynthesis.cancel();
      previous.current = null;
      setMuted(true);
    }
  }, [announce, available, muted, status]);

  useEffect(() => {
    if (!muted) announce(status);
  }, [announce, muted, status]);

  useEffect(() => () => {
    if (available) window.speechSynthesis.cancel();
  }, [available]);

  return { available, muted, toggle };
}
