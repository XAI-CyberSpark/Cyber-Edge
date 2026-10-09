import { uiText, useUiLanguage  } from '@/i18n';
import { useEffect, useMemo, useState } from 'react';
import { CarFront, Home, School, Route, Sparkles } from 'lucide-react';

export interface MapStoryboardLandmark {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
  note?: string | null;
}

export interface MapStoryboardSegment {
  id: string;
  label: string;
  from_id: string;
  to_id: string;
  road_type: 'ground' | 'elevated';
  duration_ms: number;
  narrative?: string | null;
}

export interface MapStoryboardEvent {
  id: string;
  label: string;
  event_type: string;
  message: string;
  segment_id?: string | null;
  x?: number | null;
  y?: number | null;
}

export interface MapStoryboardSubtitleCue {
  id: string;
  label: string;
  start_ms: number;
  end_ms: number;
  segment_id?: string | null;
  event_id?: string | null;
  location_label?: string | null;
  trigger?: string | null;
  active_nodes?: string[] | null;
  decision?: string | null;
  narration?: string | null;
}

export interface MapStoryboard {
  title: string;
  summary: string;
  duration_ms: number;
  viewport: string;
  source: string;
  landmarks: MapStoryboardLandmark[];
  segments: MapStoryboardSegment[];
  events: MapStoryboardEvent[];
  subtitle_cues?: MapStoryboardSubtitleCue[];
}

interface MapStoryboardPanelProps {
  storyboard?: MapStoryboard | null;
  isLoading?: boolean;
  onActiveChange?: (payload: {
    currentSegment?: MapStoryboardSegment | null;
    currentEvent?: MapStoryboardEvent | null;
  }) => void;
}

const MAP_WIDTH = 100;
const MAP_HEIGHT = 100;
// SVG viewBox units: approximately 13px in the 260px map viewport.
const MAP_LABEL_SIZE = 5;

function iconForKind(kind: string) {
  if (kind === 'home') {
    return Home;
  }
  if (kind === 'school') {
    return School;
  }
  return Route;
}

function buildPositionMap(landmarks: MapStoryboardLandmark[]) {
  return new Map(landmarks.map((item) => [item.id, item]));
}

function sampleRoutePoints(storyboard: MapStoryboard) {
  const byId = buildPositionMap(storyboard.landmarks);
  const points: Array<{ x: number; y: number; segmentId: string; roadType: 'ground' | 'elevated' }> = [];

  storyboard.segments.forEach((segment) => {
    const start = byId.get(segment.from_id);
    const end = byId.get(segment.to_id);
    if (!start || !end) {
      return;
    }

    const steps = 32;
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      points.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        segmentId: segment.id,
        roadType: segment.road_type,
      });
    }
  });

  return points;
}

