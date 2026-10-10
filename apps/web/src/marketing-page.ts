import {
  closingBand,
  isMarketingRoute,
  normalizeMarketingPath,
  productSectionHref,
  renderMarketingSite,
  type MarketingRoute,
} from "./marketing-site.js";
import { aupMain, privacyMain, termsMain } from "./legal-copy.js";
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
              <li>2 stored games, 1 active</li>
              <li>100 MiB of builds</li>
              <li>2 rooms at the same time</li>
              <li>4 players per room</li>
              <li>Host authoritative</li>
            </ul>
            <a class="button" href="https://app.lokiplay.cc/signup">Get started</a>
          </article>
          <article class="pricing-card pricing-card-featured">
            <h3>Loki</h3>
            <p class="pricing-amount"><span class="price-monthly">$12</span><span class="price-annual"><s class="price-was">$12</s>$8</span></p>
            <p class="pricing-period"><span class="price-monthly">per month</span><span class="price-annual">per month, billed annually</span></p>
            <ul class="pricing-features">
              <li>20 stored games, 20 active</li>
              <li>500 MiB of builds</li>
              <li>8 players per room</li>
              <li>Play links</li>
              <li>Host and server authoritative</li>
            </ul>
            <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get Loki</a>
          </article>
          <article class="pricing-card">
            <h3>Loki Pro</h3>
            <p class="pricing-amount"><span class="price-monthly">$20</span><span class="price-annual"><s class="price-was">$20</s>$15</span></p>
            <p class="pricing-period"><span class="price-monthly">per month</span><span class="price-annual">per month, billed annually</span></p>
            <ul class="pricing-features">
              <li>Unlimited games</li>
              <li>2 GiB of builds</li>
              <li>Unlimited links</li>
              <li>8 players per room</li>
              <li>Host and server authoritative</li>
            </ul>
            <a class="button" href="https://app.lokiplay.cc/signup">Get Loki Pro</a>
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
        <p class="platform-note">Loki hosts finished web JavaScript games. Support for Unity, Godot, iOS, and Android are coming soon.</p>
      </div>
      <figure class="game-stage hero-montage" aria-label="A montage of vibe-coded games: racing, shooting, and chess.">
        <video class="dist-montage" autoplay muted loop playsinline poster="/assets/loki-game-montage.webp" src="/assets/loki-game-montage.mp4"></video>
      </figure>
    </section>

    <section class="marketing-section" id="workflow" aria-labelledby="workflow-title">
      <div class="marketing-section-inner">
        <div class="feature-row feature-row-flip workflow-row">
          <div class="feature-copy">
            <h2 id="workflow-title">From side project<br>to Global Game<br>in a single prompt.</h2>
            <p>Give your game hosting, a shareable game link, real-time online multiplayer and game publishing without managing multiple different services (and paying all of them).</p>
            <a class="card-link" href="https://docs.lokiplay.cc/sdk">See the SDK →</a>
          </div>
          <div class="editorial-grid editorial-stack party-flow" aria-label="Install-to-party timeline">
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
              <p>Get a canonical play link for every game to share with your players.</p>
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
              <h3 class="play-title">Great games<br>are meant to be<br>played together.</h3>
              <p>Add real-time, synchronised online multiplayer, public rooms, private rooms, invites, matchmaking, and leaderboards without the trial and error of network infrastructure code.</p>
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
              <p class="card-index">03 / Earn <span class="button button-primary soon-tag">Coming soon</span></p>
              <h3 class="play-title">Start earning<br>from Day One.</h3>
              <p>Skip waiting for weeks to get published. Earn from every link opened with your game, today.</p>
            </div>
            <div class="feature-stage scene-board" aria-label="Battleship listed live on play.lokiplay.cc, with opens and creator share">
              <div class="live-listing">
                <p class="live-listing-url">play.lokiplay.cc/battleship</p>
                <div class="live-listing-game">
                  <i>B</i>
                  <span><strong>Battleship</strong><em>Public</em></span>
                  <b>Live</b>
                </div>
                <div class="live-listing-metrics">
                  <p><strong>24</strong><span>Opened today</span></p>
                  <p><strong>On</strong><span>Creator share</span></p>
                </div>
              </div>
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
            <a class="inline-link" href="https://docs.lokiplay.cc/sdk">See the SDK →</a>
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

    <section class="pricing-plans pricing-home" aria-labelledby="home-pricing">
      <h2 class="pricing-home-title" id="home-pricing">Pricing</h2>
