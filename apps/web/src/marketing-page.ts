import {
  closingBand,
  isMarketingRoute,
  normalizeMarketingPath,
  productSubnav,
  renderMarketingSite,
  type MarketingRoute,
} from "./marketing-site.js";
import type { ProductPageConfig } from "./product-theme.js";

export {
  isMarketingRoute,
  marketingRoutes,
  normalizeMarketingPath,
} from "./marketing-site.js";

const homeMain = `
    <section class="marketing-hero" aria-labelledby="hero-title">
      <div class="marketing-hero-copy">
        <p class="eyebrow">One plugin. The whole path to play.</p>
        <h1 class="display" id="hero-title">One plugin to let the <span class="hero-keep">world play,</span><br>together</h1>
        <p class="lede">Give your game hosting, multiplayer, social features, and a way to get discovered—without wiring together five separate services.</p>
        <div class="hero-actions">
          <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get Started</a>
          <a class="button" href="#workflow">See how it works</a>
        </div>
      </div>
      <figure class="game-stage" aria-label="Three live game windows: Battleship, Pool, and Chess">
        <div class="game-windows">
          <article class="game-window game-window-tall">
            <div class="game-window-bar"><i></i><i></i><i></i><span>Battleship</span></div>
            <div class="game-scene scene-battleship" aria-hidden="true">
              <div class="seat seat-you"><i>Y</i><span>You</span><em>Your turn</em></div>
              <svg class="game-scene-art" viewBox="0 0 200 248" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <linearGradient id="bs-sea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#123d55"/>
                    <stop offset="1" stop-color="#0a2434"/>
                  </linearGradient>
                </defs>
                <rect width="200" height="248" fill="url(#bs-sea)"/>
                <g fill="#9db8c8" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="7" font-weight="700">
                  <text x="39" y="36">A</text><text x="57" y="36">B</text><text x="75" y="36">C</text><text x="93" y="36">D</text>
                  <text x="111" y="36">E</text><text x="129" y="36">F</text><text x="147" y="36">G</text><text x="165" y="36">H</text>
                  <text x="16" y="54">1</text><text x="16" y="72">2</text><text x="16" y="90">3</text><text x="16" y="108">4</text>
                  <text x="16" y="126">5</text><text x="16" y="144">6</text><text x="16" y="162">7</text><text x="16" y="180">8</text>
                </g>
                <g>
                  <rect x="30" y="42" width="144" height="144" fill="#1a5a78"/>
                  <path stroke="#7eb9d4" stroke-width=".7" d="M30 42h144v144H30zM48 42v144M66 42v144M84 42v144M102 42v144M120 42v144M138 42v144M156 42v144M30 60h144M30 78h144M30 96h144M30 114h144M30 132h144M30 150h144M30 168h144"/>
                </g>
                <g fill="#d5dee4" stroke="#8d98a2" stroke-width=".8">
                  <path d="M50 58h52c3.4 0 5 2.2 5 5.4s-1.6 5.4-5 5.4H50c-3.2 0-4.8-2.2-4.8-5.4S46.8 58 50 58z"/>
                  <path d="M159 88v50c0 3.4-2.2 5-5.4 5s-5.4-1.6-5.4-5V88c0-3.2 2.2-4.8 5.4-4.8S159 84.8 159 88z"/>
                  <path d="M86 140h30c3 0 4.6 2 4.6 5s-1.6 5-4.6 5H86c-3 0-4.6-2-4.6-5s1.6-5 4.6-5z"/>
                </g>
                <g class="bs-hit">
                  <circle cx="93" cy="105" r="5" fill="#c43b28"/>
                  <circle cx="93" cy="105" r="2.2" fill="#f0a72e"/>
                  <circle class="bs-splash" cx="93" cy="105" r="7" fill="none" stroke="#f0a72e" stroke-width="1.2"/>
                </g>
                <g class="bs-miss">
                  <circle cx="57" cy="141" r="4.2" fill="none" stroke="#e8f3fa" stroke-width="1.5"/>
                  <path d="M54 138l6 6M60 138l-6 6" stroke="#e8f3fa" stroke-width="1.3"/>
                </g>
                <g class="bs-reticle">
                  <circle r="8.5" fill="none" stroke="#f0a72e" stroke-width="1.3"/>
                  <path d="M-12 0h5.4M6.6 0H12M0-12v5.4M0 6.6V12" stroke="#f0a72e" stroke-width="1.3"/>
                </g>
                <circle class="bs-shot" r="2.3" fill="#f0a72e"/>
              </svg>
              <div class="seat seat-them"><i>M</i><span>Maya</span><em>Their turn</em></div>
            </div>
          </article>
          <article class="game-window">
            <div class="game-window-bar"><i></i><i></i><i></i><span>Pool</span></div>
            <div class="game-scene scene-pool" aria-hidden="true">
              <div class="seat seat-you"><i>Y</i><span>You</span><em>Your shot</em></div>
              <svg class="game-scene-art" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <linearGradient id="pool-rail" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#6b4428"/>
                    <stop offset=".5" stop-color="#4a2d19"/>
                    <stop offset="1" stop-color="#3a2214"/>
                  </linearGradient>
                  <radialGradient id="pool-felt" cx="38%" cy="32%" r="75%">
                    <stop offset="0" stop-color="#2f8a4c"/>
                    <stop offset="1" stop-color="#14532e"/>
                  </radialGradient>
                  <radialGradient id="ball-cue" cx="34%" cy="28%" r="70%">
                    <stop offset="0" stop-color="#fff"/>
                    <stop offset=".55" stop-color="#f3ead8"/>
                    <stop offset="1" stop-color="#c4b79a"/>
                  </radialGradient>
                  <radialGradient id="ball-1" cx="34%" cy="28%" r="70%">
                    <stop offset="0" stop-color="#ffb56a"/>
                    <stop offset=".55" stop-color="#e36a2c"/>
                    <stop offset="1" stop-color="#7a2c10"/>
                  </radialGradient>
                  <radialGradient id="ball-2" cx="34%" cy="28%" r="70%">
                    <stop offset="0" stop-color="#8eb6ff"/>
                    <stop offset=".55" stop-color="#2c62d4"/>
                    <stop offset="1" stop-color="#16356e"/>
                  </radialGradient>
                  <radialGradient id="ball-8" cx="34%" cy="28%" r="70%">
                    <stop offset="0" stop-color="#5a5a56"/>
                    <stop offset=".5" stop-color="#1a1a16"/>
                    <stop offset="1" stop-color="#050504"/>
                  </radialGradient>
                  <filter id="pool-shadow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="1.4" stdDeviation="1.2" flood-color="#041208" flood-opacity=".45"/>
                  </filter>
                </defs>
                <rect width="360" height="200" fill="url(#pool-rail)"/>
                <rect x="18" y="16" width="324" height="168" rx="8" fill="url(#pool-felt)"/>
                <g fill="#e8d9b0">
                  <circle cx="86" cy="10" r="1.6"/>
                  <circle cx="180" cy="10" r="1.6"/>
                  <circle cx="274" cy="10" r="1.6"/>
                  <circle cx="86" cy="190" r="1.6"/>
                  <circle cx="180" cy="190" r="1.6"/>
                  <circle cx="274" cy="190" r="1.6"/>
                </g>
                <g fill="#0a0a08">
                  <circle cx="24" cy="22" r="9"/>
                  <circle cx="180" cy="18" r="7"/>
                  <circle cx="336" cy="22" r="9"/>
                  <circle cx="24" cy="178" r="9"/>
                  <circle cx="180" cy="182" r="7"/>
                  <circle cx="336" cy="178" r="9"/>
                </g>
                <g filter="url(#pool-shadow)">
                  <g class="pool-cueball">
                    <circle cx="86" cy="92" r="8.4" fill="url(#ball-cue)"/>
                  </g>
                  <g class="pool-object">
                    <circle cx="214" cy="84" r="8.4" fill="url(#ball-1)"/>
                    <circle cx="214" cy="84" r="3.1" fill="#f7f1e4"/>
                    <text x="214" y="86.1" text-anchor="middle" font-size="5.4" font-family="ui-sans-serif, system-ui" fill="#1a1a16">1</text>
                  </g>
                  <circle cx="236" cy="98" r="8.4" fill="url(#ball-2)"/>
                  <rect x="227.6" y="94.2" width="16.8" height="7.6" fill="#f7f1e4"/>
                  <circle cx="236" cy="98" r="3.1" fill="#f7f1e4"/>
                  <text x="236" y="100.1" text-anchor="middle" font-size="5.4" font-family="ui-sans-serif, system-ui" fill="#1a1a16">2</text>
                  <circle cx="254" cy="86" r="8.4" fill="url(#ball-8)"/>
                  <circle cx="254" cy="86" r="3.1" fill="#f7f1e4"/>
                  <text x="254" y="88.1" text-anchor="middle" font-size="5.4" font-family="ui-sans-serif, system-ui" fill="#1a1a16">8</text>
                </g>
                <g class="cue-you">
                  <path d="M-8 94 L78 92.2" stroke="#c4a074" stroke-width="3.4" stroke-linecap="round"/>
                  <path d="M70 92.4 L82 92.1" stroke="#f3ead8" stroke-width="2.4" stroke-linecap="round"/>
                  <circle cx="83.2" cy="92" r="1.5" fill="#1f1b16"/>
                </g>
                <g class="cue-them">
                  <path d="M368 90 L282 92.4" stroke="#c4a074" stroke-width="3.4" stroke-linecap="round"/>
                  <path d="M290 92.2 L278 92.6" stroke="#f3ead8" stroke-width="2.4" stroke-linecap="round"/>
                  <circle cx="276.6" cy="92.6" r="1.5" fill="#1f1b16"/>
                </g>
              </svg>
              <div class="seat seat-them"><i>L</i><span>Leo</span><em>Their shot</em></div>
            </div>
          </article>
          <article class="game-window">
            <div class="game-window-bar"><i></i><i></i><i></i><span>Chess</span></div>
            <div class="game-scene scene-chess" aria-hidden="true">
              <div class="seat seat-them"><i>A</i><span>Asha</span><em>Black to move</em></div>
              <svg class="game-scene-art" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <pattern id="chess-sq" width="40" height="40" patternUnits="userSpaceOnUse">
                    <rect width="20" height="20" fill="#f0d8ae"/>
                    <rect x="20" y="20" width="20" height="20" fill="#f0d8ae"/>
                    <rect x="20" width="20" height="20" fill="#7a5333"/>
                    <rect y="20" width="20" height="20" fill="#7a5333"/>
                  </pattern>
                </defs>
                <rect width="200" height="200" fill="#2a2118"/>
                <rect x="16" y="16" width="168" height="168" fill="#4a3424"/>
                <rect x="20" y="20" width="160" height="160" fill="url(#chess-sq)"/>
                <rect class="move-w" x="40" y="160" width="20" height="20" fill="#f0a72e" opacity=".28"/>
                <rect class="move-w2" x="60" y="120" width="20" height="20" fill="#f0a72e" opacity=".18"/>
                <rect class="move-b" x="40" y="20" width="20" height="20" fill="#8ec8ff" opacity=".0"/>
                <rect class="move-b2" x="60" y="60" width="20" height="20" fill="#8ec8ff" opacity=".0"/>
                <g font-family="Georgia, 'Segoe UI Symbol', 'Apple Symbols', serif" font-size="17" text-anchor="middle">
                  <g fill="#f7f0de">
                    <text x="30" y="176">♖</text>
                    <text class="wn" x="50" y="176">♘</text>
                    <text x="70" y="176">♗</text>
                    <text x="90" y="176">♕</text>
                    <text x="110" y="176">♔</text>
                    <text x="30" y="156">♙</text>
                    <text x="70" y="156">♙</text>
                    <text x="110" y="156">♙</text>
                    <text x="150" y="156">♙</text>
                  </g>
                  <g fill="#16120e">
                    <text x="30" y="36">♜</text>
                    <text class="bn" x="50" y="36">♞</text>
                    <text x="70" y="36">♝</text>
                    <text x="90" y="36">♛</text>
                    <text x="110" y="36">♚</text>
                    <text x="30" y="56">♟</text>
                    <text x="70" y="56">♟</text>
                    <text x="110" y="56">♟</text>
                    <text x="150" y="56">♟</text>
                  </g>
                </g>
              </svg>
              <div class="seat seat-you"><i>Y</i><span>You</span><em>White to move</em></div>
            </div>
          </article>
        </div>
      </figure>
    </section>

    <section class="marketing-section" id="workflow" aria-labelledby="workflow-title">
      <div class="marketing-section-inner">
        <div class="feature-row feature-row-flip workflow-row">
          <div class="feature-copy">
            <p class="card-index">From localhost to live</p>
            <h2 id="workflow-title">Launch to the world<br>in minutes.</h2>
            <p>Give a finished browser game a host, a room, and a playable URL—without standing up a backend or wiring five services together.</p>
            <ul class="feature-list">
              <li>One plugin for your coding agent</li>
              <li>A secure link after every valid build</li>
              <li>Invite first. Publish when it is ready.</li>
            </ul>
            <a class="card-link" href="/sdk">See the SDK →</a>
          </div>
          <div class="editorial-grid editorial-stack">
            <article class="editorial-card">
              <p class="card-index">01 / Connect</p>
              <h3>Connect</h3>
              <p>Drop Loki into your game. Your coding agent gets the SDK, project rules, and exact setup steps.</p>
            </article>
            <article class="editorial-card">
              <p class="card-index">02 / Launch</p>
              <h3>Launch</h3>
              <p>Validate and deploy a finished build. Loki hosts it, scans it, and gives you a secure playable link.</p>
            </article>
            <article class="editorial-card">
              <p class="card-index">03 / Grow</p>
              <h3>Grow</h3>
              <p>Invite friends while you build. When you are ready, submit your game to the public catalog.</p>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section class="marketing-section" id="product" aria-label="Hosting, multiplayer, and distribution">
      <div class="marketing-section-inner">
        <div class="feature-stack">
          <article class="feature-row">
            <div class="feature-copy">
              <p class="card-index">01 / Hosting</p>
              <h3>A home for every build.</h3>
              <p>Ship a finished browser game to a secure Loki URL. Every upload is scanned, isolated, and saved as an immutable release.</p>
              <ul class="feature-list">
                <li>Private previews</li>
                <li>Global asset delivery</li>
                <li>No backend to maintain</li>
              </ul>
              <a class="card-link" href="/hosting">See hosting →</a>
            </div>
            <div class="feature-stage scene-pipeline" aria-hidden="true">
              <div class="pipe-bar"><span>loki deploy</span><em>rel_08</em></div>
              <ol class="pipe-steps">
                <li class="pipe-step pipe-step-1"><b>01</b><span>Upload</span><code>game.zip</code></li>
                <li class="pipe-step pipe-step-2"><b>02</b><span>Scan</span><code>pass</code></li>
                <li class="pipe-step pipe-step-3"><b>03</b><span>Isolate</span><code>origin ready</code></li>
                <li class="pipe-step pipe-step-4"><b>04</b><span>Live</span><code>play.lokiplay.cc</code></li>
              </ol>
              <div class="pipe-status">Build passed · URL issued</div>
            </div>
          </article>
          <article class="feature-row feature-row-flip">
            <div class="feature-copy">
              <p class="card-index">02 / Multiplayer</p>
              <h3>Multiplayer without the server project.</h3>
              <p>Add rooms, invites, matchmaking, chat, shared state, and leaderboards through one game-ready SDK.</p>
              <ul class="feature-list">
                <li>Rooms and matchmaking</li>
                <li>Reconnect and host migration</li>
                <li>Identity across every game</li>
              </ul>
              <a class="card-link" href="/multiplayer">See multiplayer →</a>
            </div>
            <div class="feature-stage scene-lobby" aria-hidden="true">
              <div class="lobby-head"><span>Room · battleship-04</span><em>3 / 4</em></div>
              <div class="lobby-seat lobby-seat-1"><i>Y</i><span>You</span><b>Host</b></div>
              <div class="lobby-seat lobby-seat-2"><i>M</i><span>Maya</span><b>Ready</b></div>
              <div class="lobby-seat lobby-seat-3"><i>L</i><span>Leo</span><b>Joining</b></div>
              <div class="lobby-seat lobby-seat-4"><i>+</i><span>Open seat</span><b>Invite</b></div>
              <div class="lobby-chat"><span>Maya</span> lock in C4 when Leo lands.</div>
            </div>
          </article>
          <article class="feature-row">
            <div class="feature-copy">
              <p class="card-index">03 / Distribution</p>
              <h3>A path from private link to public game.</h3>
              <p>Keep it private while you experiment. When the game is ready, make it public and share one playable link.</p>
              <ul class="feature-list">
                <li>Reviewed catalog</li>
                <li>Public game page</li>
                <li>Tips and revenue share</li>
              </ul>
              <a class="card-link" href="/distribution">See distribution →</a>
            </div>
            <div class="feature-stage scene-catalog" aria-hidden="true">
              <div class="catalog-rail">
                <span class="catalog-pill">Private</span>
                <span class="catalog-pill">In review</span>
                <span class="catalog-pill">Public</span>
              </div>
              <div class="catalog-card">
                <div class="catalog-thumb" aria-hidden="true">
                  <span></span><span></span><span></span><span></span>
                  <span></span><span></span><span></span><span></span>
                </div>
                <p>Battleship</p>
                <small>play.lokiplay.cc / battleship</small>
              </div>
              <div class="catalog-meta">Listed · 2 players · Versus</div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="marketing-section agent-section" aria-labelledby="agent-title">
      <div class="marketing-section-inner agent-layout">
        <div class="agent-copy">
          <p class="eyebrow">Made for how games get built now</p>
          <h2 id="agent-title">Built for the Agentic AI Era.</h2>
          <p>Loki gives coding agents one canonical source for packages, platform rules, validation, and deployment. They can integrate the game correctly without inventing another backend.</p>
          <div class="agent-links">
            <a class="inline-link" href="/agents">How agents use Loki →</a>
            <a class="inline-link" href="/sdk">See the SDK →</a>
          </div>
          <ul class="agent-logos" aria-label="Works with coding agents">
            <li class="agent-logo">
              <img src="/assets/CUBE_2D_DARK.svg" alt="" width="28" height="32">
              <span>Cursor</span>
            </li>
            <li class="agent-logo">
              <img src="/assets/claude-color.svg" alt="" width="28" height="28">
              <span>Claude Code</span>
            </li>
            <li class="agent-logo">
              <img src="/assets/openai-light.svg" alt="" width="28" height="28">
              <span>Codex</span>
            </li>
            <li class="agent-logo">
              <img src="/assets/replit-color.svg" alt="" width="28" height="28">
              <span>Replit</span>
            </li>
            <li class="agent-logo">
              <img src="/assets/lovable-color.svg" alt="" width="28" height="28">
              <span>Lovable</span>
            </li>
          </ul>
        </div>
        <div class="ide-stage" aria-label="Cursor receiving a Loki prompt">
          <div class="ide-zoom">
            <img class="ide-screen" src="/assets/cursor-screen.jpg" alt="Cursor">
            <img class="ide-screen ide-screen-prompt" src="/assets/cursor-screen-prompt.jpg" alt="">
            <div class="ide-pointer" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </section>

    <section class="marketing-section" id="games" aria-labelledby="games-title">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">Built on Loki / Ready to play</p>
          <div>
            <h2 id="games-title">Small games. Real players.</h2>
            <p class="lede">Browse the public catalog at <a href="https://play.lokiplay.cc/">play.lokiplay.cc ↗</a></p>
          </div>
        </div>
        <div class="editorial-grid">
          <article class="editorial-card game-card">
            <div class="game-art" aria-hidden="true">◇</div>
            <div class="game-copy">
              <p class="card-index">Versus / 2 players</p>
              <h3>Battleship</h3>
              <p class="muted">Take shots in the same room. One grid, two captains.</p>
            </div>
          </article>
          <article class="editorial-card game-card">
            <div class="game-art" aria-hidden="true">×</div>
            <div class="game-copy">
              <p class="card-index">Versus / 2 players</p>
              <h3>Pool</h3>
              <p class="muted">Alternate shots on a shared table. Host state, no custom server.</p>
            </div>
          </article>
          <article class="editorial-card game-card">
            <div class="game-art" aria-hidden="true">○</div>
            <div class="game-copy">
              <p class="card-index">Versus / 2 players</p>
              <h3>Chess</h3>
              <p class="muted">Live turns across a room. Reconnect without losing the board.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
${closingBand("Give your game somewhere to go.")}
`;

