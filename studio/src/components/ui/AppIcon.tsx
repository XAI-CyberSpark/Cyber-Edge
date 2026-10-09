import { useEffect, useRef } from 'react';
import { MorphIcon, type MorphHandle, type MorphIconProps } from 'morphicons/react';
import {
  Sun, Moon, Play, Pause, PanelRightOpen, PanelRightClose, Lock, Unlock, LockKeyhole, UnlockKeyhole,
  DoorOpen, DoorClosed, Eye, EyeOff, Maximize2, Minimize2,
  Mic, Square, LoaderCircle, Paperclip, Send, Check, Search,
  ChevronRight, ChevronDown, TriangleAlert, ShieldCheck,
} from 'lucide';

// Keep data references stable so Morphicons can reuse its geometry plans.
const icons = {
  'panel-right-open': PanelRightOpen, 'panel-right-close': PanelRightClose,
  sun: Sun, moon: Moon, play: Play, pause: Pause, lock: Lock, unlock: Unlock,
  'lock-keyhole': LockKeyhole, 'unlock-keyhole': UnlockKeyhole,
  'door-open': DoorOpen, 'door-closed': DoorClosed, eye: Eye, 'eye-off': EyeOff,
  'maximize-2': Maximize2, 'minimize-2': Minimize2, mic: Mic, square: Square,
  'loader-circle': LoaderCircle, paperclip: Paperclip, send: Send,
  check: Check, search: Search, 'chevron-right': ChevronRight, 'chevron-down': ChevronDown,
  'triangle-alert': TriangleAlert, 'shield-check': ShieldCheck,
} as const;

export type AppIconName = keyof typeof icons;
type AppIconProps = Omit<MorphIconProps, 'icon' | 'from' | 'to' | 'progress' | 'reducedMotion'> & {
  name: AppIconName;
  spinning?: boolean;
};

/** Keep this component mounted across state changes; only change `name`. */
export function AppIcon({ name, spinning = false, className = '', size = 24, strokeWidth = 2, ...props }: AppIconProps) {
  const handle = useRef<MorphHandle>(null);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    // The library checks preferences at the next morph. Also settle an existing
    // flight immediately when the tab hides or the user changes the preference.
    const settleIfNeeded = () => {
      if (document.hidden || preference?.matches) handle.current?.set(icons[name]);
    };
    settleIfNeeded();
    document.addEventListener('visibilitychange', settleIfNeeded);
    preference?.addEventListener?.('change', settleIfNeeded);
    return () => {
      document.removeEventListener('visibilitychange', settleIfNeeded);
      preference?.removeEventListener?.('change', settleIfNeeded);
    };
  }, [name]);
  return <MorphIcon {...props} ref={handle} icon={icons[name]} size={size} strokeWidth={strokeWidth}
    spring="snappy" reducedMotion="user" focusable="false" data-app-icon={name}
    className={`lucide lucide-${name} app-icon${spinning ? ' app-icon--spinning' : ''} ${className}`} />;
}
