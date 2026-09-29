import { useEffect, useState } from 'react';
import type { AppSettings, RotationSettings } from '../types';
import { DEFAULT_BASE_URL } from '../types';
import '../ui/ipcClient';
import { rotateNow } from '../ui/ipcClient';

const INTERVAL_OPTIONS: { label: string; value: number }[] = [
  { label: '15 分钟', value: 15 },
  { label: '30 分钟', value: 30 },
  { label: '1 小时', value: 60 },
  { label: '2 小时', value: 120 },
  { label: '4 小时', value: 240 },
];

const SOURCE_OPTIONS: { label: string; value: 'bing' | 'history' | 'favorites' }[] = [
  { label: 'Bing 每日壁纸', value: 'bing' },
  { label: '历史记录', value: 'history' },
  { label: '我的收藏', value: 'favorites' },
];

const ORDER_OPTIONS: { label: string; value: 'random' | 'newest' }[] = [
  { label: '随机', value: 'random' },
  { label: '最新优先', value: 'newest' },
];

interface SettingsDialogProps {
  open: boolean;
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void> | void;
  onClose: () => void;
}

interface FormErrors {
  baseURL?: string;
  retryLimit?: string;
  retryIntervalMs?: string;
  requestTimeoutMs?: string;
}

function validate(settings: AppSettings): FormErrors {
  const errors: FormErrors = {};
  if (!/^https?:\/\/.+/.test(settings.baseURL)) errors.baseURL = 'Base URL 必须以 http:// 或 https:// 开头';
  if (settings.retryLimit < 0 || settings.retryLimit > 3) errors.retryLimit = '重试次数需在 0~3 之间';
  if (settings.retryIntervalMs < 1500) errors.retryIntervalMs = '重试间隔不能小于 1500ms';
  if (settings.requestTimeoutMs < 60000) errors.requestTimeoutMs = '超时时间不能小于 60000ms';
  return errors;
}

