import { Chat } from '../ui/chat.js';

/** AI 智慧講堂：在內容面板裡放一個完整的對話介面。問過一個問題就算完成這一站。 */
export function mount(el, spot, ctx) {
  const box = document.createElement('div');
  box.className = 'lecture-chat';
  el.appendChild(box);
  const chat = new Chat(box, { getZone: () => ctx.zoneOf('lecture'), title: 'AI 智慧講堂' });
  import('../ui/voice.js').then(({ voice }) => voice.say('歡迎來到 AI 智慧講堂。說說你生活中遇到的情況，我們一起想想三好四給可以怎麼做。', 'ai'));
  const unsub = ctx.onChat(() => { if (!ctx.isDone(spot.id)) ctx.complete(spot.id); });
  ctx.registerChat(chat);
  return () => { unsub(); ctx.registerChat(null); };
}
