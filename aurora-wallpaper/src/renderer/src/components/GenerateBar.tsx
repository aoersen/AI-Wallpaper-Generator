import type { GenerateMode } from '../types';

interface GenerateBarProps {
  count: number;
  onCountChange: (count: number) => void;
  mode: GenerateMode;
  onGenerate: () => void;
  generating: boolean;
  hasReference: boolean;
  onClearReferences: () => void;
  doneCount: number;
  failedCount: number;
  onCancel: () => void;
}

const COUNT_OPTIONS = [1, 2, 3, 4] as const;

export default function GenerateBar({
  count, onCountChange, mode, onGenerate, generating, hasReference, onClearReferences, doneCount, failedCount, onCancel,
}: GenerateBarProps) {
  const modeText = mode === 'text-to-image' ? '文生图' : hasReference ? '图生图（含参考图）' : '图生图';

  return (
    <div className="generate-bar card">
      <div className="card__body flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-dim">数量</span>
          <div className="tabs" role="radiogroup" aria-label="生成数量">
            {COUNT_OPTIONS.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={count === n}
                className={count === n ? 'tabs__tab tabs__tab--active' : 'tabs__tab'}
                disabled={generating} onClick={() => onCountChange(n)}>{n} 张</button>
            ))}
          </div>
        </div>
        <span className="badge badge--brand">{modeText}</span>
        {generating ? (
          <button type="button" className="btn btn--danger btn--lg" onClick={onCancel}>取消生成</button>
        ) : (
          <button type="button" className="btn btn--primary btn--lg" onClick={onGenerate}>生成 {count} 张</button>
        )}
        {generating && (doneCount > 0 || failedCount > 0) && (
          <span className="text-sm text-dim">已完成 {doneCount} 张{failedCount > 0 ? `，失败 ${failedCount} 张` : ''}</span>
        )}
        {hasReference && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-dim">已选参考图</span>
            <button type="button" className="btn btn--ghost btn--sm" disabled={generating} onClick={onClearReferences}>清除参考图</button>
          </div>
        )}
      </div>
    </div>
  );
}
