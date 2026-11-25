import { Chat } from '../ui/chat.js';

/** AI 智慧講堂：在內容面板裡放一個完整的對話介面。問過一個問題就算完成這一站。 */
export function mount(el, spot, ctx) {
  const box = document.createElement('div');
  box.className = 'lecture-chat';
  el.appendChild(box);
  const chat = new Chat(box, { getZone: () => ctx.zoneOf('lecture'), title: 'AI 智慧講堂' });
  const unsub = ctx.onChat(() => { if (!ctx.isDone(spot.id)) ctx.complete(spot.id); });
  ctx.registerChat(chat);
  return () => { unsub(); ctx.registerChat(null); };
}