const hostingMain = `
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Product / Hosting</p>
          <h1 class="display" id="page-title">A home for every build.</h1>
          <p class="lede">Upload a finished browser game. Loki scans it, isolates it, and gives you a playable URL. Every release stays immutable—activation changes the live build, never the history.</p>
          <div class="page-actions">
            <a class="button button-primary" href="https://app.lokiplay.cc/signup">Host a game</a>
            <a class="button" href="/multiplayer">Add multiplayer</a>
          </div>
        </div>
        <aside class="page-aside" aria-label="Hosting facts">
          <div><strong>01 / Scan</strong><p>Unsafe or backend-dependent builds fail closed.</p></div>
          <div><strong>02 / Isolate</strong><p>Each game runs on its own origin under *.lokiplay.cc.</p></div>
          <div><strong>03 / Keep</strong><p>Releases are stored as records you can roll back to.</p></div>
        </aside>
      </div>
    </section>
    ${productSubnav("/hosting")}
    <section class="marketing-section" aria-labelledby="hosting-flow-title">
      <div class="marketing-section-inner two-col">
        <div>
          <div class="section-heading">
            <p class="eyebrow">From zip to playable link</p>
            <h2 id="hosting-flow-title">No servers to babysit.</h2>
          </div>
          <p class="lede">Loki is the hosting layer for vibe-coded games. You ship the client. We serve it globally, sandbox it from other games, and keep production multiplayer on the same URL.</p>
        </div>
        <div class="release-panel" aria-label="Example release history">
          <div class="docs-panel-header"><span>Release record</span><span>Immutable</span></div>
          <div class="release-row"><code>rel_08</code><span>Live · scanned · isolated</span></div>
          <div class="release-row"><code>rel_07</code><span>Previous · kept</span></div>
          <div class="release-row"><code>rel_06</code><span>Previous · kept</span></div>
          <div class="release-row"><code>rel_03</code><span>Blocked · failed review</span></div>
        </div>
      </div>
    </section>
    <section class="marketing-section" aria-labelledby="hosting-features-title">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">What you get</p>
          <h2 id="hosting-features-title">Built for games, not marketing sites.</h2>
        </div>
        <div class="editorial-grid">
          <article class="editorial-card editorial-card-raised">
            <p class="card-index">01 / Private previews</p>
            <h3>Share before you publish.</h3>
            <p>Keep a project private or unlisted while you iterate. Friends can play from a link without listing the game in the catalog.</p>
          </article>
          <article class="editorial-card editorial-card-raised">
            <p class="card-index">02 / Global delivery</p>
            <h3>Assets at the edge.</h3>
            <p>Finished builds are stored and served as static game files. You do not stand up a CDN, bucket, or deploy pipeline.</p>
          </article>
          <article class="editorial-card editorial-card-raised">
            <p class="card-index">03 / Fail closed</p>
            <h3>Safety before the play button.</h3>
            <p>Inline scripts, remote fonts, forms, and invented backends are rejected. The playable URL only exists after the build passes.</p>
          </article>
        </div>
      </div>
    </section>
${closingBand("Ship a build. Get a URL.")}
`;

