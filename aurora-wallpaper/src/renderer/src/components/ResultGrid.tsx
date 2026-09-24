/**
 * Aurora Wallpaper — 结果网格
 *
 * 批量生成槽位 + 历史记录的统一网格容器。
 * 布局约定（part-b 写样式）：grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))。
 */

import type { GenerateProgress, WallpaperRecord } from '../../../shared/types';
import ImageCard from './ImageCard';

/** 网格单项：record 与 progress 至少其一非空（生成中槽位 record 为空） */
export interface ResultGridItem {
  record: WallpaperRecord | null;
  progress: GenerateProgress | null;
  selected: boolean;
}

interface ResultGridProps {
  items: ResultGridItem[];
  onSetWallpaper: (id: string) => void;
  onToggleReference: (record: WallpaperRecord) => void;
}

export default function ResultGrid({ items, onSetWallpaper, onToggleReference }: ResultGridProps) {
  if (items.length === 0) {
    return <div className="result-grid result-grid--empty">暂无生成结果，输入描述开始创作吧</div>;
  }

  return (
    <div className="result-grid">
      {items.map((item, index) => (
        <ImageCard
          key={item.record !== null ? item.record.id : `slot-${index}`}
          record={item.record}
          progress={item.progress}
          selected={item.selected}
          onSetWallpaper={onSetWallpaper}
          onToggleReference={onToggleReference}
        />
      ))}
    </div>
  );
}
