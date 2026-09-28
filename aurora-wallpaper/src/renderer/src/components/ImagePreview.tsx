import { useEffect } from 'react';

interface ImagePreviewProps {
  src: string;
  title: string;
  onClose: () => void;
}

/** 大图预览 lightbox：点击遮罩、关闭按钮或按 Esc 关闭 */
export default function ImagePreview({ src, title, onClose }: ImagePreviewProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="preview-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title || '图片预览'}>
      <button type="button" className="preview__close" onClick={onClose} aria-label="关闭预览">✕</button>
      <img className="preview__img" src={src} alt={title || '预览图片'} />
      {title && <p className="preview__title" title={title}>{title}</p>}
    </div>
  );
}