${pricingPlans()}
    </section>

    <section class="home-faq" aria-labelledby="faq-title">
      <div class="home-faq-inner">
        <h2 id="faq-title">FAQs</h2>
        <div class="faq-list">
          <details class="faq-item" open>
            <summary>What is Loki?</summary>
            <p>Loki is infrastructure created for AI agent-built games. It provides these games with instant hosting, game-sharing and online multiplayer so you don't need to wire together multiple services and spend time back and forth configuring them.</p>
          </details>
          <details class="faq-item">
            <summary>How does an agent add Loki?</summary>
            <p>Log in to Loki. Create a project and paste the provided prompt into Cursor, Claude Code, Codex, or a similar agent. The agent installs the SDK, follows the Loki rules, and ships the build automatically. You only need to do this once.</p>
          </details>
          <details class="faq-item">
            <summary>What do players get?</summary>
            <p>A stable play link that they can immediately use to play your game, and multiplayer service so they can play with each other wherever they are. Later releases ship to the same destination, so you can keep updating the game without sending players a new link each time.</p>
          </details>
          <details class="faq-item">
            <summary>Can friends play a game that is still rough?</summary>
            <p>Yes. The free plan includes private hosting, so friends can play while the game is still a draft. You choose when it is ready for more.</p>
          </details>
          <details class="faq-item">
            <summary>What is host authority, and what is server authority?</summary>
            <p>Host authority runs the match on a player's computer. That is the default on every plan. Server authority is on Loki and Loki Pro: you ship a pure step module, and Loki runs that step for the room.</p>
          </details>
          <details class="faq-item">
            <summary>How much does Loki cost?</summary>
            <p>Loki is free to start on the free plan, which includes one game, two rooms at the same time, and four players per room.</p>
          </details>
        </div>
      </div>
    </section>