export default function SettingsDialog({ open, settings, onSave, onClose }: SettingsDialogProps) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastRotationAt, setLastRotationAt] = useState<number | null>(null);

  useEffect(() => {
    if (open) { setForm(settings); setErrors({}); setDirty(false); setShowKey(false); }
  }, [open, settings]);

  const handleChange = (field: keyof AppSettings, value: string | number): void => {
    setForm((prev) => ({ ...prev, [field]: value })); setDirty(true); setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleRotationChange = <K extends keyof RotationSettings>(field: K, value: RotationSettings[K]): void => {
    setForm((prev) => ({ ...prev, rotation: { ...prev.rotation, [field]: value } }));
    setDirty(true);
  };

  const handleRotateNow = async (): Promise<void> => {
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    // 先保存当前表单值再触发轮换
    setSaving(true);
    try {
      await onSave(form);
    } catch {
      setSaving(false);
      return;
    }
    // 保存成功后轮换，轮换完成后关闭弹窗
    setSaving(false);
    try {
      const ok = await rotateNow();
      if (ok) {
        setLastRotationAt(Date.now());
        onClose();
      }
    } catch {
      // 后端未就绪时静默失败
    }
  };

  const rotationCountdown = ((): string => {
    if (!form.rotation.enabled) return '已停用';
    const intervalMs = form.rotation.intervalMinutes * 60_000;
    if (!lastRotationAt) return `约 ${form.rotation.intervalMinutes} 分钟后`;
    const nextAt = lastRotationAt + intervalMs;
    const remainMs = nextAt - Date.now();
    if (remainMs <= 0) return '即将轮换';
    const remainMin = Math.ceil(remainMs / 60_000);
    if (remainMin < 60) return `${remainMin} 分钟后`;
    return `${Math.floor(remainMin / 60)} 小时 ${remainMin % 60} 分钟后`;
  })();

  const handleSave = async (): Promise<void> => {
    const v = validate(form); setErrors(v); if (Object.keys(v).length > 0) return;
    setSaving(true);
    try { await onSave(form); setDirty(false); onClose(); }
    catch { /* 保存失败：App 已通过 toast 提示错误，保持弹窗打开便于修改 */ }
    finally { setSaving(false); }
  };

  const handleClose = (): void => { if (dirty && !confirm('有未保存的修改，确定要关闭吗？')) return; onClose(); };

  if (!open) return null;

  void DEFAULT_BASE_URL;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">应用设置</h2>
          <button type="button" className="modal__close" onClick={handleClose}>✕</button>
        </div>
        <div className="modal__body">
          {!settings.apiKey && (
            <div className="banner banner--warning mb-4">
              <span className="banner__icon">⚠️</span>
              <span className="banner__content">尚未配置 API Key，请填写下方字段以启用生成功能</span>
            </div>
          )}
          <div className="field">
            <label className="field__label" htmlFor="settings-baseurl">Base URL</label>
            <input id="settings-baseurl" className="field__input" type="text" placeholder="https://www.likegpt.top/v1" value={form.baseURL} onChange={(e) => handleChange('baseURL', e.target.value)} />
            {errors.baseURL && <span className="field__error">{errors.baseURL}</span>}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="settings-apikey">API Key {!settings.apiKey && <span style={{ color: 'var(--danger)' }}>●</span>}</label>
            <div className="flex gap-2">
              <input id="settings-apikey" className="field__input flex-1" type={showKey ? 'text' : 'password'} placeholder="输入你的 API Key（c2a_xxx）" value={form.apiKey} onChange={(e) => handleChange('apiKey', e.target.value)} />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowKey((v) => !v)}>{showKey ? '隐藏' : '显示'}</button>
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="settings-model">模型名</label>
            <input id="settings-model" className="field__input" type="text" placeholder="qwen-image" value={form.model} onChange={(e) => handleChange('model', e.target.value)} />
          </div>
          <div className="flex gap-4">
            <div className="field flex-1">
              <label className="field__label" htmlFor="settings-retry">重试次数（0~3）</label>
              <input id="settings-retry" className="field__input" type="number" min={0} max={3} value={form.retryLimit} onChange={(e) => handleChange('retryLimit', parseInt(e.target.value, 10) || 0)} />
              {errors.retryLimit && <span className="field__error">{errors.retryLimit}</span>}
            </div>
            <div className="field flex-1">
              <label className="field__label" htmlFor="settings-timeout">请求超时（ms，≥60000）</label>
              <input id="settings-timeout" className="field__input" type="number" min={60000} step={1000} value={form.requestTimeoutMs} onChange={(e) => handleChange('requestTimeoutMs', parseInt(e.target.value, 10) || 60000)} />
              {errors.requestTimeoutMs && <span className="field__error">{errors.requestTimeoutMs}</span>}
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="settings-interval">重试间隔（ms，≥1500）</label>
            <input id="settings-interval" className="field__input" type="number" min={1500} step={100} value={form.retryIntervalMs} onChange={(e) => handleChange('retryIntervalMs', parseInt(e.target.value, 10) || 1500)} />
            {errors.retryIntervalMs && <span className="field__error">{errors.retryIntervalMs}</span>}
          </div>

          {/* === 定时轮换 === */}
          <div className="rotation-section mt-4">
            <div className="rotation-section__header">
              <h3 className="rotation-section__title">定时轮换</h3>
              <label className="rotation-section__switch">
                <input type="checkbox" checked={form.rotation.enabled} onChange={(e) => handleRotationChange('enabled', e.target.checked)} />
                <span className="rotation-section__switch-slider" aria-hidden="true" />
              </label>
            </div>

            <div className={`rotation-section__body${form.rotation.enabled ? '' : ' is-disabled'}`}>
              <div className="rotation-row">
                <div className="rotation-field flex-1">
                  <label className="field__label" htmlFor="rotation-interval">轮换间隔</label>
                  <select id="rotation-interval" className="field__input" value={form.rotation.intervalMinutes} onChange={(e) => handleRotationChange('intervalMinutes', Number(e.target.value))} disabled={!form.rotation.enabled}>
                    {INTERVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="rotation-field flex-1">
                  <label className="field__label" htmlFor="rotation-source">图片来源</label>
                  <select id="rotation-source" className="field__input" value={form.rotation.source} onChange={(e) => handleRotationChange('source', e.target.value as RotationSettings['source'])} disabled={!form.rotation.enabled}>
                    {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="rotation-row">
                <div className="rotation-field flex-1">
                  <label className="field__label" htmlFor="rotation-order">选图顺序</label>
                  <select id="rotation-order" className="field__input" value={form.rotation.order} onChange={(e) => handleRotationChange('order', e.target.value as RotationSettings['order'])} disabled={!form.rotation.enabled}>
                    {ORDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="rotation-field flex-1">
                  <label className="field__label" htmlFor="rotation-next">下次轮换</label>
                  <div id="rotation-next" className="field__input field__input--static">{rotationCountdown}</div>
                </div>
              </div>

              <button type="button" className="btn btn--ghost btn--sm rotation-now-btn" onClick={handleRotateNow} disabled={saving || !form.rotation.enabled}>
                {saving ? '⌾ 保存中…' : '↻ 立即换一张'}
              </button>
            </div>
          </div>
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={() => window.aurora.openLogDir()}>打开日志目录</button>
          <button type="button" className="btn btn--ghost" onClick={handleClose} disabled={saving}>取消</button>
          <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}
