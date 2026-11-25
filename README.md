# 星雲之島：AI 人間佛教探索與實踐平台

Fo Guang Wisdom Island – An AI-Powered Humanistic Buddhism Experience
2026 三好 AI 創新應用競賽｜大專組 B 類（AI 數位應用實作類）參賽作品

走進大師的智慧，讓佛法在生活中實踐。一座可以在瀏覽器中直接走進去的 3D 島嶼：
**探索 → 學習 → AI 對話 → 三好四給任務 → 願行實踐**。

## 五大區域

| 區域 | 地點 | 互動 |
|---|---|---|
| 一、生命之路 | 生命長廊、時光碑林 | 12 個節點的生命時間軸（附出處、可請 AI 延伸）；年份排序遊戲＋小測驗 |
| 二、智慧之境 | 人間佛教殿、四宗旨苑 | 點亮「佛說的、人要的、淨化的、善美的」四盞燈＋六項特質翻卡；四大宗旨分類遊戲 |
| 三、善念實踐園 | 七座亭子 | 三好（做好事、說好話、存好心）＋四給（信心、歡喜、希望、方便）七個生活情境；選擇後 AI 分析影響，再寫一句自己的話請 AI 回饋 |
| 四、AI 智慧講堂 | 講堂＋隨處可開的 AI 導覽 | RAG 問答，三種模式：知識導覽、思想理解、生活實踐；每則回答附可追溯出處 |
| 五、願行之境 | 山頂願行台 | 旅程回顧、AI 學習回饋與挑戰建議、產生可下載的願行卡（1080×1350 PNG） |

## 技術架構

- 前端：原生 ES Modules ＋ Three.js r160（已內附於 `vendor/`，不依賴外部 CDN），無建置步驟。
- 3D：程序化生成的地形、曲面起翹屋頂、殿宇、亭子、牌坊、七層塔、松竹梅與蓮池；旅人沿步道網以最短路徑行走。
- AI：
  - `src/ai/retrieve.js`：中文 BM25（單字＋雙字）檢索，前後端共用。
  - `src/ai/prompts.js`：系統規則（不冒充大師、不捏造語錄、資料不足時明說、附出處編號、不做心理診斷）＋檢索段落。
  - `api/ai.js`：Vercel Serverless Function，金鑰只放伺服器環境變數；含輸入驗證、每 IP 每分鐘 12 次與全站每日上限、匿名互動紀錄。
  - `src/ai/client.js`：正式站呼叫 `/api/ai`；在 claude.ai 預覽時改用平台內建 Claude；兩者都無法使用時明確標示「AI 暫時無法連線」，只顯示知識庫原文，**不會把固定文字偽裝成 AI 回答**。
- 知識庫：`src/data/kb.js`（36 段，生平／人間佛教／三好四給），每段標註來源；來源清單在 `src/data/sources.js`。
- 進度：`localStorage`，不需登入。

## 部署（Vercel）

1. 把本資料夾推到 GitHub 新的儲存庫。
2. 在 Vercel 匯入該儲存庫（Framework Preset 選 **Other**，不需要 Build Command）。
3. 到 **Settings → Environment Variables** 新增：
   - `ANTHROPIC_API_KEY`：Claude API 金鑰（必填其一）
   - `AI_MODEL`：選填，預設 `claude-haiku-5-5`
   - 或改用 `OPENAI_API_KEY`（＋選填 `OPENAI_MODEL`，預設 `gpt-4o-mini`）
   - `AI_DAILY_CAP`：選填，全站每日請求上限，預設 4000
4. 重新部署。打開 `https://你的網址/api/ai` 應看到 `{"ok":true,"ai":true}`。
5. 實際在講堂問一題，確認回答下方顯示「AI 即時生成・依據島上知識庫」。

本機預覽：`python3 -m http.server 8000` 後開 `http://localhost:8000`（沒有後端時 AI 會顯示離線狀態）。
本機連同 AI 一起測：`npx vercel dev`（需先設定環境變數）。

## 內容原則

- 所有生平、年份與思想內容皆依公開資料改寫，並在每個地點附「內容依據」。
- 以「」標示者為來源中的原文用語，其餘為改寫轉述。
- 不使用佛光山官方標誌、星雲大師肖像或聲音；3D 場景、人物、願行卡皆為原創程式繪製。
- 本作品為獨立創作的數位教育平台，不代表佛光山或佛光大學官方製作或授權。

## 授權

程式碼為參賽者原創。`vendor/three` 為 Three.js（MIT License，見 `vendor/three/LICENSE`）。