${closingBand()}
`;

const hostingPanel = `
        <figure class="host-laptop">
          <img class="host-image" src="/assets/loki-hosting-pool.jpg" width="1152" height="864" alt="A live Pool game running in a browser at play.lokiplay.cc/pool, with a copied link and a player joining" loading="lazy">
        </figure>`;

const multiplayerPanel = `
        <figure class="world-net-frame" aria-label="Players around the world connected through a network">
          <video class="world-net" autoplay muted loop playsinline poster="/assets/loki-world-network.webp" src="/assets/loki-world-network.mp4"></video>
        </figure>`;

const agentsPanel = `
        <div class="docs-panel" aria-label="Agent documentation">
          <div class="docs-panel-header"><span>docs.lokiplay.cc</span><span>For humans and agents</span></div>
          <div class="docs-row"><code>/agents</code><span>Canonical integration rules</span></div>
          <div class="docs-row"><code>/mcp</code><span>Connect Loki as an MCP server</span></div>
          <div class="docs-row"><code>/llms.txt</code><span>Short product summary</span></div>
          <div class="docs-row"><code>/llms-full.txt</code><span>Every doc in one file</span></div>
        </div>`;

const productMain = `
    <section class="grok-hero" aria-labelledby="page-title">
      <h1 class="display" id="page-title">From side project<br>to Global Game<br>in a single prompt.</h1>
      <p class="lede">Hosting, online multiplayer, distribution — everything your game needs in one plugin, one package. Ship your game for the world to play together in minutes.</p>
      <div class="page-actions">
        <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get Started for Free</a>
        <a class="button" href="https://docs.lokiplay.cc/">Read Docs</a>
      </div>
    </section>
    <section class="grok-stage" data-active="hosting" aria-label="Product capabilities">
      <div class="grok-stage-grid">
        <div class="grok-features">
          <article class="grok-feature" id="hosting">
            <h2>A home for every Game.</h2>
            <p>Upload a playable game to Loki and receive a playable link which you can share or publish immediately. Every subsequent release is shipped to the same link so you don't need to send your players a new one after each update.</p>
            <ul class="grok-checks">
              <li>Each game runs on its own origin under *.lokiplay.cc.</li>
              <li>Give your game a customised, playable link.</li>
              <li>Solve all your hosting needs with one prompt.</li>
            </ul>
            <div class="grok-inline-panel">${hostingPanel}</div>
          </article>
          <article class="grok-feature" id="multiplayer">
            <h2>Instant live multiplayer without the manual setup.</h2>
            <p>Add multiplayer, rooms, invites, shared state, and leaderboards through one SDK so your players can play with anyone, anywhere.</p>
            <ul class="grok-checks">
              <li>Online game rooms with presence, late join, and reconnect.</li>
              <li>Share an invite code for private rooms or find open games in a room lobby.</li>
              <li>One-step online multiplayer setup</li>
            </ul>
            <div class="grok-inline-panel">${multiplayerPanel}</div>
          </article>
        </div>
        <div class="grok-visual" aria-hidden="true">
          <div class="grok-sticky">
            <div class="grok-panel" data-panel="hosting">${hostingPanel}</div>
            <div class="grok-panel" data-panel="multiplayer">${multiplayerPanel}</div>
          </div>
        </div>
      </div>
    </section>
    <section class="mp-board" aria-label="Ways to play together">
      <div class="mp-grid">
        <article class="mp-card" id="public-rooms">
          <h2>Public Rooms</h2>
          <p>Open a game and let anyone looking for a match hop in. Players find a room that's already going and join from the lobby.</p>
          <div class="mp-scene mp-shot"><img src="/assets/loki-mp-public-rooms.jpg" width="1024" height="768" alt="Public rooms screen listing four open games with Join buttons" loading="lazy"></div>
        </article>
        <article class="mp-card" id="private-rooms">
          <h2>Private Rooms</h2>
          <p>Keep the game to the people you choose. Send a code or a link, and only those players get in.</p>
          <div class="mp-scene mp-shot"><img src="/assets/loki-mp-private-rooms.jpg" width="1024" height="768" alt="Private room screen showing the room code 482917 and a Copy button" loading="lazy"></div>
        </article>
        <article class="mp-card" id="matchmaking">
          <h2>Matchmaking</h2>
          <p>Players who want a game get one. Loki pairs people who are ready and puts them straight into a match.</p>
          <div class="mp-scene mp-shot"><img src="/assets/loki-mp-matchmaking.jpg" width="1024" height="768" alt="Match found screen pairing You with Adam" loading="lazy"></div>
        </article>
        <article class="mp-card" id="leaderboard">
          <h2>Leaderboard</h2>
          <p>Every win has a place on the board. Players see who's ahead and come back to take the top spot.</p>
          <div class="mp-scene mp-shot"><img src="/assets/loki-mp-leaderboard.jpg" width="1024" height="768" alt="Leaderboard screen ranking Adam, Eve and You" loading="lazy"></div>
        </article>
        <article class="mp-card mp-card-wide" id="network">
          <h2>Network</h2>
          <p>Your players can be anywhere and still share one game. If someone steps away, they can come back to the match they left.</p>
          <div class="mp-scene mp-shot"><img src="/assets/loki-mp-network.jpg" width="1024" height="768" alt="Room screen showing You, Adam and Eve connected, with Eve back in" loading="lazy"></div>
        </article>
      </div>
    </section>
    <section class="grok-stage grok-stage-stack" data-active="agents" aria-label="Agents">
      <div class="grok-stage-grid">
        <div class="grok-features">
          <article class="grok-feature is-centered" id="agents">
            <h2>Built for the Agentic AI Era.</h2>
            <p>Seamless integration with your development setup in Cursor, Claude Code, Codex and similar agentic tools. Loki gives them one prompt, one package and one protocol. Just leave it to your Agent.</p>
            <ul class="grok-checks">
              <li>Copy the project prompt from the creator desk.</li>
              <li>The agent installs the SDK and follows the agent skills in the Loki package.</li>
              <li>Validate and deploy your game all within your existing setup. No separate application needed.</li>
            </ul>
            <div class="grok-inline-panel">${agentsPanel}</div>
          </article>
        </div>
      </div>
    </section>
    <section class="grok-stage grok-stage-stack" data-active="platforms" aria-label="Platforms">
      <div class="grok-stage-grid">
        <div class="grok-features">
          <article class="grok-feature is-centered" id="platforms">
            <h2>Built for web JavaScript games today.</h2>
            <p>Loki hosts finished web JavaScript games. Support for Unity, Godot, iOS, and Android are coming soon. If your game is built with one of those, hold off on installing until it is supported.</p>
            <ul class="grok-checks">
              <li>Ship a finished browser build: HTML, JavaScript, and the assets it loads.</li>
              <li>Rooms, invites, and shared state come from the JavaScript SDK.</li>
              <li>Unity, Godot, iOS, and Android support is on the way.</li>
            </ul>
          </article>
        </div>
      </div>
    </section>
    <section class="marketing-section grok-start" aria-labelledby="start-title">
      <div class="marketing-section-inner">
        <div class="grok-section-intro">
          <h2 id="start-title">Get started</h2>
          <p>Start free with private hosting. Add a room when you need one, and go public only when you mean it.</p>
        </div>
        <ol class="grok-steps">
          <li><span>01</span><h3>Sign Up</h3><p>Sign up on the Loki website to open your creator account.</p></li>
          <li><span>02</span><h3>Create a project</h3><p>Open Projects and create a project for your game. Each project gets its own agent prompt and release history.</p></li>
          <li><span>03</span><h3>Install Loki</h3><p>Copy the agent prompt from your project and paste it into your coding agent to install Loki.</p></li>
          <li><span>04</span><h3>Let it run</h3><p>The agent will install the official Loki packages, connect this project, and ship the build.</p></li>
        </ol>
        <div class="page-actions">
          <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get Started</a>
          <a class="button" href="https://docs.lokiplay.cc/sdk">SDK docs ↗</a>
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
          <p class="lede">Start free. Loki is $12 a month, or $8 a month billed annually. Loki Pro is $20 a month, or $15 a month billed annually.</p>
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
            <tr><th></th><th>Free</th><th>Loki</th><th>Loki Pro</th></tr>
          </thead>
          <tbody>
            <tr><td>Stored games</td><td>2</td><td>20</td><td>Unlimited</td></tr>
            <tr><td>Active games</td><td>1</td><td>20</td><td>Unlimited</td></tr>
            <tr><td>Stored builds</td><td>100 MiB</td><td>500 MiB</td><td>2 GiB</td></tr>
            <tr><td>Players per room</td><td>4</td><td>8</td><td>8</td></tr>
            <tr><td>Public catalog</td><td>Closed</td><td>Closed</td><td>Closed</td></tr>
            <tr><td>Authority</td><td>Host</td><td>Host and server</td><td>Host and server</td></tr>
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
          <p class="eyebrow">About</p>
          <h1 class="display" id="page-title">Built so agents can ship a game people play.</h1>
          <p class="lede">Loki is an agent-friendly product for game creators. Hosting and multiplayer live in one place, so an agent can add both with ease.</p>
        </div>
      </div>
    </section>
    <section class="marketing-section" aria-labelledby="vision-title">
      <div class="marketing-section-inner about-vision">
        <p class="eyebrow">The vision</p>
        <h2 id="vision-title">From a local prototype to a game with friends in it.</h2>
        <p>Games are being written in conversation now. The creator directs. The agent writes. Loki is the product that agent can actually use: one SDK, one play link, and rooms that open when the prompt asks for them.</p>
        <p>Hosting and multiplayer belong in the same step. Paste the project prompt into the agent you already use. It installs Loki, ships the build, and hands back a link. Players open it. Friends join the room. The match stays in sync. You stay in the editor.</p>
        <p>That is the vision. A game should be able to leave localhost tonight, because the path was made for agents and for the people directing them.</p>
      </div>
    </section>
