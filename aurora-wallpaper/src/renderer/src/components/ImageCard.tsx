/**
 * Aurora Wallpaper — 单张结果卡片
 *
 * 三种形态：已有本地图片（record.filePath）/ 生成中骨架占位 / 失败态。
 * 状态徽标文案随 GenerateProgress.status 变化。
 */

import type { GenerateProgress, WallpaperRecord } from '../../../shared/types';

interface ImageCardProps {
  /** 壁纸记录（生成完成或来自历史时非空） */
  record: WallpaperRecord | null;
  /** 批量生成进度（该槽位正在生成时非空） */
  progress: GenerateProgress | null;
  /** 是否被选作图生图参考 */
  selected: boolean;
  /** 设为壁纸（传记录 id） */
  onSetWallpaper: (id: string) => void;
  /** 切换参考选中状态 */
  onToggleReference: (record: WallpaperRecord) => void;
}

/** 状态徽标文案 */
function statusLabel(progress: GenerateProgress): string {
  switch (progress.status) {
    case 'pending':
      return '排队中';
    case 'requesting':
      return '生成中';
    case 'retrying':
      return `第 ${Math.max(progress.attempts - 1, 1)} 次重试`;
    case 'downloading':
      return '下载转存中';
    case 'done':
      return '完成';
    case 'failed':
      return '失败';
  }
}

export default function ImageCard({
  record,
  progress,
  selected,
  onSetWallpaper,
  onToggleReference,
}: ImageCardProps) {
  const hasImage = record !== null && record.filePath !== '';
  const isFailed = progress !== null && progress.status === 'failed';
  const canSetWallpaper = record !== null && (progress === null || progress.status === 'done');

  return (
    <article className={selected ? 'image-card image-card--selected' : 'image-card'}>
      <div className="image-card__media">
        {hasImage && record !== null ? (
          <img
            className="image-card__img"
            src={record.filePath}
            alt={record.rawInput !== '' ? record.rawInput : '生成的壁纸'}
            loading="lazy"
          />
        ) : (
          <div className="image-card__skeleton" data-status={progress !== null ? progress.status : 'idle'}>
            <span className="image-card__skeleton-text">
              {progress !== null ? statusLabel(progress) : '等待生成'}
            </span>
          </div>
        )}
        {progress !== null && (
          <span className={`image-card__badge image-card__badge--${progress.status}`}>
            {statusLabel(progress)}
          </span>
        )}
      </div>

      <div className="image-card__meta">
        {progress !== null && progress.attempts > 0 && (
          <span className="image-card__attempts">已尝试 {progress.attempts} 次</span>
        )}
        {isFailed && progress !== null && (
          <p className="image-card__error-text">
            {progress.message ?? '生成失败，请检查网络与 API 配置后重试'}
          </p>
        )}
      </div>

      <div className="image-card__actions">
        <button
          type="button"
          className="image-card__btn"
          disabled={!canSetWallpaper}
          onClick={() => {
            if (record !== null) onSetWallpaper(record.id);
          }}
        >
          设为壁纸
        </button>
        <label className={hasImage ? 'image-card__check' : 'image-card__check image-card__check--disabled'}>
          <input
            type="checkbox"
            checked={selected}
            disabled={!hasImage}
            onChange={() => {
              if (record !== null) onToggleReference(record);
            }}
          />
          <span>选作参考</span>
        </label>
      </div>
    </article>
  );
}
