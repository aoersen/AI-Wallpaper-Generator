import type { GenerateProgress, WallpaperRecord } from '../types';

interface ImageCardProps {
  record: WallpaperRecord | null;
  progress: GenerateProgress | null;
  selected: boolean;
  onSetWallpaper: (id: string) => void;
  onToggleReference: (record: WallpaperRecord) => void;
  onPreview: (record: WallpaperRecord) => void;
}

function statusLabel(progress: GenerateProgress): string {
  switch (progress.status) {
    case 'pending': return '排队中';
    case 'requesting': return '生成中';
    case 'retrying': return `第 ${Math.max(progress.attempts - 1, 1)} 次重试`;
    case 'downloading': return '下载转存中';
    case 'done': return '完成';
    case 'failed': return '失败';
  }
}

export default function ImageCard({ record, progress, selected, onSetWallpaper, onToggleReference, onPreview }: ImageCardProps) {
  const hasImage = record !== null && record.filePath !== '';
  const isFailed = progress !== null && progress.status === 'failed';
  const isGenerating = progress !== null && !['done', 'failed'].includes(progress.status);
  const canSetWallpaper = record !== null && (progress === null || progress.status === 'done');

  return (
    <div className={selected ? 'image-card image-card--selected' : 'image-card'}>
      <div className="image-card__media">
        {hasImage && record ? (
          <img
            className="image-card__img" src={record.filePath} alt={record.rawInput || '生成的壁纸'} loading="lazy"
            role="button" tabIndex={0} aria-label="查看大图"
            onClick={() => onPreview(record)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPreview(record); } }}
          />
        ) : (
          <div className={`image-card__skeleton${isGenerating ? ' image-card__skeleton--active' : ''}`}>
            <div className="image-card__skeleton-content">
              <span className="image-card__skeleton-icon">{progress ? '⏳' : '🖼️'}</span>
              <span className="text-sm text-dim">{progress ? statusLabel(progress) : '等待生成'}</span>
            </div>
          </div>
        )}
        {progress && <span className={`status-badge status-badge--${progress.status}`}>{statusLabel(progress)}</span>}
      </div>

      <div className="image-card__footer">
        {record && <p className="image-card__prompt" title={record.rawInput}>{record.rawInput.length > 40 ? `${record.rawInput.slice(0, 40)}…` : record.rawInput}</p>}
        {isFailed && progress?.message && <p className="image-card__error">{progress.message}</p>}
        <div className="flex items-center gap-2 mt-2">
          {record && (
            <>
              <button className="btn btn--primary btn--sm" disabled={!canSetWallpaper} onClick={() => onSetWallpaper(record.id)}>设为壁纸</button>
              <label className="image-card__check">
                <input type="checkbox" checked={selected} onChange={() => onToggleReference(record)} />
                <span>参考</span>
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