const multiplayerMain = `
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Product / Multiplayer</p>
          <h1 class="display" id="page-title">Rooms without a server project.</h1>
          <p class="lede">Add rooms, invites, matchmaking, chat, shared state, and leaderboards through one SDK. Production play stays on Loki hosting—no leftover localhost server.</p>
          <div class="page-actions">
            <a class="button button-primary" href="https://app.lokiplay.cc/signup">Create a room</a>
            <a class="button" href="/sdk">See the SDK</a>
          </div>
        </div>
        <aside class="lobby-panel" aria-label="Example room">
          <div class="lobby-head">Room · orbital-relay</div>
          <div class="lobby-row"><span>Host</span><span>mira · connected</span></div>
          <div class="lobby-row"><span>Player</span><span>jun · connected</span></div>
          <div class="lobby-row"><span>Player</span><span>theo · reconnecting</span></div>
          <div class="lobby-row"><span>Invite</span><span>LK-4F29 · 2 seats left</span></div>
        </aside>
      </div>
    </section>
    ${productSubnav("/multiplayer")}
    <section class="marketing-section" aria-labelledby="mp-capabilities">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">The multiplayer surface</p>
          <h2 id="mp-capabilities">What the SDK already speaks.</h2>
        </div>
        <div class="capability-grid">
          <article class="capability-card">
            <p class="card-index">01 / Rooms</p>
            <h3>Create, join, leave.</h3>
            <p>Host-authoritative rooms with presence, late join, and a snapshot when someone reconnects.</p>
          </article>
          <article class="capability-card">
            <p class="card-index">02 / Invites</p>
            <h3>A code, not a server IP.</h3>
            <p>Share an invite. Friends land in the same room without you running matchmaking yourself.</p>
          </article>
          <article class="capability-card">
            <p class="card-index">03 / Matchmaking</p>
            <h3>Fill N, then start.</h3>
            <p>Fill a lobby or a team. The runtime creates the same authoritative room type either way.</p>
          </article>
          <article class="capability-card">
            <p class="card-index">04 / Shared state</p>
            <h3>Host writes. Everyone reads.</h3>
            <p>Casual and unranked play. The host owns the truth; clients do not invent a second backend.</p>
          </article>
        </div>
      </div>
    </section>
    <section class="marketing-section agent-section" aria-labelledby="mp-trust">
      <div class="marketing-section-inner two-col">
        <div class="agent-copy">
          <p class="eyebrow">Trust model</p>
          <h2 id="mp-trust">Built for friends, not ranked ladders.</h2>
          <p>Loki rooms are host-authoritative. That is the right fit for vibe-coded party games, puzzles, and co-op. It is not an anti-cheat layer for competitive rankings.</p>
        </div>
        <ul class="plain-list">
          <li>Reconnects restore the last snapshot</li>
          <li>Host migration keeps the room alive</li>
          <li>Identity is the same across every Loki game</li>
          <li>Chat and private leaderboards stay on the room</li>
        </ul>
      </div>
    </section>
${closingBand("Play with people, not localhost.")}
`;

