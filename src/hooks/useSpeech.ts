import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionCtor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export interface UseSpeechResult {
  supported: boolean;
  listening: boolean;
  transcript: string;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Wraps the Web Speech API (SpeechRecognition).
 * Continuous + interim results so the user can see partial dictation in real time.
 */
export function useSpeech(lang = 'en-US'): UseSpeechResult {
  const Ctor =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
      : undefined;

  const supported = Boolean(Ctor);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) finalText += text;
        else interimText += text;
      }
      if (finalText) setTranscript((prev) => (prev ? `${prev} ${finalText}`.trim() : finalText));
      setInterim(interimText);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      setError(event.error || 'speech-error');
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
      setInterim('');
    };

    recognitionRef.current = rec;
    return () => {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    };
  }, [Ctor, lang]);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || listening) return;
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed-to-start');
    }
  }, [listening]);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* noop */
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
    setError(null);
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, reset };
}