export function MapStoryboardPanel({ storyboard, isLoading, onActiveChange }: MapStoryboardPanelProps) {
  useUiLanguage();
  const routePoints = useMemo(() => (storyboard ? sampleRoutePoints(storyboard) : []), [storyboard]);
  const [progressMs, setProgressMs] = useState(0);

  useEffect(() => {
    setProgressMs(0);
  }, [storyboard?.title, storyboard?.summary]);

  useEffect(() => {
    if (!storyboard || storyboard.duration_ms <= 0) {
      return undefined;
    }

    let frameId = 0;
    let startAt = 0;

    const tick = (timestamp: number) => {
      if (!startAt) {
        startAt = timestamp;
      }
      const elapsed = (timestamp - startAt) % storyboard.duration_ms;
      setProgressMs(elapsed);
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [storyboard]);

  const currentIndex = routePoints.length
    ? Math.min(
        routePoints.length - 1,
        Math.floor((progressMs / Math.max(storyboard?.duration_ms || 1, 1)) * routePoints.length),
      )
    : 0;
  const currentPoint = routePoints[currentIndex];
  const currentSegment = storyboard?.segments.find((segment) => segment.id === currentPoint?.segmentId);
  const currentEvent = storyboard?.events.find((event) => event.segment_id === currentSegment?.id) || storyboard?.events[0];
  const currentSubtitle = useMemo(() => {
    if (!storyboard?.subtitle_cues?.length) {
      return null;
    }
    const activeCue = storyboard.subtitle_cues.find((cue) => progressMs >= cue.start_ms && progressMs < cue.end_ms);
    if (activeCue) {
      return activeCue;
    }
    return storyboard.subtitle_cues.find((cue) => cue.segment_id === currentSegment?.id) || storyboard.subtitle_cues[0] || null;
  }, [currentSegment?.id, progressMs, storyboard?.subtitle_cues]);

  useEffect(() => {
    onActiveChange?.({
      currentSegment: currentSegment || null,
      currentEvent: currentEvent || null,
    });
  }, [currentSegment, currentEvent, onActiveChange]);

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="type-panel  text-foreground">{uiText("地图演示")}</h3>
        </div>
        <p className="type-caption text-muted-foreground mt-0.5">
          {uiText("节点编排完成后，自动生成俯视路线动画")}</p>
      </div>

      {!storyboard ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div className="space-y-2 max-w-[280px]">
            <p className="type-body text-foreground">{uiText("等待 AI 编排地图故事板")}</p>
            <p className="type-caption text-muted-foreground">
              {uiText("例如：从家出发，经地面道路上高架，到学校接孩子，再开回家。")}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="px-4 py-3 shrink-0">
            <div className="type-item-title  text-foreground">{uiText(storyboard.title)}</div>
            <div className="type-body text-muted-foreground mt-1">{uiText(storyboard.summary)}</div>
            <div className="type-caption text-muted-foreground mt-1">
              {uiText("来源：")}{uiText(storyboard.source === 'llm' ? uiText("API 编排") : uiText("本地兜底"))}{uiText(isLoading ? uiText(" · 更新中") : '')}
            </div>
          </div>

          <div className="px-4">
            <div className="relative rounded-xl border border-border overflow-hidden bg-slate-950/95">
              <div className="absolute inset-x-0 top-0 z-10 p-3 pointer-events-none">
                <div className="rounded-lg border border-white/10 bg-black/55 backdrop-blur-sm px-3 py-2 shadow-lg">
                  <div className="flex items-center justify-between gap-3 type-caption text-slate-300">
                    <span className="truncate">{uiText(currentSubtitle?.label || currentSegment?.label || uiText("剧情字幕待生成"))}</span>
                    <span className="shrink-0">{uiText(currentSubtitle?.location_label || currentSegment?.label || uiText("等待路线开始"))}</span>
                  </div>
                  <div className="mt-1 type-body  text-white">
                    {uiText(currentSubtitle?.narration || currentSegment?.narrative || currentEvent?.message || uiText("AI 将根据地图故事板生成实时解说字幕。"))}
                  </div>
                  {(currentSubtitle?.trigger || currentSubtitle?.decision) && (
                    <div className="mt-2 grid grid-cols-2 gap-2 type-caption text-slate-200/90">
                      <div className="rounded-md bg-white/5 px-2 py-1.5">
                        <span className="text-slate-400">{uiText("触发情况：")}</span>
                        <span>{uiText(currentSubtitle?.trigger || uiText("根据当前行驶状态自动推进。"))}</span>
                      </div>
                      <div className="rounded-md bg-white/5 px-2 py-1.5">
                        <span className="text-slate-400">{uiText("系统决策：")}</span>
                        <span>{uiText(currentSubtitle?.decision || uiText("沿既定路线继续执行。"))}</span>
                      </div>
                    </div>
                  )}
                  {!!currentSubtitle?.active_nodes?.length && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {currentSubtitle.active_nodes.map((node) => (
                        <span
                          key={`${currentSubtitle.id}_${node}`}
                          className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 type-tag text-cyan-100"
                        >
                          {uiText(node)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="w-full h-[260px] block">
                <defs>
                  <pattern id="city-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" />
                  </pattern>
                  <filter id="elevated-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodColor="#60a5fa" floodOpacity="0.35" />
                  </filter>
                </defs>

                <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="#0f172a" />
                <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#city-grid)" />
                <rect x="6" y="10" width="20" height="14" rx="2" fill="rgba(255,255,255,0.04)" />
                <rect x="74" y="14" width="18" height="10" rx="2" fill="rgba(255,255,255,0.04)" />
                <rect x="72" y="72" width="18" height="12" rx="2" fill="rgba(255,255,255,0.04)" />

                {storyboard.segments.map((segment) => {
                  const start = storyboard.landmarks.find((item) => item.id === segment.from_id);
                  const end = storyboard.landmarks.find((item) => item.id === segment.to_id);
                  if (!start || !end) {
                    return null;
                  }

                  return (
                    <g key={segment.id}>
                      <line
                        x1={start.x}
                        y1={start.y}
                        x2={end.x}
                        y2={end.y}
                        stroke={segment.road_type === 'elevated' ? '#60a5fa' : '#94a3b8'}
                        strokeWidth={segment.road_type === 'elevated' ? 4.4 : 3.2}
                        strokeLinecap="round"
                        opacity={currentSegment?.id === segment.id ? 1 : 0.72}
                        filter={segment.road_type === 'elevated' ? 'url(#elevated-shadow)' : undefined}
                      />
                    </g>
                  );
                })}

                {storyboard.landmarks.map((landmark) => {
                  const Icon = iconForKind(landmark.kind);
                  return (
                    <g key={landmark.id}>
                      <circle cx={landmark.x} cy={landmark.y} r="3.7" fill="#111827" stroke="#f8fafc" strokeWidth="1" />
                      <foreignObject x={landmark.x - 3.5} y={landmark.y - 3.5} width="7" height="7">
                        <div className="w-full h-full flex items-center justify-center text-white">
                          <Icon className="w-3 h-3" />
                        </div>
                      </foreignObject>
                      <text x={landmark.x + 4.5} y={landmark.y - 4.5} fill="#e2e8f0" fontSize={MAP_LABEL_SIZE}>
                        {uiText(landmark.label)}
                      </text>
                    </g>
                  );
                })}

                {currentPoint && (
                  <g>
                    <circle cx={currentPoint.x} cy={currentPoint.y} r="4.2" fill="rgba(14,165,233,0.25)" />
                    <circle cx={currentPoint.x} cy={currentPoint.y} r="2.3" fill="#38bdf8" stroke="#f8fafc" strokeWidth="0.8" />
                    <foreignObject x={currentPoint.x - 3} y={currentPoint.y - 3} width="6" height="6">
                      <div className="w-full h-full flex items-center justify-center text-white">
                        <CarFront className="w-3 h-3" />
                      </div>
                    </foreignObject>
                  </g>
                )}
              </svg>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-border type-body">
            <div className="text-foreground font-medium">
              {uiText("当前路段：")}{uiText(currentSegment?.label || uiText("等待开始"))}
            </div>
            <div className="text-muted-foreground mt-1">
              {uiText(currentSubtitle?.narration || currentSegment?.narrative || currentEvent?.message || uiText("AI 将根据故事板自动演示行驶过程。"))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {storyboard.segments.map((segment) => (
              <div
                key={segment.id}
                className={`rounded-lg border px-3 py-2 transition-colors ${
                  currentSegment?.id === segment.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background/60'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="type-label  text-foreground">{uiText(segment.label)}</div>
                  <div className="type-caption text-muted-foreground">
                    {segment.road_type === 'elevated' ? uiText("高架") : uiText("地面")}
                  </div>
                </div>
                {segment.narrative && (
                  <div className="type-body text-muted-foreground mt-1">{uiText(segment.narrative)}</div>
                )}
                {storyboard.subtitle_cues?.find((cue) => cue.segment_id === segment.id)?.narration && (
                  <div className="type-body text-foreground/80 mt-1.5">
                    {uiText(storyboard.subtitle_cues.find((cue) => cue.segment_id === segment.id)?.narration)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
