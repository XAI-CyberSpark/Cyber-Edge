export type HmiWidgetCategory = 'navigation' | 'media' | 'gallery' | 'schedule';
export const HMI_WIDGET_CATALOG = [
  {
    "id": "navigation-map",
    "nodeId": "1:19697",
    "name": "地图导航",
    "category": "navigation",
    "width": 464,
    "height": 464
  },
  {
    "id": "navigation-guidance",
    "nodeId": "1:19749",
    "name": "车道指引",
    "category": "navigation",
    "width": 464,
    "height": 464
  },
  {
    "id": "navigation-shortcuts",
    "nodeId": "1:19904",
    "name": "导航快捷入口",
    "category": "navigation",
    "width": 464,
    "height": 216
  },
  {
    "id": "navigation-turn",
    "nodeId": "1:19950",
    "name": "转向提示",
    "category": "navigation",
    "width": 464,
    "height": 216
  },
  {
    "id": "media-player",
    "nodeId": "1:19852",
    "name": "音乐播放器",
    "category": "media",
    "width": 464,
    "height": 216
  },
  {
    "id": "media-daily",
    "nodeId": "1:20054",
    "name": "每日30首",
    "category": "media",
    "width": 464,
    "height": 216
  },
  {
    "id": "media-audiobook",
    "nodeId": "1:19889",
    "name": "精选有声书",
    "category": "media",
    "width": 216,
    "height": 216
  },
  {
    "id": "media-mv",
    "nodeId": "1:19897",
    "name": "每日精选MV",
    "category": "media",
    "width": 216,
    "height": 216
  },
  {
    "id": "media-source",
    "nodeId": "1:20071",
    "name": "媒体来源",
    "category": "media",
    "width": 464,
    "height": 336
  },
  {
    "id": "gallery-large",
    "nodeId": "1:19846",
    "name": "图库大卡",
    "category": "gallery",
    "width": 464,
    "height": 464
  },
  {
    "id": "gallery-wide",
    "nodeId": "1:19968",
    "name": "图库横卡",
    "category": "gallery",
    "width": 464,
    "height": 216
  },
  {
    "id": "schedule-event",
    "nodeId": "1:19974",
    "name": "日程卡",
    "category": "schedule",
    "width": 464,
    "height": 216
  },
  {
    "id": "schedule-month",
    "nodeId": "1:19996",
    "name": "月历",
    "category": "schedule",
    "width": 464,
    "height": 464
  }
] as const;
export type HmiWidgetId = typeof HMI_WIDGET_CATALOG[number]['id'];
export type HmiWidgetAction =
  | { type: 'navigation.destination'; destination: string }
  | { type: 'navigation.search'; query: string; kind: 'place' | 'favorite' | 'fuel' }
  | { type: 'media.playback'; track: string; playing: boolean }
  | { type: 'media.favorite'; track: string; favorite: boolean }
  | { type: 'media.source'; source: 'online' | 'radio' | 'bluetooth' | 'usb' }
  | { type: 'gallery.open'; photoId: string }
  | { type: 'calendar.open'; date: string };
export interface HmiWidgetData {
  navigation?: { destination?: string; road?: string; distanceMeters?: number };
  media?: { title?: string; artist?: string; playing?: boolean; favorite?: boolean; source?: 'online' | 'radio' | 'bluetooth' | 'usb'; coverUrl?: string };
  gallery?: { photoUrl?: string; dateLabel?: string; yearLabel?: string };
  calendar?: { date?: string; day?: string; weekday?: string; eventTitle?: string; timeRange?: string; monthLabel?: string; dayLabels?: string[] };
}
/** Optional host adapter. Resolve only after the host has applied the action; reject on failure.
 * Prop data remains authoritative. Implementations must honor signal and not commit after cancellation. */
export interface HmiWidgetAdapter {
  execute: (action: HmiWidgetAction, context: { signal: AbortSignal }) => Promise<{ status: 'applied' | 'unavailable'; message: string }>;
}
export const HMI_WIDGET_CAPABILITIES = [
  { id: 'navigation', name: '导航', reserved: ['目的地搜索', '路线与车道数据', '收藏地点', '加油站查询'] },
  { id: 'media', name: '音乐', reserved: ['播放控制与进度', '媒体来源', '收藏', '推荐列表'] },
  { id: 'gallery', name: '图库', reserved: ['照片列表', '日期元数据', '全屏查看'] },
  { id: 'schedule', name: '日程', reserved: ['日程列表', '月历数据', '打开日程'] },
] as const;
