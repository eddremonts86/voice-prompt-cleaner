import { useEffect } from 'react';

export interface HotkeyMap {
  /** Cmd/Ctrl + Enter — submit current draft for refinement. */
  onSubmit?: () => void;
  /** Cmd/Ctrl + Shift + Enter — confirm current draft as final. */
  onConfirm?: () => void;
  /** Press and hold Space (outside inputs) — toggle the mic. */
  onPushToTalk?: (active: boolean) => void;
  /** Escape — clear current input. */
  onEscape?: () => void;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return t.isContentEditable;
}

export function useHotkeys(map: HotkeyMap): void {
  useEffect(() => {
    let spaceHeld = false;

    const onKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) map.onConfirm?.();
        else map.onSubmit?.();
        return;
      }

      if (e.key === 'Escape') {
        map.onEscape?.();
        return;
      }

      if (e.code === 'Space' && !spaceHeld && !isTypingTarget(e.target)) {
        spaceHeld = true;
        e.preventDefault();
        map.onPushToTalk?.(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceHeld) {
        spaceHeld = false;
        if (!isTypingTarget(e.target)) {
          e.preventDefault();
          map.onPushToTalk?.(false);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [map]);
}
