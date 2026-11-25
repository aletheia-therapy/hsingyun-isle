import { VIDEOS, VIDEO_GROUPS } from '../data/videos.js';
import { esc } from '../ui/chat.js';
import { voice } from '../ui/voice.js';

/** 善念影音堂：延伸觀看的公開影片（以新視窗開啟） */
export function mount(el, spot, ctx) {
  el.innerHTML = `
    <div class="vd">
      ${VIDEO_GROUPS.map((g) => `
        <section class="vd-g"><h3>${esc(g.h)}</h3>
          ${g.ids.map((id) => { const v = VIDEOS[id]; return `<a class="video-link" href="${esc(v.u)}" target="_blank" rel="noopener"><span class="play" aria-hidden="true">▶</span><span><b>${esc(v.t)}</b><small>${esc(v.by)}・${esc(v.d)}</small></span></a>`; }).join('')}
        </section>`).join('')}
      <p class="exp-hint">影片由原頻道公開提供，本作品僅提供連結，不轉載內容。</p>
    </div>`;
  voice.say('歡迎來到善念影音堂。這裡收藏著佛光山與人間衛視的公開影片，點選就能觀看三好四給在世界各地的故事。', 'narrator');
  ctx.complete(spot.id);
  return () => voice.stop();
}