const distributionMain = `
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Product / Distribution</p>
          <h1 class="display" id="page-title">Private first. Public when you mean it.</h1>
          <p class="lede">Layer 1 is a playable link for you and your friends. Layer 2 is a reviewed listing in the Loki catalog. You opt in only when the game is ready.</p>
          <div class="page-actions">
            <a class="button button-primary" href="https://app.lokiplay.cc/signup">Start private</a>
            <a class="button" href="https://play.lokiplay.cc/">Open the catalog</a>
          </div>
        </div>
        <aside class="page-aside" aria-label="Distribution layers">
          <div><strong>Layer 1</strong><p>Host, invite, iterate. No catalog listing required.</p></div>
          <div><strong>Layer 2</strong><p>Request review. A public page appears only after approval.</p></div>
        </aside>
      </div>
    </section>
    ${productSubnav("/distribution")}
    <section class="marketing-section" aria-labelledby="layers-title">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">Two layers, one product</p>
          <h2 id="layers-title">Discovery is optional.</h2>
        </div>
        <div class="layer-stack">
          <article class="layer-card">
            <p class="card-index">01 / Layer 1 · Hosting + multiplayer</p>
            <h3>A link you control.</h3>
            <p>Unfinished games are welcome. Keep the project private or unlisted, share a play invite, and replace the live release whenever you want.</p>
            <ul class="feature-list">
              <li>Private and unlisted play</li>
              <li>Immutable releases</li>
              <li>Rooms on the same Loki URL</li>
            </ul>
          </article>
          <article class="layer-card">
            <p class="card-index">02 / Layer 2 · Catalog</p>
            <h3>A page players can find.</h3>
            <p>When the game is ready, submit it for review. Loki checks safety and compatibility. Creative completeness stays yours.</p>
            <ul class="feature-list">
              <li>Reviewed public listing</li>
              <li>One playable catalog page</li>
              <li>Tips and revenue share later</li>
            </ul>
          </article>
        </div>
      </div>
    </section>
    <section class="marketing-section" aria-labelledby="catalog-title">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">Where games land</p>
          <div>
            <h2 id="catalog-title">The catalog is the front door.</h2>
            <p class="lede">Players browse live games at <a href="https://play.lokiplay.cc/">play.lokiplay.cc ↗</a></p>
          </div>
        </div>
        <div class="editorial-grid">
          <article class="editorial-card game-card">
            <div class="game-art" aria-hidden="true">◇</div>
            <div class="game-copy">
              <p class="card-index">Public · Versus</p>
              <h3>Battleship</h3>
              <p class="muted">A catalog card is just a reviewed Layer 1 game.</p>
            </div>
          </article>
          <article class="editorial-card game-card">
            <div class="game-art" aria-hidden="true">×</div>
            <div class="game-copy">
              <p class="card-index">Public · Versus</p>
              <h3>Pool</h3>
              <p class="muted">Same playable URL. A public page in front of it.</p>
            </div>
          </article>
          <article class="editorial-card game-card">
            <div class="game-art" aria-hidden="true">○</div>
            <div class="game-copy">
              <p class="card-index">Public · Versus</p>
              <h3>Chess</h3>
              <p class="muted">Players keep one Loki identity across games.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
${closingBand("List it only when it is ready.")}
`;

