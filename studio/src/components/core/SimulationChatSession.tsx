import type { SimulationReport } from '@/domain/simulationReport';
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from 'react';

export type SimulationChatEntry = { id: number; role: 'user' | 'assistant'; text: string; image?: string; details?: string[]; report?: SimulationReport };
type ChatState = { text: string; attachment: { url: string; name: string } | null; entries: SimulationChatEntry[] };

// Owned by the workspace, not by a mounted canvas. No global or disk persistence.
class ChatSession {
  private state: ChatState = { text: '', attachment: null, entries: [] };
  private listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  setter<K extends keyof ChatState>(key: K): Dispatch<SetStateAction<ChatState[K]>> {
    return value => {
      const next = typeof value === 'function' ? (value as (old: ChatState[K]) => ChatState[K])(this.state[key]) : value;
      this.state = { ...this.state, [key]: next };
      this.listeners.forEach(listener => listener());
    };
  }
}
const ChatSessions = createContext<Map<string, ChatSession> | null>(null);
export function SimulationChatProvider({ workflowIds, children }: { workflowIds: string[]; children: ReactNode }) {
  const [sessions] = useState(() => new Map<string, ChatSession>());
  useEffect(() => {
    const open = new Set(workflowIds);
    for (const id of sessions.keys()) if (!open.has(id)) sessions.delete(id);
  }, [sessions, workflowIds]);
  return <ChatSessions.Provider value={sessions}>{children}</ChatSessions.Provider>;
}
export function useSimulationChat(sessionKey?: string) {
  const sessions = useContext(ChatSessions);
  const session = useMemo(() => {
    if (!sessions || !sessionKey) return new ChatSession();
    let existing = sessions.get(sessionKey);
    if (!existing) { existing = new ChatSession(); sessions.set(sessionKey, existing); }
    return existing;
  }, [sessions, sessionKey]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const setters = useMemo(() => ({ setText: session.setter('text'), setAttachment: session.setter('attachment'), setEntries: session.setter('entries') }), [session]);
  return { ...state, ...setters };
}
