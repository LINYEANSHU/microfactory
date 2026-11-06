// Keep startup failures recoverable, including browsers without a WebGL 2 context.
import { getLang } from './ui/i18n';

import('./main').catch(error => {
  console.error('MicroFactory startup failed', error);
  const zh = getLang() === 'zh';
  document.getElementById('ui')?.remove();
  const root = document.getElementById('app')!;
  root.className = 'startup-error';
  root.innerHTML = `<div role="alert"><h1>${zh ? '工厂暂时无法启动' : 'The factory could not start'}</h1><p>${zh ? '浏览器未能完成 3D 场景初始化。请使用支持 WebGL 2 的浏览器重试。已有浏览器存档会保留。' : 'The browser could not initialize the 3D scene. Try again in a browser that supports WebGL 2. Your existing browser save is preserved.'}</p><button class="btn primary">${zh ? '重试' : 'Try again'}</button></div>`;
  root.querySelector('button')!.addEventListener('click', () => location.reload());
});
