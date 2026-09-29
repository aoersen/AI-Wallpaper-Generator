import type { GenerateProgress, WallpaperRecord } from '../types';
import ImageCard from './ImageCard';

export interface ResultGridItem {
  record: WallpaperRecord | null;
  progress: GenerateProgress | null;
  selected: boolean;
}

interface ResultGridProps {
  items: ResultGridItem[];
  onSetWallpaper: (id: string) => void;
  onToggleReference: (record: WallpaperRecord) => void;
  onPreview: (record: WallpaperRecord) => void;
  resolveImgSrc: (filePath: string | undefined) => string;
}

export default function ResultGrid({ items, onSetWallpaper, onToggleReference, onPreview, resolveImgSrc }: ResultGridProps) {
  if (items.length === 0) {
    return (
      <div className="empty">
        <span className="empty__icon">🎨</span>
        <p className="empty__title">开始你的创作</p>
        <p className="empty__desc">输入描述，生成专属壁纸</p>
      </div>
    );
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
          onPreview={onPreview}
          resolveImgSrc={resolveImgSrc}
        />
      ))}
    </div>
  );
}
