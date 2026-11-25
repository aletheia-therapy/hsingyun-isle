/**
 * 語音導讀已依使用者回饋停用（瀏覽器內建語音音質不佳）。
 * 保留同樣的介面，讓各處呼叫不需改動：不發聲、不顯示朗讀按鈕。
 */
export const voice = {
  supported: false,
  on: false,
  set() {},
  onChange() { return () => {}; },
  say() { return Promise.resolve(); },
  stop() {},
  speaking: false,
};
export function speakButton() { return null; }