const agentsMain = `
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Product / Agents</p>
          <h1 class="display" id="page-title">Built for the Agentic AI Era.</h1>
          <p class="lede">Cursor, Claude Code, and similar tools should not invent a backend. Loki gives them one package, one protocol, and one set of platform rules.</p>
          <div class="page-actions">
            <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get a project prompt</a>
            <a class="button" href="https://docs.lokiplay.cc/agents">Agent docs ↗</a>
          </div>
        </div>
        <aside class="page-aside" aria-label="Agent path">
          <div><strong>Prompt</strong><p>Copy the project prompt from the creator desk.</p></div>
          <div><strong>Integrate</strong><p>The agent installs the SDK and follows Loki rules.</p></div>
          <div><strong>Ship</strong><p>Validate, deploy, then approve the terminal if asked.</p></div>
        </aside>
      </div>
    </section>
    ${productSubnav("/agents")}
    <section class="marketing-section" aria-labelledby="agent-rules">
      <div class="marketing-section-inner two-col">
        <div class="agent-copy">
          <p class="eyebrow">Canonical rules</p>
          <h2 id="agent-rules">One source. No invented servers.</h2>
          <p>Agents get the same instructions every time: install Loki, keep gameplay in the client, and deploy a finished build. They do not write a disposable server.js.</p>
        </div>
        <div class="docs-panel" aria-label="Agent documentation">
          <div class="docs-panel-header"><span>docs.lokiplay.cc</span><span>For humans and agents</span></div>
          <div class="docs-row"><code>/agents</code><span>Canonical integration rules</span></div>
          <div class="docs-row"><code>/mcp</code><span>Connect Loki as an MCP server</span></div>
          <div class="docs-row"><code>/llms.txt</code><span>Short product summary</span></div>
          <div class="docs-row"><code>/llms-full.txt</code><span>Every doc in one file</span></div>
        </div>
      </div>
    </section>
    <section class="marketing-section" aria-labelledby="agent-steps">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">How the desk works</p>
          <h2 id="agent-steps">You approve. The agent implements.</h2>
        </div>
        <div class="editorial-grid">
          <article class="editorial-card">
            <p class="card-index">01 / Project prompt</p>
            <h3>Exact steps, not vibes.</h3>
            <p>The creator desk gives the agent the SDK version, login command, and the rules that keep the game on Loki.</p>
          </article>
          <article class="editorial-card">
            <p class="card-index">02 / Device login</p>
            <h3>No pasted tokens.</h3>
            <p>The CLI opens a browser code. You sign in and approve the terminal. The agent never asks for a secret.</p>
          </article>
          <article class="editorial-card">
            <p class="card-index">03 / Validate + deploy</p>
            <h3>Fail before players see it.</h3>
            <p>The same checks the CLI runs are the checks the agent must pass. A blocked build never becomes a playable URL.</p>
          </article>
        </div>
      </div>
    </section>
${closingBand("Hand the missing backend to Loki.")}
`;

