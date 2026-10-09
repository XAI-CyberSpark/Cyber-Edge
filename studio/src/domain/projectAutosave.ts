import { apiUrl } from '@/lib/api';

export interface SavedProject {
  id?: string;
  file_name?: string;
  name: string;
  nodes: Array<Record<string, any>>;
  edges: Array<Record<string, any>>;
  meta?: Record<string, any>;
  updated_at?: number;
}
export type SaveState = { status: 'pending' | 'saving' | 'saved' | 'error' | 'conflict'; recovery: boolean };
const PREFIX = 'oakegde-project-draft-v1:';
export function recoveredProjects(): Array<{ key: string; project: SavedProject }> {
  try {
    const drafts = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)!;
      if (!key.startsWith(PREFIX)) continue;
      try {
        const project = JSON.parse(window.localStorage.getItem(key)!);
        if (typeof project.name === 'string' && Array.isArray(project.nodes) && Array.isArray(project.edges)) drafts.push({ key: key.slice(PREFIX.length), project });
      } catch { /* A damaged record must not prevent other projects from opening. */ }
    }
    return drafts;
  } catch { return []; }
}
export function projectContent(project: SavedProject): string {
  return JSON.stringify({ name: project.name, nodes: project.nodes, edges: project.edges, meta: project.meta || {} });
}
interface Entry {
  project: SavedProject;
  saved: string;
  state: SaveState;
  timer?: ReturnType<typeof setTimeout>;
  running?: Promise<boolean>;
  retry: number;
}

// One writer per open project. A response acknowledges only the snapshot it received.
export class ProjectAutosave {
  private entries = new Map<string, Entry>();
  private disposed = false;
  private changed: (key: string, state: SaveState, saved?: SavedProject, content?: string) => void;
  constructor(changed: (key: string, state: SaveState, saved?: SavedProject, content?: string) => void) { this.changed = changed; }

  resume() {
    this.disposed = false;
    for (const [key, entry] of this.entries) if (!entry.running && entry.state.status !== 'conflict' && entry.saved !== projectContent(entry.project)) {
      clearTimeout(entry.timer); entry.timer = setTimeout(() => void this.flush(key), 800);
    }
  }
  seed(key: string, project: SavedProject) {
    if (!this.entries.has(key)) this.entries.set(key, { project, saved: projectContent(project), state: { status: 'saved', recovery: true }, retry: 0 });
  }
  private journal(key: string, entry: Entry) {
    try { window.localStorage.setItem(PREFIX + key, JSON.stringify(entry.project)); entry.state.recovery = true; }
    catch { entry.state.recovery = false; }
  }
  private emit(key: string, entry: Entry) { if (!this.disposed) this.changed(key, { ...entry.state }); }
  enqueue(key: string, project: SavedProject) {
    if (this.disposed) return;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { project, saved: '', state: { status: 'pending', recovery: true }, retry: 0 };
      this.entries.set(key, entry);
    } else {
      if (projectContent(project) === projectContent(entry.project)) return;
      entry.project = { ...project, id: entry.project.id, file_name: entry.project.file_name, updated_at: entry.project.updated_at };
    }
    if (projectContent(entry.project) === entry.saved) return;
    this.journal(key, entry);
    if (entry.state.status !== 'conflict' && entry.state.status !== 'error') entry.state.status = entry.running ? 'saving' : 'pending';
    this.emit(key, entry);
    if (!entry.timer && !entry.running && entry.state.status !== 'conflict') entry.timer = setTimeout(() => void this.flush(key), 800);
  }
  async flush(key: string): Promise<boolean> {
    const entry = this.entries.get(key);
    if (!entry || this.disposed) return true;
    clearTimeout(entry.timer); entry.timer = undefined;
    if (entry.running) { await entry.running; return entry.state.status === 'conflict' || entry.state.status === 'error' ? false : this.flush(key); }
    if (entry.saved === projectContent(entry.project)) return true;
    if (entry.state.status === 'conflict') return false;
    const snapshot = { ...entry.project };
    const content = projectContent(snapshot);
    entry.state.status = 'saving'; this.emit(key, entry);
    entry.running = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(apiUrl('/v1/projects/autosave'), {
          method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...snapshot, autosave: true, expected_updated_at: snapshot.updated_at ?? null }),
        });
        if (this.entries.get(key) !== entry) return false;
        if (response.status === 409) { entry.state.status = 'conflict'; this.journal(key, entry); this.emit(key, entry); return false; }
        if (!response.ok) throw new Error('save failed');
        const saved = await response.json() as SavedProject;
        if (typeof saved.id !== 'string' || typeof saved.file_name !== 'string' || typeof saved.updated_at !== 'number') throw new Error('invalid save response');
        entry.saved = content; entry.retry = 0;
        entry.project = { ...entry.project, id: saved.id, file_name: saved.file_name, updated_at: saved.updated_at };
        const current = projectContent(entry.project) === content;
        entry.state.status = current ? 'saved' : 'pending';
        if (current) {
          try {
            const raw = window.localStorage.getItem(PREFIX + key);
            if (raw && projectContent(JSON.parse(raw)) === content) window.localStorage.removeItem(PREFIX + key);
          } catch { /* Server acknowledgement is sufficient for the saved state. */ }
        } else this.journal(key, entry);
        if (!this.disposed) this.changed(key, { ...entry.state }, saved, content);
        return current;
      } catch {
        entry.state.status = 'error'; this.journal(key, entry); this.emit(key, entry); return false;
      } finally {
        clearTimeout(timeout);
        entry.running = undefined;
        if (!this.disposed && this.entries.get(key) === entry && entry.state.status !== 'conflict' && entry.saved !== projectContent(entry.project)) {
          const delay = entry.state.status === 'error' ? Math.min(30000, 5000 * 2 ** entry.retry++) : 800;
          entry.timer = setTimeout(() => void this.flush(key), delay);
        }
      }
    })();
    const result = await entry.running;
    if (!result && !['error', 'conflict'].includes(entry.state.status)) return this.flush(key);
    return result;
  }
  // Deleting a project must not let a scheduled save recreate its file.
  forget(key: string) {
    const entry = this.entries.get(key); clearTimeout(entry?.timer); this.entries.delete(key);
    try { window.localStorage.removeItem(PREFIX + key); } catch { /* Reported by the next journal write. */ }
  }
  dispose() { this.disposed = true; for (const entry of this.entries.values()) { clearTimeout(entry.timer); entry.timer = undefined; } }
}

// React Flow measurements and selection are view state, not project edits.
export function persistentGraph(nodes: Array<Record<string, any>>, edges: Array<Record<string, any>>) {
  return {
    nodes: nodes.map(({ selected: _selected, dragging: _dragging, measured: _measured, resizing: _resizing, width: _width, height: _height, positionAbsolute: _position, ...node }) => node),
    edges: edges.map(({ selected: _selected, ...edge }) => edge),
  };
}
