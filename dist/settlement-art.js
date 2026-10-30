// Foreground layers are independent of the shared, selectable scene background.
export function settlementArtMarkup() {
  return `
    <div class="settlement-background" aria-hidden="true"></div>
    <svg class="settlement-layers" viewBox="0 0 941 1672" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <image id="settlement-source" href="./art/settlement/reference.png" width="941" height="1672"/>
        <image id="settlement-text-source" href="./art/settlement/foreground.png" width="941" height="1672"/>
        <clipPath id="settlement-coin-clip">
          <circle cx="681" cy="112" r="43"/>
          <rect x="685" y="80" width="209" height="65" rx="33"/>
          <circle cx="708" cy="140" r="19"/>
        </clipPath>
        <clipPath id="settlement-title-clip"><rect x="156" y="455" width="656" height="160"/></clipPath>
        <clipPath id="settlement-slogan-clip"><rect x="210" y="627" width="531" height="97"/></clipPath>
        <clipPath id="settlement-progress-clip"><rect x="84" y="767" width="773" height="244" rx="36"/></clipPath>
      </defs>
      <use href="#settlement-source" clip-path="url(#settlement-coin-clip)"/>
      <g class="settlement-entry settlement-title" data-settlement-part="title">
        <use href="#settlement-text-source" clip-path="url(#settlement-title-clip)"/>
      </g>
      <g class="settlement-entry settlement-slogan" data-settlement-part="slogan">
        <use href="#settlement-text-source" clip-path="url(#settlement-slogan-clip)"/>
      </g>
      <g class="settlement-entry settlement-progress" data-settlement-part="progress">
        <use href="#settlement-source" clip-path="url(#settlement-progress-clip)"/>
      </g>
      <g class="settlement-entry settlement-icon" data-settlement-part="icon">
        <image class="settlement-icon-wreath" href="./art/settlement/abc-wreath-back.png" x="290.5" y="136" width="360" height="360"/>
        <image class="settlement-icon-tiles" href="./art/settlement/abc-tiles-front.png" x="290.5" y="136" width="360" height="360"/>
        <image class="settlement-icon-original" href="./art/settlement/abc-wreath.png" x="290.5" y="136" width="360" height="360"/>
      </g>
    </svg>
    <div class="settlement-entry settlement-buttons" data-settlement-part="buttons" inert>
      <button id="complete-reward" class="settlement-action settlement-reward" type="button" aria-label="观看视频，领取50金币">
        <svg class="settlement-video-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none"/><path d="M7 4v3m5-3v3m5-3v3"/></svg>
        <span>Watch Video</span>
        <span class="settlement-reward-amount">+50 <img src="./art/yanqi/jinbi@2x.png" alt="金币"></span>
      </button>
      <button id="complete-next" class="settlement-action settlement-next" type="button" aria-label="下一关">
        <span>Next Level</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
      </button>
    </div>
  `;
}