const sdkMain = `
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Product / SDK</p>
          <h1 class="display" id="page-title">One protocol. Four clients.</h1>
          <p class="lede">The JavaScript SDK is the production client for browser games. Unity, Swift, and Kotlin speak the same protocol as they land.</p>
          <div class="page-actions">
            <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get started</a>
            <a class="button" href="https://docs.lokiplay.cc/sdk">SDK docs ↗</a>
          </div>
        </div>
        <div class="docs-panel" aria-label="Install the JavaScript SDK">
          <div class="docs-panel-header"><span>@lokiplay/sdk</span><span>JavaScript</span></div>
          <div class="docs-row"><code>npm i @lokiplay/sdk</code><span>Install the client</span></div>
          <div class="docs-row"><code>createRoom()</code><span>Host a room</span></div>
          <div class="docs-row"><code>joinRoom({ inviteCode })</code><span>Join with an invite</span></div>
          <div class="docs-row"><code>createSynchronizedRoom()</code><span>Keep clients in lockstep</span></div>
        </div>
      </div>
    </section>
    ${productSubnav("/sdk")}
    <section class="marketing-section" aria-labelledby="sdk-langs">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">Clients</p>
          <h2 id="sdk-langs">Same rooms. Native wrappers later.</h2>
        </div>
        <div class="sdk-grid">
          <article class="sdk-card">
            <p class="card-index">Available now</p>
            <h3>JavaScript</h3>
            <p>The reference client for hosted browser games. Rooms, reconnect, overlay binding, and the playable-page bridge.</p>
          </article>
          <article class="sdk-card">
            <p class="card-index">Coming</p>
            <h3>Unity</h3>
            <p>The same protocol, for games that leave the browser. Ships against the shared conformance fixtures.</p>
          </article>
          <article class="sdk-card">
            <p class="card-index">Coming</p>
            <h3>Swift</h3>
            <p>iOS and native Apple clients join the same Loki rooms as a browser build.</p>
          </article>
          <article class="sdk-card">
            <p class="card-index">Coming</p>
            <h3>Kotlin</h3>
            <p>Android and JVM clients use the same invite codes, presence, and snapshots.</p>
          </article>
        </div>
      </div>
    </section>
${closingBand("Install the client. Keep the game.")}
`;

const examplesMain = `
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Examples</p>
          <h1 class="display" id="page-title">Small games. Real players.</h1>
          <p class="lede">These are the kinds of games Loki is for: short sessions, a handful of people, and a link you can send tonight. The live catalog is the source of truth.</p>
          <div class="page-actions">
            <a class="button button-primary" href="https://play.lokiplay.cc/">Browse the catalog</a>
            <a class="button" href="https://app.lokiplay.cc/signup">Ship yours</a>
          </div>
        </div>
        <aside class="page-aside" aria-label="Example notes">
          <div><strong>Not demos</strong><p>Each card is a hosted, playable shape—not a marketing render.</p></div>
          <div><strong>Catalog first</strong><p>When a game is public, it lives on play.lokiplay.cc.</p></div>
        </aside>
      </div>
    </section>
    <section class="marketing-section" aria-labelledby="example-grid-title">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">Built on Loki</p>
          <h2 id="example-grid-title">Party scale, not MMO scale.</h2>
        </div>
        <div class="editorial-grid">
          <article class="editorial-card game-card">
            <div class="game-art" aria-hidden="true">◇</div>
            <div class="game-copy">
              <p class="card-index">Versus / 2 players</p>
              <h3>Battleship</h3>
              <p class="muted">Take shots in the same room. Rooms, invites, and a shared board.</p>
            </div>
          </article>
          <article class="editorial-card game-card">
            <div class="game-art" aria-hidden="true">×</div>
            <div class="game-copy">
              <p class="card-index">Versus / 2 players</p>
              <h3>Pool</h3>
              <p class="muted">Alternate shots on a shared table. Presence without a custom server.</p>
            </div>
          </article>
          <article class="editorial-card game-card">
            <div class="game-art" aria-hidden="true">○</div>
            <div class="game-copy">
              <p class="card-index">Versus / 2 players</p>
              <h3>Chess</h3>
              <p class="muted">Live turns across a room. Host state, late join, reconnect.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
${closingBand("Your game can be the next card.")}
`;

