import {
  closingBand,
  isMarketingRoute,
  normalizeMarketingPath,
  productSectionHref,
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

function agentMarquee(): string {
  const logos = [
    ["/assets/CUBE_2D_DARK.svg", "Cursor"],
    ["/assets/claude-color.svg", "Claude Code"],
    ["/assets/openai-light.svg", "Codex"],
    ["/assets/grok.svg", "Grok"],
    ["/assets/replit-color.svg", "Replit"],
    ["/assets/lovable-color.svg", "Lovable"],
  ];
  const once = logos
    .map(
      ([src, name]) => `
            <li class="agent-logo">
              <img src="${src}" alt="" width="28" height="28">
              <span>${name}</span>
            </li>`,
    )
    .join("");
  const items = once + once;
  return `
          <div class="agent-marquee">
            <div class="agent-logos-track">
              <ul class="agent-logos">${items}
              </ul>
              <ul class="agent-logos" aria-hidden="true">${items}
              </ul>
            </div>
          </div>`;
}

function laptopGameBoard(): string {
  const columns = "ABCDEFGHIJ".split("");
  const mark = (className: string, column: number, row: number, text = "") =>
    `<span class="${className}" style="grid-column:${column};grid-row:${row}">${text}</span>`;
  const corner = mark("pair-blank", 1, 1);
  const head = columns.map((letter, index) => mark("pair-axis", index + 2, 1, letter)).join("");
  const rows = Array.from({ length: 10 }, (_, index) => {
    const row = index + 2;
    const label = mark("pair-axis", 1, row, String(index + 1));
    const cells = columns.map((_, column) => mark("pair-cell", column + 2, row)).join("");
    return label + cells;
  }).join("");
  return `${corner}${head}${rows}<span class="pair-ship pair-ship-h"></span><span class="pair-ship pair-ship-v"></span><span class="pair-peg pair-hit"></span><span class="pair-peg pair-splash"></span><span class="pair-peg pair-shot"></span>`;
}

function pricingPlans(): string {
  return `
      <div class="pricing-plans-block">
        <div class="billing-toggle">
          <input class="billing-input" type="radio" name="billing" id="billing-monthly" checked>
          <input class="billing-input" type="radio" name="billing" id="billing-annual">
          <div class="billing-switch" role="radiogroup" aria-label="Billing period">
            <label for="billing-monthly">Monthly</label>
            <label for="billing-annual">Annual</label>
          </div>
        </div>
        <div class="pricing-grid">
          <article class="pricing-card">
            <h3>Free</h3>
            <p class="pricing-amount">$0</p>
            <p class="pricing-period">Free</p>
            <ul class="pricing-features">
              <li>1 game</li>
              <li>2 rooms at the same time</li>
              <li>4 players per room</li>
            </ul>
            <a class="button" href="https://app.lokiplay.cc/signup">Get started</a>
          </article>
          <article class="pricing-card pricing-card-featured">
            <h3>Loki</h3>
            <p class="pricing-amount"><span class="price-monthly">$12</span><span class="price-annual">$8</span></p>
            <p class="pricing-period"><span class="price-monthly">per month</span><span class="price-annual">per month, billed annually</span></p>
            <ul class="pricing-features">
              <li>Unlimited games</li>
              <li>8 players per room</li>
              <li>Priority listing in the public catalog</li>
            </ul>
            <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get Loki</a>
          </article>
        </div>
      </div>`;
}

const homeMain = `
    <section class="marketing-hero" aria-labelledby="hero-title">
      <div class="marketing-hero-copy">
        <h1 class="display" id="hero-title">Gaming Infrastructure for the<br>Agentic Future.</h1>
        <p class="lede">Give your game hosting, multiplayer, social features, and a way to get discovered—without wiring together five separate services.</p>
        <div class="hero-actions">
          <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get Started</a>
          <a class="button" href="#workflow">See how it works</a>
        </div>
      </div>
      <figure class="game-stage ops-wall" aria-label="Agentic Game Ops Wall preview">
        <div class="ops-command" aria-hidden="true">
          <div class="ops-panel-head"><span>Agent prompt</span><em>Cursor / Claude / Codex</em></div>
          <div class="ops-terminal">
            <code class="ops-type ops-type-1">build me a multiplayer browser game</code>
            <code class="ops-type ops-type-2">install @lokiplay/sdk and host it</code>
            <code class="ops-type ops-type-3">create rooms, invites, chat, scores</code>
          </div>
          <ol class="ops-log">
            <li><b>01</b><span>Package installed</span><em>@lokiplay/sdk</em></li>
            <li><b>02</b><span>Rules loaded</span><em>game.json</em></li>
            <li><b>03</b><span>Room wired</span><em>sync ready</em></li>
            <li><b>04</b><span>Build live</span><em>play URL</em></li>
          </ol>
        </div>
        <div class="ops-core" aria-hidden="true">
          <div class="ops-node ops-node-agent">Agent</div>
          <div class="ops-beam ops-beam-a"></div>
          <div class="ops-node ops-node-loki">LOKI</div>
          <div class="ops-beam ops-beam-b"></div>
          <div class="ops-node ops-node-game">Live</div>
        </div>
        <div class="ops-live" aria-hidden="true">
          <div class="ops-panel-head"><span>Live game ops</span><em>Room ready</em></div>
          <div class="ops-room-card">
            <div>
              <strong>battleship-party-04</strong>
              <span>3 players · host authoritative</span>
            </div>
            <small>PUBLIC URL ON</small>
          </div>
          <div class="ops-mini-grid">
            <div class="ops-mini ops-mini-board">
              <span>Battleship</span>
              <i></i><i></i><i></i><i></i><i></i><i></i>
            </div>
            <div class="ops-mini ops-mini-pool">
              <span>Pool</span>
              <i></i><i></i><i></i>
            </div>
            <div class="ops-mini ops-mini-chat">
              <span>Room chat</span>
              <p>Maya joined from invite.</p>
              <p>Leo is ready.</p>
            </div>
          </div>
          <div class="ops-player-rail">
            <span><i>Y</i>You</span>
            <span><i>M</i>Maya</span>
            <span><i>L</i>Leo</span>
            <span class="ops-seat-open"><i>+</i>Invite</span>
          </div>
          <div class="ops-url-card">
            <span>https://play.lokiplay.cc/battleship-party</span>
            <b>copied</b>
          </div>
        </div>
      </figure>
    </section>

    <section class="marketing-section" id="workflow" aria-labelledby="workflow-title">
      <div class="marketing-section-inner">
        <div class="feature-row feature-row-flip workflow-row">
          <div class="feature-copy">
            <h2 id="workflow-title">From Game to Party<br>in a Single Prompt.</h2>
            <p>Give a finished browser game a host, a room, and a playable URL—without standing up a backend or wiring five services together.</p>
            <a class="card-link" href="${productSectionHref("sdk")}">See the SDK →</a>
          </div>
          <div class="editorial-grid editorial-stack party-flow" aria-label="Prompt-to-party timeline">
            <div class="party-command" aria-hidden="true">
              <span>Prompt</span>
              <code>make this game playable with friends tonight</code>
            </div>
            <ol class="party-steps" aria-hidden="true">
              <li class="party-step party-step-install"><b>01</b><span>Install</span><em>@lokiplay/sdk</em></li>
              <li class="party-step party-step-deploy"><b>02</b><span>Deploy</span><em>secure URL</em></li>
              <li class="party-step party-step-room"><b>03</b><span>Room</span><em>host ready</em></li>
              <li class="party-step party-step-invite"><b>04</b><span>Invite</span><em>link copied</em></li>
              <li class="party-step party-step-players"><b>05</b><span>Players</span><em>party live</em></li>
            </ol>
            <div class="party-room" aria-hidden="true">
              <div class="party-badge">Party ready</div>
              <div class="party-avatar party-avatar-you">Y</div>
              <div class="party-avatar party-avatar-maya">M</div>
              <div class="party-avatar party-avatar-leo">L</div>
              <div class="party-chat party-chat-a"><b>Maya</b> I am in.</div>
              <div class="party-chat party-chat-b"><b>Leo</b> ready up?</div>
              <div class="party-link">play.lokiplay.cc/party</div>
            </div>
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
              <h3>Launch to the World<br>in Minutes.</h3>
              <p>Ship a finished browser game to a secure Loki URL. Every upload is scanned, isolated, and saved as an immutable release.</p>
              <a class="card-link" href="${productSectionHref("hosting")}">See hosting →</a>
            </div>
            <div class="feature-stage scene-phone" aria-label="A phone conversation that ends with a game link and Maya joining">
              <div class="share-phone share-phone-small">
                <div class="share-phone-screen">
                  <div class="share-phone-notch" aria-hidden="true"></div>
                  <div class="share-phone-status" aria-hidden="true">
                    <span>9:41</span>
                    <span class="share-phone-status-icons"><i></i><i></i><i></i><b></b></span>
                  </div>
                  <div class="share-phone-header">
                    <span class="share-phone-back" aria-hidden="true">‹</span>
                    <span class="share-phone-avatar" aria-hidden="true">M</span>
                    <span class="share-phone-name">Maya</span>
                  </div>
                  <div class="share-phone-thread">
                    <div class="share-phone-row received chat-line chat-1">
                      <div class="share-phone-bubble received">you still up?</div>
                    </div>
                    <div class="share-phone-row sent chat-line chat-2">
                      <div class="share-phone-bubble sent"><p>yeah. want a game?</p></div>
                    </div>
                    <div class="share-phone-row received chat-line chat-3">
                      <div class="share-phone-bubble received">battleship. send the link</div>
                    </div>
                    <div class="share-phone-row sent chat-line chat-4">
                      <div class="share-phone-bubble sent">
                        <p>join my game</p>
                        <div class="share-phone-card">
                          <span class="share-phone-thumb" aria-hidden="true"></span>
                          <span class="share-phone-card-copy">
                            <strong>battleship-party</strong>
                            <span>play.lokiplay.cc/<br>battleship-04</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div class="share-phone-row received chat-line chat-5">
                      <div class="share-phone-bubble received">joining now</div>
                    </div>
                  </div>
                  <div class="share-phone-composer" aria-hidden="true">
                    <span class="share-phone-plus">+</span>
                    <span class="share-phone-field">Message Maya</span>
                  </div>
                </div>
              </div>
            </div>
          </article>
          <article class="feature-row feature-row-flip">
            <div class="feature-copy">
              <p class="card-index">02 / Multiplayer</p>
              <h3 class="play-title">Play your<br>Game with Anyone,<br>Anywhere.</h3>
              <p>Add rooms, invites, matchmaking, chat, shared state, and leaderboards through one game-ready SDK.</p>
              <a class="card-link" href="${productSectionHref("multiplayer")}">See multiplayer →</a>
            </div>
            <div class="feature-stage scene-phone scene-rooms" aria-label="A phone and a laptop joining the same Battleship room">
              <div class="room-pair">
                <div class="pair-phone">
                  <div class="pair-phone-screen">
                    <div class="pair-notch" aria-hidden="true"></div>
                    <div class="pair-status"><span>9:41</span><b></b></div>
                    <div class="pair-app">
                      <h2>Rooms</h2>
                      <div class="pair-row is-pick"><i>B</i><span><strong>Battleship</strong><em>2 / 4 open</em></span></div>
                      <div class="pair-row"><i>P</i><span><strong>Pool</strong><em>1 / 2 open</em></span></div>
                      <div class="pair-row is-full"><i>C</i><span><strong>Chess</strong><em>2 / 2 full</em></span></div>
                      <p class="pair-note">Maya is looking for a room</p>
                    </div>
                  </div>
                </div>
                <div class="pair-laptop" aria-hidden="true">
                  <div class="pair-lid">
                    <div class="pair-browser">
                      <div class="pair-chrome">
                        <span class="pair-lights"><i></i><i></i><i></i></span>
                        <div class="pair-url">play.lokiplay.cc/battleship-04</div>
                      </div>
                      <div class="pair-screen">
                        <div class="pair-pane pair-gate">
                          <h2>Battleship</h2>
                          <div class="pair-action">Create room</div>
                          <div class="pair-action pair-join">Join room</div>
                          <p class="pair-note">Leo is joining from a laptop</p>
                        </div>
                        <div class="pair-pane pair-rooms">
                          <h2>Rooms</h2>
                          <div class="pair-row pair-row-pick"><i>B</i><span><strong>Battleship</strong><em>2 / 4 open</em></span></div>
                          <div class="pair-row"><i>P</i><span><strong>Pool</strong><em>1 / 2 open</em></span></div>
                          <div class="pair-row is-full"><i>C</i><span><strong>Chess</strong><em>2 / 2 full</em></span></div>
                          <p class="pair-note">Leo opened Battleship</p>
                        </div>
                        <div class="pair-pane pair-lobby">
                          <h2>battleship-04</h2>
                          <div class="pair-seat"><i>Y</i><span>You</span><em>Host</em></div>
                          <div class="pair-seat is-maya"><i>M</i><span>Maya</span><em>Joined</em></div>
                          <div class="pair-seat pair-leo"><i>L</i><span>Leo</span><em>Joined</em></div>
                          <p class="pair-note pair-leo"><b>Leo</b> I'm in</p>
                        </div>
                        <div class="pair-pane pair-play">
                          <div class="pair-board">${laptopGameBoard()}</div>
                          <div class="pair-players">
                            <span class="is-you"><b>Y</b>You</span>
                            <span class="is-maya"><b>M</b>Maya</span>
                            <span class="is-leo"><b>L</b>Leo</span>
                            <span class="pair-joined">Leo joined</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="pair-base"><span></span></div>
                </div>
              </div>
            </div>
          </article>
          <article class="feature-row">
            <div class="feature-copy">
              <p class="card-index">03 / Distribution</p>
              <h3>Experience what Loki can do.</h3>
              <p>Keep it private while you experiment. When the game is ready, make it public and share one playable link.</p>
              <a class="card-link" href="${productSectionHref("distribution")}">See distribution →</a>
            </div>
            <div class="feature-stage scene-board" aria-label="A montage of vibe-coded games: racing, shooting, and chess.">
              <video class="dist-montage" autoplay muted loop playsinline poster="/assets/loki-game-montage.webp" src="/assets/loki-game-montage.mp4"></video>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="marketing-section agent-section" aria-labelledby="agent-title">
      <div class="marketing-section-inner agent-layout">
        <div class="agent-copy">
          <p class="eyebrow">Made for how games get built now</p>
          <h2 id="agent-title">Let your Agent handle the rest.</h2>
          <p>Loki gives coding agents one canonical source for packages, platform rules, validation, and deployment. They can integrate the game correctly without inventing another backend.</p>
          <div class="agent-links">
            <a class="inline-link" href="${productSectionHref("agents")}">How agents use Loki →</a>
            <a class="inline-link" href="${productSectionHref("sdk")}">See the SDK →</a>
          </div>
${agentMarquee()}
        </div>
        <div class="ide-stage" aria-label="An IDE where a prompt is typed and then run">
          <div class="share-editor">
            <div class="share-editor-chrome">
              <span class="share-editor-dots" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="share-editor-name">battleship</span>
              <span class="share-editor-tabname">game.js</span>
            </div>
            <div class="share-editor-workspace">
              <aside class="share-editor-side" aria-hidden="true">
                <p>Files</p>
                <span>index.html</span>
                <span class="is-open">game.js</span>
                <span class="ide-file-new">game.json</span>
              </aside>
              <div class="share-editor-code" aria-hidden="true">
                <div class="share-editor-tab">game.js</div>
                <ol>
                  <li><span><span class="tok-k">const</span> board = createGrid(10);</span></li>
                  <li><span><span class="tok-k">function</span> fire(cell) {</span></li>
                  <li><span class="ide-indent"><span class="tok-k">return</span> board.shoot(cell);</span></li>
                  <li><span>}</span></li>
                  <li class="ide-added"><span><span class="tok-k">import</span> { Loki } <span class="tok-k">from</span> <span class="tok-s">"@lokiplay/sdk"</span>;</span></li>
                  <li class="ide-added"><span><span class="tok-k">await</span> Loki.host(<span class="tok-s">"battleship"</span>);</span></li>
                </ol>
              </div>
            </div>
            <div class="share-editor-agent">
              <div class="share-editor-composer">
                <code class="ide-typed">Integrate and ship this repository to Loki.</code>
                <span class="ide-run" aria-hidden="true">Run</span>
              </div>
              <ol class="ide-log">
                <li>Installing @lokiplay/sdk</li>
                <li>Writing game.json</li>
                <li>Room ready at play.lokiplay.cc/battleship</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="marketing-section" id="games" aria-labelledby="games-title">
      <div class="marketing-section-inner">
        <div class="split-heading games-heading">
          <p class="eyebrow">Built on Loki / Ready to play</p>
          <h2 id="games-title">Small games. Real players.</h2>
        </div>
        <div class="editorial-grid">
          <article class="editorial-card game-card">
            <div class="game-art game-art-ship" aria-hidden="true">
              <span class="mini-ship mini-ship-h"></span>
              <span class="mini-ship mini-ship-v"></span>
              <span class="mini-hit"></span>
              <span class="mini-splash"></span>
            </div>
            <div class="game-copy">
              <p class="card-index">Versus / 2 players</p>
              <h3>Battleship</h3>
              <p class="muted">Take shots in the same room. One grid, two captains.</p>
            </div>
          </article>
          <article class="editorial-card game-card">
            <div class="game-art game-art-pool" aria-hidden="true">
              <span class="pocket pocket-tl"></span>
              <span class="pocket pocket-tr"></span>
              <span class="pocket pocket-bl"></span>
              <span class="pocket pocket-br"></span>
              <i class="ball ball-cue"></i>
              <i class="ball ball-one"></i>
              <i class="ball ball-eight"></i>
            </div>
            <div class="game-copy">
              <p class="card-index">Versus / 2 players</p>
              <h3>Pool</h3>
              <p class="muted">Alternate shots on a shared table. Host state, no custom server.</p>
            </div>
          </article>
          <article class="editorial-card game-card">
            <div class="game-art game-art-chess" aria-hidden="true">
              <span class="chess-piece chess-king">♔</span>
              <span class="chess-piece chess-queen">♕</span>
              <span class="chess-piece chess-pawn">♙</span>
              <span class="chess-piece chess-knight">♞</span>
            </div>
            <div class="game-copy">
              <p class="card-index">Versus / 2 players</p>
              <h3>Chess</h3>
              <p class="muted">Live turns across a room. Reconnect without losing the board.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
    <section class="pricing-plans pricing-home" aria-labelledby="home-pricing">
      <h2 class="pricing-home-title" id="home-pricing">Pricing</h2>
${pricingPlans()}
    </section>

${closingBand()}
`;

const productMain = `
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Product</p>
          <h1 class="display" id="page-title">The whole path to play.</h1>
          <p class="lede">Hosting, multiplayer, distribution, agents, and the SDK — one plugin, one page. Jump to a section or read the whole path.</p>
          <div class="page-actions">
            <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get Started</a>
            <a class="button" href="${productSectionHref("hosting")}">Start with hosting</a>
          </div>
        </div>
        <aside class="page-aside" aria-label="Product sections">
          <div><strong>Hosting</strong><p>Scan, isolate, and serve a finished browser build.</p></div>
          <div><strong>Multiplayer</strong><p>Rooms, invites, and shared state without a server project.</p></div>
          <div><strong>Distribution</strong><p>Private while you iterate. Public when you mean it.</p></div>
        </aside>
      </div>
    </section>
    ${productSubnav("/product")}
    <section class="page-hero product-block" id="hosting" aria-labelledby="hosting-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Product / Hosting</p>
          <h2 class="display" id="hosting-title">A home for every build.</h2>
          <p class="lede">Upload a finished browser game. Loki scans it, isolates it, and gives you a playable URL. Every release stays immutable—activation changes the live build, never the history.</p>
          <div class="page-actions">
            <a class="button button-primary" href="https://app.lokiplay.cc/signup">Host a game</a>
            <a class="button" href="${productSectionHref("multiplayer")}">Add multiplayer</a>
          </div>
        </div>
        <aside class="page-aside" aria-label="Hosting facts">
          <div><strong>01 / Scan</strong><p>Unsafe or backend-dependent builds fail closed.</p></div>
          <div><strong>02 / Isolate</strong><p>Each game runs on its own origin under *.lokiplay.cc.</p></div>
          <div><strong>03 / Keep</strong><p>Releases are stored as records you can roll back to.</p></div>
        </aside>
      </div>
    </section>
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
    <section class="page-hero product-block" id="multiplayer" aria-labelledby="multiplayer-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Product / Multiplayer</p>
          <h2 class="display" id="multiplayer-title">Rooms without a server project.</h2>
          <p class="lede">Add rooms, invites, matchmaking, chat, shared state, and leaderboards through one SDK. Production play stays on Loki hosting—no leftover localhost server.</p>
          <div class="page-actions">
            <a class="button button-primary" href="https://app.lokiplay.cc/signup">Create a room</a>
            <a class="button" href="${productSectionHref("sdk")}">See the SDK</a>
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
    <section class="page-hero product-block" id="distribution" aria-labelledby="distribution-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Product / Distribution</p>
          <h2 class="display" id="distribution-title">Private first. Public when you mean it.</h2>
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
    <section class="page-hero product-block" id="agents" aria-labelledby="agents-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Product / Agents</p>
          <h2 class="display" id="agents-title">Built for the Agentic AI Era.</h2>
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
    <section class="page-hero product-block" id="sdk" aria-labelledby="sdk-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Product / SDK</p>
          <h2 class="display" id="sdk-title">One protocol. Four clients.</h2>
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
${closingBand()}
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
${closingBand()}
`;

const pricingMain = `
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Pricing</p>
          <h1 class="display" id="page-title">Start free.</h1>
          <p class="lede">Start free. Loki is $12 a month, or $8 a month billed annually.</p>
        </div>
      </div>
    </section>
    <section class="pricing-plans" aria-labelledby="plans-title">
      <h2 class="sr-only" id="plans-title">Plans</h2>
${pricingPlans()}
    </section>
    <section class="pricing-compare" aria-labelledby="compare-title">
      <h2 id="compare-title">Compare features across plans</h2>
      <div class="compare-wrap">
        <table class="compare-table pricing-compare-table">
          <thead>
            <tr><th></th><th>Free</th><th>Loki</th></tr>
          </thead>
          <tbody>
            <tr><td>Games</td><td>1</td><td>Unlimited</td></tr>
            <tr><td>Players per room</td><td>4</td><td>8</td></tr>
            <tr><td>Public catalog</td><td>—</td><td>Priority listing</td></tr>
          </tbody>
        </table>
      </div>
        <article class="pricing-card">
          <h3>Custom</h3>
          <p class="pricing-amount">Talk</p>
          <p class="pricing-note">For teams that need more rooms, review help, or a path that is not on the public plans.</p>
          <ul class="pricing-features">
            <li>Custom room and player caps</li>
            <li>Guided review and launch</li>
            <li>Direct operator contact</li>
            <li>Terms that match the team</li>
          </ul>
          <a class="button" href="/contact">Contact us</a>
        </article>
      </div>
    </section>
    <section class="pricing-compare" aria-labelledby="compare-title">
      <h2 id="compare-title">Compare features across plans</h2>
      <div class="compare-wrap">
        <table class="compare-table pricing-compare-table">
          <thead>
            <tr><th></th><th>Free</th><th>Studio</th><th>Custom</th></tr>
          </thead>
          <tbody>
            <tr><td>Secure hosting</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Private play links</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Multiplayer rooms</td><td>Capped</td><td>Higher caps</td><td>✓</td></tr>
            <tr><td>Public catalog</td><td>—</td><td>✓</td><td>✓</td></tr>
            <tr><td>Payouts</td><td>—</td><td>After launch</td><td>✓</td></tr>
            <tr><td>Priority support</td><td>—</td><td>✓</td><td>✓</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="pricing-custom" aria-labelledby="custom-title">
      <div class="pricing-custom-copy">
        <h2 id="custom-title">Need a custom plan?</h2>
        <p>If the public tiers do not fit the game, we can talk through rooms, review, and launch before anything is billed.</p>
      </div>
      <a class="button button-primary" href="/contact">Contact us</a>
        <article class="pricing-card">
          <h3>Custom</h3>
          <p class="pricing-amount">Talk</p>
          <p class="pricing-note">For teams that need more rooms, review help, or a path that is not on the public plans.</p>
          <ul class="pricing-features">
            <li>Custom room and player caps</li>
            <li>Guided review and launch</li>
            <li>Direct operator contact</li>
            <li>Terms that match the team</li>
          </ul>
          <a class="button" href="/contact">Contact us</a>
        </article>
      </div>
    </section>
    <section class="pricing-compare" aria-labelledby="compare-title">
      <h2 id="compare-title">Compare features across plans</h2>
      <div class="compare-wrap">
        <table class="compare-table pricing-compare-table">
          <thead>
            <tr><th></th><th>Free</th><th>Studio</th><th>Custom</th></tr>
          </thead>
          <tbody>
            <tr><td>Secure hosting</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Private play links</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Multiplayer rooms</td><td>Capped</td><td>Higher caps</td><td>✓</td></tr>
            <tr><td>Public catalog</td><td>—</td><td>✓</td><td>✓</td></tr>
            <tr><td>Payouts</td><td>—</td><td>After launch</td><td>✓</td></tr>
            <tr><td>Priority support</td><td>—</td><td>✓</td><td>✓</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="pricing-custom" aria-labelledby="custom-title">
      <div class="pricing-custom-copy">
        <h2 id="custom-title">Need a custom plan?</h2>
        <p>If the public tiers do not fit the game, we can talk through rooms, review, and launch before anything is billed.</p>
      </div>
      <a class="button button-primary" href="/contact">Contact us</a>
        <article class="pricing-card">
          <h3>Custom</h3>
          <p class="pricing-amount">Talk</p>
          <p class="pricing-note">For teams that need more rooms, review help, or a path that is not on the public plans.</p>
          <ul class="pricing-features">
            <li>Custom room and player caps</li>
            <li>Guided review and launch</li>
            <li>Direct operator contact</li>
            <li>Terms that match the team</li>
          </ul>
          <a class="button" href="/contact">Contact us</a>
        </article>
      </div>
    </section>
    <section class="pricing-compare" aria-labelledby="compare-title">
      <h2 id="compare-title">Compare features across plans</h2>
      <div class="compare-wrap">
        <table class="compare-table pricing-compare-table">
          <thead>
            <tr><th></th><th>Free</th><th>Studio</th><th>Custom</th></tr>
          </thead>
          <tbody>
            <tr><td>Secure hosting</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Private play links</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Multiplayer rooms</td><td>Capped</td><td>Higher caps</td><td>✓</td></tr>
            <tr><td>Public catalog</td><td>—</td><td>✓</td><td>✓</td></tr>
            <tr><td>Payouts</td><td>—</td><td>After launch</td><td>✓</td></tr>
            <tr><td>Priority support</td><td>—</td><td>✓</td><td>✓</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="pricing-custom" aria-labelledby="custom-title">
      <div class="pricing-custom-copy">
        <h2 id="custom-title">Need a custom plan?</h2>
        <p>If the public tiers do not fit the game, we can talk through rooms, review, and launch before anything is billed.</p>
      </div>
      <a class="button button-primary" href="/contact">Contact us</a>
        <article class="pricing-card">
          <h3>Custom</h3>
          <p class="pricing-amount">Talk</p>
          <p class="pricing-note">For teams that need more rooms, review help, or a path that is not on the public plans.</p>
          <ul class="pricing-features">
            <li>Custom room and player caps</li>
            <li>Guided review and launch</li>
            <li>Direct operator contact</li>
            <li>Terms that match the team</li>
          </ul>
          <a class="button" href="/contact">Contact us</a>
        </article>
      </div>
    </section>
    <section class="pricing-compare" aria-labelledby="compare-title">
      <h2 id="compare-title">Compare features across plans</h2>
      <div class="compare-wrap">
        <table class="compare-table pricing-compare-table">
          <thead>
            <tr><th></th><th>Free</th><th>Studio</th><th>Custom</th></tr>
          </thead>
          <tbody>
            <tr><td>Secure hosting</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Private play links</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Multiplayer rooms</td><td>Capped</td><td>Higher caps</td><td>✓</td></tr>
            <tr><td>Public catalog</td><td>—</td><td>✓</td><td>✓</td></tr>
            <tr><td>Payouts</td><td>—</td><td>After launch</td><td>✓</td></tr>
            <tr><td>Priority support</td><td>—</td><td>✓</td><td>✓</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="pricing-custom" aria-labelledby="custom-title">
      <div class="pricing-custom-copy">
        <h2 id="custom-title">Need a custom plan?</h2>
        <p>If the public tiers do not fit the game, we can talk through rooms, review, and launch before anything is billed.</p>
      </div>
      <a class="button button-primary" href="/contact">Contact us</a>
        <article class="pricing-card">
          <h3>Custom</h3>
          <p class="pricing-amount">Talk</p>
          <p class="pricing-note">For teams that need more rooms, review help, or a path that is not on the public plans.</p>
          <ul class="pricing-features">
            <li>Custom room and player caps</li>
            <li>Guided review and launch</li>
            <li>Direct operator contact</li>
            <li>Terms that match the team</li>
          </ul>
          <a class="button" href="/contact">Contact us</a>
        </article>
      </div>
    </section>
    <section class="pricing-compare" aria-labelledby="compare-title">
      <h2 id="compare-title">Compare features across plans</h2>
      <div class="compare-wrap">
        <table class="compare-table pricing-compare-table">
          <thead>
            <tr><th></th><th>Free</th><th>Studio</th><th>Custom</th></tr>
          </thead>
          <tbody>
            <tr><td>Secure hosting</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Private play links</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Multiplayer rooms</td><td>Capped</td><td>Higher caps</td><td>✓</td></tr>
            <tr><td>Public catalog</td><td>—</td><td>✓</td><td>✓</td></tr>
            <tr><td>Payouts</td><td>—</td><td>After launch</td><td>✓</td></tr>
            <tr><td>Priority support</td><td>—</td><td>✓</td><td>✓</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="pricing-custom" aria-labelledby="custom-title">
      <div class="pricing-custom-copy">
        <h2 id="custom-title">Need a custom plan?</h2>
        <p>If the public tiers do not fit the game, we can talk through rooms, review, and launch before anything is billed.</p>
      </div>
      <a class="button button-primary" href="/contact">Contact us</a>
        <article class="pricing-card">
          <h3>Custom</h3>
          <p class="pricing-amount">Talk</p>
          <p class="pricing-note">For teams that need more rooms, review help, or a path that is not on the public plans.</p>
          <ul class="pricing-features">
            <li>Custom room and player caps</li>
            <li>Guided review and launch</li>
            <li>Direct operator contact</li>
            <li>Terms that match the team</li>
          </ul>
          <a class="button" href="/contact">Contact us</a>
        </article>
      </div>
    </section>
    <section class="pricing-compare" aria-labelledby="compare-title">
      <h2 id="compare-title">Compare features across plans</h2>
      <div class="compare-wrap">
        <table class="compare-table pricing-compare-table">
          <thead>
            <tr><th></th><th>Free</th><th>Studio</th><th>Custom</th></tr>
          </thead>
          <tbody>
            <tr><td>Secure hosting</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Private play links</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Multiplayer rooms</td><td>Capped</td><td>Higher caps</td><td>✓</td></tr>
            <tr><td>Public catalog</td><td>—</td><td>✓</td><td>✓</td></tr>
            <tr><td>Payouts</td><td>—</td><td>After launch</td><td>✓</td></tr>
            <tr><td>Priority support</td><td>—</td><td>✓</td><td>✓</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="pricing-custom" aria-labelledby="custom-title">
      <div class="pricing-custom-copy">
        <h2 id="custom-title">Need a custom plan?</h2>
        <p>If the public tiers do not fit the game, we can talk through rooms, review, and launch before anything is billed.</p>
      </div>
      <a class="button button-primary" href="/contact">Contact us</a>
    </section>
${closingBand()}
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
${closingBand()}
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
    title: "Loki — Gaming Infrastructure for the Agentic Future.",
    description:
      "Hosting, multiplayer, social features, and distribution for vibe-coded games.",
    main: homeMain,
  },
  "/product": {
    title: "Product — Loki",
    description:
      "Hosting, multiplayer, distribution, agents, and the SDK for vibe-coded games.",
    main: productMain,
  },
  "/hosting": {
    title: "Hosting — Loki",
    description:
      "Scan, isolate, and host finished browser games on a secure Loki URL.",
    main: productMain,
  },
  "/multiplayer": {
    title: "Multiplayer — Loki",
    description:
      "Rooms, invites, matchmaking, and shared state without a server project.",
    main: productMain,
  },
  "/distribution": {
    title: "Distribution — Loki",
    description:
      "Keep games private while you build, then list them in the Loki catalog.",
    main: productMain,
  },
  "/agents": {
    title: "Agents — Loki",
    description:
      "Give coding agents one package, one protocol, and one set of Loki rules.",
    main: productMain,
  },
  "/sdk": {
    title: "SDK — Loki",
    description:
      "The Loki SDK for JavaScript, with Unity, Swift, and Kotlin on the same protocol.",
    main: productMain,
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

const productAliasToSection: Partial<Record<MarketingRoute, string>> = {
  "/hosting": "hosting",
  "/multiplayer": "multiplayer",
  "/distribution": "distribution",
  "/agents": "agents",
  "/sdk": "sdk",
};

function productScrollScript(path: MarketingRoute): string {
  if (path !== "/product" && !(path in productAliasToSection)) return "";
  return `
    const productAliases = {
      "/hosting": "hosting",
      "/multiplayer": "multiplayer",
      "/distribution": "distribution",
      "/agents": "agents",
      "/sdk": "sdk",
    };
    const pathName = location.pathname.replace(/\\/$/, "") || "/";
    const fromPath = productAliases[pathName];
    if (fromPath && !location.hash) {
      history.replaceState(null, "", "/product#" + fromPath);
      document.getElementById(fromPath)?.scrollIntoView();
    }
  `;
}

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
    moduleScript: productScrollScript(route),
  });
}
