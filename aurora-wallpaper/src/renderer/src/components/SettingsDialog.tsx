import { useEffect, useState } from 'react';
import type { AppSettings } from '../types';
import { DEFAULT_BASE_URL } from '../types';

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

  useEffect(() => {
    if (open) { setForm(settings); setErrors({}); setDirty(false); setShowKey(false); }
  }, [open, settings]);

  const handleChange = (field: keyof AppSettings, value: string | number): void => {
    setForm((prev) => ({ ...prev, [field]: value })); setDirty(true); setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

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
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={handleClose} disabled={saving}>取消</button>
          <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}