const pricingMain = `
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Pricing</p>
          <h1 class="display" id="page-title">Start free. Stay unsurprised.</h1>
          <p class="lede">Launch is a free tier with private projects, small rooms, and hard usage caps. Paid plans come after the public Layer 1 release—not as a surprise bill.</p>
        </div>
        <aside class="page-aside" aria-label="Pricing promise">
          <div><strong>Now</strong><p>Free workspace. Caps instead of invoices.</p></div>
          <div><strong>Later</strong><p>Studio features and payouts after launch.</p></div>
        </aside>
      </div>
    </section>
    <section class="marketing-section" aria-labelledby="plans-title">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">Plans</p>
          <h2 id="plans-title">One price you can read.</h2>
        </div>
        <div class="plan-grid">
          <article class="plan-card" data-featured="true">
            <p class="card-index">Available at launch</p>
            <h3>Free</h3>
            <p class="price">$0</p>
            <p>Enough to host a game, play with friends, and learn the desk.</p>
            <ul class="feature-list">
              <li>Private projects</li>
              <li>Small multiplayer rooms</li>
              <li>Usage caps with no surprise bill</li>
              <li>Community support</li>
            </ul>
            <a class="button button-primary" href="https://app.lokiplay.cc/signup">Create free project</a>
          </article>
          <article class="plan-card">
            <p class="card-index">After public launch</p>
            <h3>Studio</h3>
            <p class="price">TBD</p>
            <p>Paid capacity, catalog tools, and payouts land with Layer 2—not before the legal text is final.</p>
            <ul class="feature-list">
              <li>Higher room and player caps</li>
              <li>Reviewed public listings</li>
              <li>Tips and revenue share</li>
              <li>Priority support</li>
            </ul>
            <a class="button" href="/contact">Ask about Studio</a>
          </article>
        </div>
      </div>
    </section>
    <section class="marketing-section" aria-labelledby="compare-title">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">Compare</p>
          <h2 id="compare-title">What is included now.</h2>
        </div>
        <div class="compare-wrap">
          <table class="compare-table">
            <thead>
              <tr><th>Capability</th><th>Free</th><th>Studio</th></tr>
            </thead>
            <tbody>
              <tr><td>Secure hosting</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Private play links</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Multiplayer rooms</td><td>Capped</td><td>Higher caps</td></tr>
              <tr><td>Public catalog</td><td>Review later</td><td>Included</td></tr>
              <tr><td>Payouts</td><td>—</td><td>After launch</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
${closingBand("No stack. No surprise invoice.")}
`;

const aboutMain = `
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Company / About</p>
          <h1 class="display" id="page-title">Games need players, not another backend.</h1>
          <p class="lede">Loki exists because vibe-coded games die at localhost. Hosting, rooms, chat, leaderboards, and discovery were five separate chores. They should be one plugin.</p>
        </div>
      </div>
    </section>
    <section class="marketing-section" aria-labelledby="about-problem">
      <div class="marketing-section-inner two-col">
        <div>
          <p class="eyebrow">The gap</p>
          <h2 id="about-problem">Agents write servers. Players never arrive.</h2>
          <p class="lede">A coding agent asked for multiplayer will invent a disposable server and hardcode localhost. Vercel hosts files. Colyseus hosts rooms. itch.io hosts discovery. None of them is the whole path.</p>
        </div>
        <ul class="plain-list">
          <li>Loki hosts the playable game</li>
          <li>Loki runs the rooms</li>
          <li>Loki can list the game when you ask</li>
          <li>Creators do not upload a Node server</li>
        </ul>
      </div>
    </section>
    <section class="marketing-section" aria-labelledby="principles-title">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">How we decide</p>
          <h2 id="principles-title">A short set of rules.</h2>
        </div>
        <div class="editorial-grid">
          <article class="editorial-card">
            <p class="card-index">01</p>
            <h3>Layer 1 is open to drafts.</h3>
            <p>Private deploy does not require a polished game. Friends can play while it is still ugly.</p>
          </article>
          <article class="editorial-card">
            <p class="card-index">02</p>
            <h3>Layer 2 is optional.</h3>
            <p>Public listing is reviewed. You opt in. Technical fitness is Loki’s problem; completeness is yours.</p>
          </article>
          <article class="editorial-card">
            <p class="card-index">03</p>
            <h3>Production play stays here.</h3>
            <p>The live URL is a Loki URL. Agents integrate Loki instead of inventing another backend.</p>
          </article>
        </div>
      </div>
    </section>
${closingBand("Build the game. We will hold the rest.")}
`;

const contactMain = `
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Company / Contact</p>
          <h1 class="display" id="page-title">Talk to us before launch.</h1>
          <p class="lede">This page is a placeholder. Final contact details, hours, and intake instructions will be published before launch.</p>
        </div>
      </div>
    </section>
    <section class="marketing-section" aria-labelledby="contact-grid-title">
      <div class="marketing-section-inner">
        <h2 class="sr-only" id="contact-grid-title">Contact placeholder</h2>
        <p class="placeholder-card">Placeholder text. Replace this entire block with the public contact channel, response-time expectations, and any press or legal inbox before launch.</p>
        <div class="contact-grid">
          <article class="editorial-card">
            <p class="card-index">What this page will cover</p>
            <h3>Product, press, and trust.</h3>
            <p>Expect separate paths for creator support, partnership questions, and legal notices. None of those addresses are public on this draft page.</p>
          </article>
          <article class="editorial-card editorial-card-raised">
            <p class="card-index">Until then</p>
            <h3>Use the product surfaces.</h3>
            <p>Create a project at app.lokiplay.cc or browse games at play.lokiplay.cc. Documentation will live at docs.lokiplay.cc.</p>
            <div class="page-actions">
              <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get Started</a>
              <a class="button" href="/about">About Loki</a>
            </div>
          </article>
        </div>
      </div>
    </section>
`;

