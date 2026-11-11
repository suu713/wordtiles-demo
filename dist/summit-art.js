import {SUMMIT_ROUTE,summitPoint} from './summit-motion.js?v=1';

export const summitCoinMarkup='<circle r="18" fill="#b56a0f"/><circle cy="-2" r="18" fill="url(#summit-coin-gold)" stroke="#ffed99" stroke-width="1.5"/><circle cy="-2" r="13.5" fill="none" stroke="#ffe495" stroke-width="1.3"/><path d="M1-13v23m5-19H-2a4 4 0 0 0 0 8h4a4 4 0 0 1 0 8H-6" fill="none" stroke="#fff3b4" stroke-width="2.5" stroke-linecap="round"/>';
const camps=[3,6,9].map(step=>{const p=summitPoint(step/12);return `<g class="summit-camp" data-step="${step}" transform="translate(${p.x} ${p.y})"><ellipse cy="4" rx="13" ry="5" fill="#15244388"/><path d="M0 0v-22" stroke="#e4f2ff" stroke-width="2.5"/><path d="M1-22h16l-4 5 4 5H1" fill="#a5c9ed"/><circle r="4" fill="#dfedff"/></g>`;}).join('');

export function summitArtMarkup(){return `<svg class="summit-art" viewBox="0 0 600 520" aria-hidden="true">
  <defs>
    <linearGradient id="summit-rear" x2=".8" y2="1"><stop stop-color="#815dd2"/><stop offset="1" stop-color="#2b346c"/></linearGradient>
    <linearGradient id="summit-left" x2="1" y2="1"><stop stop-color="#8278dc"/><stop offset="1" stop-color="#454995"/></linearGradient>
    <linearGradient id="summit-front" x2=".8" y2="1"><stop stop-color="#5283d2"/><stop offset="1" stop-color="#284d98"/></linearGradient>
    <linearGradient id="summit-ridge" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#72c4e5"/><stop offset=".5" stop-color="#7b9ee5"/><stop offset="1" stop-color="#6882cb"/></linearGradient>
    <linearGradient id="summit-snow" x2="1" y2="1"><stop stop-color="#f7f6ff"/><stop offset="1" stop-color="#b6c5f2"/></linearGradient>
    <linearGradient id="summit-coin-gold" x2=".5" y2="1"><stop stop-color="#fff1a1"/><stop offset=".47" stop-color="#ffc949"/><stop offset="1" stop-color="#ee961d"/></linearGradient>
    <radialGradient id="summit-glow"><stop stop-color="#fff5b2" stop-opacity=".9"/><stop offset=".45" stop-color="#ffe789" stop-opacity=".3"/><stop offset="1" stop-color="#ffdf6a" stop-opacity="0"/></radialGradient>
    <filter id="summit-soft-glow"><feGaussianBlur stdDeviation="2.5"/></filter>
  </defs>
  <ellipse cx="300" cy="472" rx="216" ry="22" fill="#020d2180"/>
  <g class="summit-mountain">
    <path d="M70 457 110 347 135 335 165 257 192 249 222 171 253 156 280 91 301 58 327 106 349 163 376 175 412 260 443 277 469 347 491 365 526 457Z" fill="url(#summit-rear)" stroke="#c0c9ff44" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="m301 58-18 81-30 17-31 15-30 78 82 10 47-82-4-45Z" fill="#a18ce5" opacity=".55"/>
    <path d="m301 58 26 48 22 57-29-17-17-28-22 17-28 21 27-65Z" fill="url(#summit-snow)"/>
    <path d="m222 171 64 31 65-39 25 12 36 85-84 43-136-54Z" fill="url(#summit-left)"/>
    <path d="m286 202 65-39 25 12 36 85-84 43-24-50Z" fill="#3c4487" opacity=".5"/>
    <path d="M192 249c46 44 193 43 251 28l26 70c-105 24-249 104-399 110l40-110 25-12 30-78Z" fill="url(#summit-front)"/>
    <path d="M70 457c123-28 300-64 388-114 29-17-13-37-46-43-57-9-181-25-206-38 55 48 204 33 251 56 64 32-161 106-300 132Z" fill="url(#summit-ridge)"/>
    <path d="M206 262c-30-28 113-39 151-69 15-19-39-37-55-89 3 43 23 66 39 82-50 29-167 34-135 76Z" fill="#a2b6ee" opacity=".58"/>
    <path d="m70 457 90-8 36-51-61-63-25 12Z" fill="#3c70b2" opacity=".7"/>
    <path d="m469 347 22 18 35 92H160c139-33 256-80 309-110Z" fill="#5688cc"/>
    <path d="m491 365 35 92h-42l-42-67Z" fill="#395d9a" opacity=".5"/>
    <path d="${SUMMIT_ROUTE}" class="summit-route-shadow" pathLength="1"/>
    <path d="${SUMMIT_ROUTE}" class="summit-route-hint" pathLength="1"/>
    <path d="${SUMMIT_ROUTE}" class="summit-route-progress" pathLength="1"/>
    ${camps}
    <g class="summit-peak-light" transform="translate(301 61)"><circle r="68" fill="url(#summit-glow)"/><path d="M-37 0h74M0-37v74m-22-22 44 44m0-44-44 44" stroke="#fff6bb" opacity=".5"/></g>
    <g class="summit-flag" transform="translate(302 64)"><path d="M0 3v-44" stroke="#fff0c0" stroke-width="3" stroke-linecap="round"/><path d="M2-43h32l-7 10 7 10H2Z" fill="#ffcf59" stroke="#ffe8a1" stroke-width="1.5"/></g>
    <g class="summit-chest" transform="translate(302 88)"><ellipse cy="10" rx="20" ry="7" fill="#17224d55"/><path d="M-17-5h34V9h-34Z" fill="#d69537" stroke="#ffe7a6" stroke-width="2"/><path d="M-17-5q0-13 17-13T17-5Z" fill="#edb75a" stroke="#ffe7a6" stroke-width="2"/><path d="M-17-4h34M-10-15V9M10-15V9" stroke="#fff0bb" stroke-width="2"/><rect x="-3" y="-4" width="6" height="8" rx="1" fill="#7a4a36"/></g>
  </g>
  <g class="summit-walker-position">
    <ellipse class="summit-foot-shadow" cy="3" rx="11" ry="3.5" fill="#142b6288"/>
    <g class="summit-walker-facing">
      <g class="summit-walker-bob">
        <g class="summit-back-leg"><path d="m0-14-6 8 1 6" fill="none" stroke="#253456" stroke-width="5" stroke-linecap="round"/></g>
        <g class="summit-front-leg"><path d="m0-14 6 8 3 6" fill="none" stroke="#e4c778" stroke-width="5" stroke-linecap="round"/></g>
        <path d="m-7-31-4 15 8 2 5-14Z" fill="#d46d53" stroke="#ffbc87" stroke-width="1.3"/>
        <path d="m0-30-1 16" stroke="#ffe5a0" stroke-width="9" stroke-linecap="round"/>
        <g class="summit-back-arm"><path d="m0-27-7 7-3 7" fill="none" stroke="#f6d893" stroke-width="3.5" stroke-linecap="round"/></g>
        <g class="summit-front-arm"><path d="m2-27 7 4 4-8" fill="none" stroke="#ffefbe" stroke-width="3.5" stroke-linecap="round"/><path d="m15-33-3 32" stroke="#b9d0e4" stroke-width="1.8"/></g>
        <circle cx="3" cy="-38" r="6.5" fill="#f6d3a0"/>
        <path d="M-4-39a7 7 0 0 1 14 0H-4Z" fill="#ffcf5b" stroke="#fff0ae" stroke-width="1.2"/><path d="M-5-39h17" stroke="#ffebaa" stroke-width="2.5" stroke-linecap="round"/>
      </g>
    </g>
  </g>
  <g class="summit-reward-glow"><circle r="47" fill="url(#summit-glow)"/><path d="m0-28 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" fill="#fff5b5"/></g>
  <text class="summit-reward-label" text-anchor="middle">+15</text>
</svg>`;}
