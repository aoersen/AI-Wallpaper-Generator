/**
 * Aurora Wallpaper — 生成操作条
 *
 * 数量单选（1~4 张）+ 模式徽标（文生图/图生图）+ 生成按钮（含进度）+ 参考图提示条。
 */

import type { GenerateMode } from '../../../shared/types';

interface GenerateBarProps {
  /** 生成数量（1~4） */
  count: number;
  onCountChange: (count: number) => void;
  /** 当前生成模式 */
  mode: GenerateMode;
  /** 触发生成 */
  onGenerate: () => void;
  /** 是否正在生成中 */
  generating: boolean;
  /** 是否已选择参考图 */
  hasReference: boolean;
  /** 清除全部参考图 */
  onClearReferences: () => void;
  /** 当前批次总数（生成中显示 x/y 用） */
  batchSize: number;
  /** 当前批次已完成数 */
  doneCount: number;
  /** 当前批次失败数 */
  failedCount: number;
}

const COUNT_OPTIONS = [1, 2, 3, 4] as const;

export default function GenerateBar({
  count,
  onCountChange,
  mode,
  onGenerate,
  generating,
  hasReference,
  onClearReferences,
  batchSize,
  doneCount,
  failedCount,
}: GenerateBarProps) {
  const finished = doneCount + failedCount;
  const total = batchSize > 0 ? batchSize : count;
  const modeText = mode === 'text-to-image' ? '文生图' : hasReference ? '图生图（含参考图）' : '图生图';

  return (
    <div className="generate-bar">
      <div className="generate-bar__counts" role="radiogroup" aria-label="生成数量">
        <span className="generate-bar__label">数量</span>
        {COUNT_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={count === n}
            className={count === n ? 'generate-bar__count generate-bar__count--active' : 'generate-bar__count'}
            disabled={generating}
            onClick={() => onCountChange(n)}
          >
            {n} 张
          </button>
        ))}
      </div>

      <span className={`generate-bar__mode generate-bar__mode--${mode}`}>{modeText}</span>

      <button type="button" className="generate-bar__btn" disabled={generating} onClick={onGenerate}>
        {generating ? `生成中 ${finished}/${total}` : `生成 ${count} 张`}
      </button>

      {generating && (doneCount > 0 || failedCount > 0) && (
        <span className="generate-bar__stats">
          已完成 {doneCount} 张{failedCount > 0 ? `，失败 ${failedCount} 张` : ''}
        </span>
      )}

      {hasReference && (
        <div className="generate-bar__refs">
          <span className="generate-bar__refs-text">已选择参考图，将使用图生图模式生成</span>
          <button type="button" className="generate-bar__refs-clear" disabled={generating} onClick={onClearReferences}>
            清除参考图
          </button>
        </div>
      )}
    </div>
  );
}