function legalMain(
  kicker: string,
  title: string,
  intro: string,
  articles: { heading: string; body: string }[],
): string {
  return `
    <article class="legal-page">
      <p class="eyebrow">${kicker}</p>
      <h1>${title}</h1>
      <p class="lede">${intro}</p>
      <p class="legal-banner">Placeholder text. This draft is not in force. Final language will be supplied by counsel before launch and will replace every section on this page.</p>
      ${articles
        .map(
          (article) => `
      <section class="legal-article">
        <h2>${article.heading}</h2>
        <p>${article.body}</p>
      </section>`,
        )
        .join("")}
    </article>`;
}

const termsMain = legalMain(
  "Legal / Terms",
  "Terms of Service",
  "These terms will govern use of Loki hosting, multiplayer, and related sites.",
  [
    {
      heading: "1. Placeholder agreement",
      body: "Placeholder text. Describe the binding agreement between Loki Play and the people who create or play games on the service. Do not treat this sentence as an offer or contract.",
    },
    {
      heading: "2. Accounts and access",
      body: "Placeholder text. Cover account eligibility, credential handling, device authorization, and what happens when an account is suspended.",
    },
    {
      heading: "3. Acceptable use",
      body: "Placeholder text. Point to the Acceptable Use Policy and state that violating it can end access to hosting or rooms.",
    },
    {
      heading: "4. Hosted games",
      body: "Placeholder text. Explain that creators license Loki to host immutable builds, and that Loki may refuse or remove a release that fails safety review.",
    },
    {
      heading: "5. Contact",
      body: "Placeholder text. Replace with the official legal notice address once it exists.",
    },
  ],
);

const privacyMain = legalMain(
  "Legal / Privacy",
  "Privacy Policy",
  "This policy will explain what Loki collects, why, and how long it is kept.",
  [
    {
      heading: "1. Placeholder scope",
      body: "Placeholder text. List the sites and services this policy covers, including app.lokiplay.cc, play.lokiplay.cc, and the API.",
    },
    {
      heading: "2. Data we will describe",
      body: "Placeholder text. Account email, session tokens, device-authorization codes, play invites, telemetry needed to run rooms, and operator audit logs.",
    },
    {
      heading: "3. Processors",
      body: "Placeholder text. Name auth, hosting, storage, and multiplayer processors once counsel has approved the list.",
    },
    {
      heading: "4. Rights and requests",
      body: "Placeholder text. Access, deletion, and export requests will go through the published contact channel.",
    },
    {
      heading: "5. Changes",
      body: "Placeholder text. Describe how material changes will be announced before they take effect.",
    },
  ],
);

const aupMain = legalMain(
  "Legal / Acceptable Use",
  "Acceptable Use Policy",
  "This policy will set the lines for games, rooms, and accounts on Loki.",
  [
    {
      heading: "1. Placeholder purpose",
      body: "Placeholder text. State that Loki is for playable games and that the platform may remove content or shut rooms that cross these rules.",
    },
    {
      heading: "2. Prohibited material",
      body: "Placeholder text. Illegal content, exploitation, malware, and attempts to escape the game sandbox will be listed in the final policy.",
    },
    {
      heading: "3. Multiplayer conduct",
      body: "Placeholder text. Harassment, spam, and abuse of invites, chat, or matchmaking will have specific remedies.",
    },
    {
      heading: "4. Enforcement",
      body: "Placeholder text. Describe warnings, suspension, and the operator kill switch in language counsel approves.",
    },
    {
      heading: "5. Reports",
      body: "Placeholder text. Replace with the public reporting path before launch.",
    },
  ],
);

const pages: Record<
  MarketingRoute,
  { title: string; description: string; main: string }
> = {
  "/": {
    title: "Loki — One plugin to let the world play, together",
    description:
      "Hosting, multiplayer, social features, and distribution for vibe-coded games.",
    main: homeMain,
  },
  "/hosting": {
    title: "Hosting — Loki",
    description:
      "Scan, isolate, and host finished browser games on a secure Loki URL.",
    main: hostingMain,
  },
  "/multiplayer": {
    title: "Multiplayer — Loki",
    description:
      "Rooms, invites, matchmaking, and shared state without a server project.",
    main: multiplayerMain,
  },
  "/distribution": {
    title: "Distribution — Loki",
    description:
      "Keep games private while you build, then list them in the Loki catalog.",
    main: distributionMain,
  },
  "/agents": {
    title: "Agents — Loki",
    description:
      "Give coding agents one package, one protocol, and one set of Loki rules.",
    main: agentsMain,
  },
  "/sdk": {
    title: "SDK — Loki",
    description:
      "The Loki SDK for JavaScript, with Unity, Swift, and Kotlin on the same protocol.",
    main: sdkMain,
  },
  "/examples": {
    title: "Examples — Loki",
    description: "Small multiplayer games hosted and played on Loki.",
    main: examplesMain,
  },
  "/pricing": {
    title: "Pricing — Loki",
    description: "Start free with private hosting and capped multiplayer rooms.",
    main: pricingMain,
  },
  "/about": {
    title: "About — Loki",
    description:
      "Loki is the hosting, multiplayer, and distribution plugin for vibe-coded games.",
    main: aboutMain,
  },
  "/contact": {
    title: "Contact — Loki",
    description: "Placeholder contact page for Loki Play. Final details before launch.",
    main: contactMain,
  },
  "/terms": {
    title: "Terms of Service — Loki",
    description: "Placeholder terms of service for Loki Play.",
    main: termsMain,
  },
  "/privacy": {
    title: "Privacy Policy — Loki",
    description: "Placeholder privacy policy for Loki Play.",
    main: privacyMain,
  },
  "/aup": {
    title: "Acceptable Use Policy — Loki",
    description: "Placeholder acceptable use policy for Loki Play.",
    main: aupMain,
  },
};

export function renderMarketingPage(
  config: ProductPageConfig,
  path = "/",
): string {
  const normalized = normalizeMarketingPath(path);
  const route: MarketingRoute = isMarketingRoute(normalized)
    ? normalized
    : "/";
  const page = pages[route];
  return renderMarketingSite({
    config,
    path: route,
    title: page.title,
    description: page.description,
    main: page.main,
  });
}
