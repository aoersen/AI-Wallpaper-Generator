import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('未找到 #root 挂载节点');
}

// preload 未成功注入时显示可见错误，而不是整页白屏（sandbox 下 preload 加载失败会导致 window.aurora 缺失）
if (!window.aurora) {
  rootElement.innerHTML = '';
  const message = document.createElement('div');
  message.style.cssText =
    'max-width: 560px; margin: 20vh auto 0; padding: 24px; font: 14px/1.8 system-ui, sans-serif; color: #e5484d; background: #fff; border: 1px solid #f3c1c3; border-radius: 8px; text-align: center;';
  message.textContent =
    '界面初始化失败：预加载脚本未注入（window.aurora 缺失）。请重启应用；若仍出现，请打开日志目录查看错误。';
  rootElement.appendChild(message);
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