${closingBand()}
`;

const contactMain = `
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-inner">
        <div>
          <p class="eyebrow">Contact</p>
          <h1 class="display" id="page-title">Contact</h1>
          <p class="lede"><a class="contact-email" href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a></p>
        </div>
      </div>
    </section>
`;

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
      "The Loki SDK for web JavaScript games. Support for Unity, Godot, iOS, and Android are coming soon.",
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
      "Loki is an agent-friendly product for game creators to add hosting and multiplayer.",
    main: aboutMain,
  },
  "/contact": {
    title: "Contact — Loki",
    description: "Contact Loki at contact@lokiplay.cc.",
    main: contactMain,
  },
  "/terms": {
    title: "Terms of Service — Loki",
    description:
      "Terms of Service for Loki, operated by Reveflo Technologies Limited.",
    main: termsMain,
  },
  "/privacy": {
    title: "Privacy Policy — Loki",
    description:
      "Privacy Policy for Loki, operated by Reveflo Technologies Limited.",
    main: privacyMain,
  },
  "/aup": {
    title: "Acceptable Use Policy — Loki",
    description:
      "Acceptable Use Policy for Loki, operated by Reveflo Technologies Limited.",
    main: aupMain,
  },
};

const productAliasToSection: Partial<Record<MarketingRoute, string>> = {
  "/hosting": "hosting",
  "/multiplayer": "multiplayer",
  "/distribution": "distribution",
  "/agents": "agents",
};

function faqScript(path: MarketingRoute): string {
  if (path !== "/") return "";
  return `
    const faqs = [...document.querySelectorAll(".faq-item")];
    for (const item of faqs) {
      item.addEventListener("toggle", () => {
        if (!item.open) return;
        for (const other of faqs) if (other !== item) other.open = false;
      });
    }
  `;
}

function productScrollScript(path: MarketingRoute): string {
  if (path !== "/product" && path !== "/sdk" && !(path in productAliasToSection)) return "";
  return `
    const productAliases = {
      "/hosting": "hosting",
      "/multiplayer": "multiplayer",
      "/distribution": "distribution",
      "/agents": "agents",
    };
    const pathName = location.pathname.replace(/\\/$/, "") || "/";
    const fromPath = productAliases[pathName];
    if (fromPath && !location.hash) {
      history.replaceState(null, "", "/product#" + fromPath);
      document.getElementById(fromPath)?.scrollIntoView();
    }
    const stages = [...document.querySelectorAll(".grok-stage")];
    for (const stage of stages) {
      const features = [...stage.querySelectorAll(".grok-feature")];
      if (!features.length) continue;
      const panelFor = (feature) => feature.dataset.panel || feature.id;
      const setActive = (feature) => { stage.dataset.active = panelFor(feature); };
      setActive(features[0]);
      const observer = new IntersectionObserver((entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target);
      }, { rootMargin: "-35% 0px -45% 0px", threshold: [0.25, 0.6] });
      for (const feature of features) observer.observe(feature);
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
    moduleScript: `${productScrollScript(route)}\n${faqScript(route)}`,
  });
}
