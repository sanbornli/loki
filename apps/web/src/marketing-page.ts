import {
  renderProductPage,
  type ProductPageConfig,
} from "./product-theme.js";

const marketingStyles = `
.marketing-header {
  position: relative;
  z-index: 10;
  grid-template-columns: auto 1fr auto;
  gap: 3rem;
}

.marketing-nav,
.marketing-actions,
.hero-actions,
.agent-links {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.marketing-nav {
  justify-content: center;
  gap: clamp(1rem, 2.2vw, 2rem);
}

.marketing-nav a,
.footer-links a {
  color: var(--muted);
  font-size: 0.78rem;
  text-decoration: none;
}

.marketing-nav a:hover,
.footer-links a:hover {
  color: var(--paper);
}

.marketing-main {
  overflow: hidden;
}

.marketing-section {
  padding: clamp(4rem, 8vw, 7.5rem) var(--space);
  border-top: 1px solid var(--line);
}

.marketing-section-inner {
  width: min(100%, 106rem);
  margin: 0 auto;
}

.marketing-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(28rem, 0.9fr);
  gap: clamp(3rem, 7vw, 8rem);
  align-items: center;
  min-height: calc(100vh - 5.25rem);
  padding: clamp(4rem, 9vh, 7rem) var(--space);
}

.marketing-hero-copy {
  min-width: 0;
}

.marketing-hero .display {
  max-width: 10ch;
  font-size: clamp(3.4rem, 6.6vw, 7.6rem);
}

.marketing-hero .lede {
  max-width: 42rem;
}

.hero-actions {
  flex-wrap: wrap;
  margin-top: 2rem;
}

.game-montage {
  position: relative;
  min-width: 0;
  border: 1px solid var(--line-strong);
  background: var(--ink-raised);
}

.game-montage img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.montage-play {
  position: absolute;
  inset: 50% auto auto 50%;
  display: grid;
  width: 3.6rem;
  height: 3.6rem;
  place-items: center;
  border: 0;
  transform: translate(-50%, -50%);
  background: var(--amber);
  color: var(--ink);
  font-size: 1.2rem;
}

.montage-label {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  margin: 0;
  padding: 0.65rem 0.8rem;
  background: color-mix(in srgb, var(--ink) 92%, transparent);
  color: var(--paper);
  font-family: var(--mono);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.split-heading {
  display: grid;
  grid-template-columns: minmax(12rem, 0.7fr) minmax(0, 1.3fr);
  gap: 3rem;
  align-items: end;
  margin-bottom: clamp(2.5rem, 5vw, 4.5rem);
}

.split-heading h2 {
  max-width: 16ch;
  margin: 0;
  font-size: clamp(2.4rem, 4.5vw, 5.3rem);
  font-weight: 560;
  letter-spacing: -0.065em;
  line-height: 0.98;
}

.editorial-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  border: 1px solid var(--line);
  background: var(--line);
}

.editorial-card {
  min-width: 0;
  padding: clamp(1.5rem, 3vw, 2.5rem);
  background: var(--ink);
}

.editorial-card-raised {
  background: var(--ink-raised);
}

.card-index {
  margin: 0 0 2.2rem;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.editorial-card h3 {
  max-width: 15ch;
  margin: 0;
  font-size: clamp(1.65rem, 2.6vw, 3rem);
  font-weight: 560;
  letter-spacing: -0.05em;
  line-height: 1.03;
}

.editorial-card > p:not(.card-index) {
  max-width: 34rem;
  margin: 1.2rem 0 0;
  color: var(--muted);
  line-height: 1.65;
}

.feature-list {
  display: grid;
  gap: 0.5rem;
  margin: 2rem 0;
  padding: 1.25rem 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  color: var(--paper);
  font-size: 0.82rem;
  list-style: none;
}

.card-link,
.inline-link {
  color: var(--amber-bright);
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agent-section {
  background: var(--ink-raised);
}

.agent-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(28rem, 0.85fr);
  gap: clamp(3rem, 8vw, 9rem);
  align-items: center;
}

.agent-copy h2,
.final-copy h2 {
  max-width: 12ch;
  margin: 0;
  font-size: clamp(2.7rem, 5vw, 5.8rem);
  font-weight: 560;
  letter-spacing: -0.065em;
  line-height: 0.98;
}

.agent-copy > p:not(.eyebrow),
.final-copy > p:not(.eyebrow) {
  max-width: 40rem;
  margin: 1.5rem 0 0;
  color: var(--muted);
  font-size: 1.05rem;
  line-height: 1.65;
}

.agent-links {
  flex-wrap: wrap;
  margin-top: 2rem;
  gap: 1.5rem;
}

.docs-panel {
  border: 1px solid var(--line-strong);
  background: var(--ink);
}

.docs-panel-header,
.docs-row {
  display: grid;
  grid-template-columns: minmax(9rem, 0.8fr) minmax(0, 1.2fr);
  gap: 1rem;
  padding: 1rem 1.25rem;
}

.docs-panel-header {
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.docs-row {
  border-top: 1px solid var(--line);
  color: var(--quiet);
  font-size: 0.78rem;
}

.docs-row code {
  color: var(--paper);
  font-family: var(--mono);
}

.game-card {
  padding: 0;
  background: var(--ink-raised);
}

.game-art {
  display: grid;
  min-height: 10rem;
  place-items: center;
  border-bottom: 1px solid var(--line);
  background:
    linear-gradient(135deg, transparent 48%, color-mix(in srgb, var(--amber) 28%, transparent) 49%, transparent 51%),
    var(--ink);
  color: var(--amber);
  font-size: 4.5rem;
}

.game-copy {
  padding: 1.5rem;
}

.game-copy .card-index {
  margin-bottom: 0.8rem;
}

.game-copy h3 {
  font-size: clamp(1.5rem, 2.4vw, 2.5rem);
}

.final-section {
  background: var(--amber);
  color: var(--ink);
}

.final-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(20rem, 0.6fr);
  gap: clamp(3rem, 8vw, 9rem);
  align-items: center;
}

.final-copy .eyebrow,
.final-copy > p:not(.eyebrow) {
  color: var(--ink);
}

.final-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.25rem;
  margin-top: 2rem;
}

.final-button {
  border-color: var(--ink);
  color: var(--ink);
}

.final-button:hover {
  background: var(--ink);
  color: var(--paper);
}

.free-plan {
  padding: 1.75rem;
  background: var(--ink);
  color: var(--paper);
}

.free-plan .price {
  margin: 0.7rem 0 1rem;
  font-size: clamp(3rem, 5vw, 5rem);
  font-weight: 540;
  letter-spacing: -0.06em;
  line-height: 1;
}

.free-plan .feature-list {
  margin-bottom: 0;
  color: var(--muted);
}

.marketing-footer {
  padding: clamp(3.5rem, 7vw, 6rem) var(--space) 2rem;
}

.footer-grid {
  display: grid;
  grid-template-columns: minmax(18rem, 1.7fr) repeat(4, minmax(8rem, 0.65fr));
  gap: clamp(2rem, 5vw, 5rem);
}

.footer-brand p {
  max-width: 29rem;
  color: var(--muted);
}

.footer-column h3 {
  margin: 0 0 1rem;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.67rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.footer-links {
  display: grid;
  gap: 0.55rem;
}

.footer-base {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 4rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--line);
  color: var(--quiet);
  font-family: var(--mono);
  font-size: 0.62rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

@media (max-width: 68rem) {
  .marketing-nav {
    display: none;
  }

  .marketing-header {
    grid-template-columns: 1fr auto;
  }

  .marketing-hero,
  .agent-layout,
  .final-layout {
    grid-template-columns: 1fr;
  }

  .marketing-hero {
    min-height: auto;
  }

  .game-montage {
    width: min(100%, 48rem);
  }

  .footer-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .footer-brand {
    grid-column: 1 / -1;
  }
}

@media (max-width: 48rem) {
  .marketing-header .button-quiet {
    display: none;
  }

  .marketing-hero .display {
    font-size: clamp(3.2rem, 15vw, 5.5rem);
  }

  .split-heading,
  .editorial-grid {
    grid-template-columns: 1fr;
  }

  .split-heading {
    gap: 1.5rem;
  }

  .docs-panel-header,
  .docs-row {
    grid-template-columns: 1fr;
  }

  .footer-grid {
    grid-template-columns: 1fr 1fr;
  }

  .footer-base {
    flex-direction: column;
  }
}
`;

const body = `
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header marketing-header">
    <a class="brand" href="/" aria-label="Loki home">
      <span class="brand-mark" aria-hidden="true"></span>
      <span>LOKI</span>
    </a>
    <nav class="marketing-nav" aria-label="Primary navigation">
      <a href="#product">Product</a>
      <a href="https://docs.lokiplay.cc/">Docs ↗</a>
      <a href="#games">Examples</a>
      <a href="#pricing">Pricing</a>
      <a href="https://play.lokiplay.cc/">Play ↗</a>
    </nav>
    <div class="marketing-actions">
      <a class="button button-quiet" href="https://app.lokiplay.cc/login">Log in</a>
      <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get Started</a>
    </div>
  </header>

  <main class="marketing-main" id="main-content">
    <section class="marketing-hero marketing-section-inner" aria-labelledby="hero-title">
      <div class="marketing-hero-copy">
        <p class="eyebrow">One plugin. The whole path to play.</p>
        <h1 class="display" id="hero-title">The only plugin you need for your vibe-coded games.</h1>
        <p class="lede">Give your game hosting, multiplayer, social features, and a way to get discovered—without wiring together five separate services.</p>
        <div class="hero-actions">
          <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get Started</a>
          <a class="button" href="#workflow">See how it works</a>
        </div>
      </div>
      <figure class="game-montage">
        <img src="/assets/loki-vibecoded-game-montage.png" alt="Illustrative gameplay from a space relay game, a tile puzzle, and a multiplayer cooking game">
        <button class="montage-play" type="button" aria-label="Play gameplay montage">▶</button>
        <figcaption class="montage-label">3 vibe-coded games / 00:24</figcaption>
      </figure>
    </section>

    <section class="marketing-section" id="workflow" aria-labelledby="workflow-title">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">From localhost to live</p>
          <h2 id="workflow-title">One plugin. Every missing piece.</h2>
        </div>
        <div class="editorial-grid">
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
    </section>

    <section class="marketing-section" id="product" aria-labelledby="product-title">
      <div class="marketing-section-inner">
        <div class="split-heading">
          <p class="eyebrow">The stack, in one plugin</p>
          <h2 id="product-title">Its only a game when there are players.</h2>
        </div>
        <div class="editorial-grid">
          <article class="editorial-card editorial-card-raised">
            <p class="card-index">01 / Hosting</p>
            <h3>A home for every build.</h3>
            <p>Ship a finished browser game to a secure Loki URL. Every upload is scanned, isolated, and saved as an immutable release.</p>
            <ul class="feature-list">
              <li>Private previews</li>
              <li>Global asset delivery</li>
              <li>No backend to maintain</li>
            </ul>
            <a class="card-link" href="#workflow">See hosting →</a>
          </article>
          <article class="editorial-card editorial-card-raised">
            <p class="card-index">02 / Multiplayer</p>
            <h3>Multiplayer without the server project.</h3>
            <p>Add rooms, invites, matchmaking, chat, shared state, and leaderboards through one game-ready SDK.</p>
            <ul class="feature-list">
              <li>Rooms and matchmaking</li>
              <li>Reconnect and host migration</li>
              <li>Identity across every game</li>
            </ul>
            <a class="card-link" href="#workflow">See multiplayer →</a>
          </article>
          <article class="editorial-card editorial-card-raised">
            <p class="card-index">03 / Distribution</p>
            <h3>A path from private link to public game.</h3>
            <p>Keep it private while you experiment. When the game is ready, make it public and share one playable link.</p>
            <ul class="feature-list">
              <li>Reviewed catalog</li>
              <li>Public game page</li>
              <li>Tips and revenue share</li>
            </ul>
            <a class="card-link" href="https://play.lokiplay.cc/">See distribution →</a>
          </article>
        </div>
      </div>
    </section>

    <section class="marketing-section agent-section" aria-labelledby="agent-title">
      <div class="marketing-section-inner agent-layout">
        <div class="agent-copy">
          <p class="eyebrow">Made for how games get built now</p>
          <h2 id="agent-title">Just leave it to your Agent.</h2>
          <p>Loki gives coding agents one canonical source for packages, platform rules, validation, and deployment. They can integrate the game correctly without inventing another backend.</p>
          <div class="agent-links">
            <a class="inline-link" href="https://docs.lokiplay.cc/agents">Open agent docs ↗</a>
            <a class="inline-link" href="https://docs.lokiplay.cc/mcp">Connect MCP ↗</a>
          </div>
        </div>
        <div class="docs-panel" aria-label="Machine-readable documentation">
          <div class="docs-panel-header"><span>docs.lokiplay.cc</span><span>Public</span></div>
          <div class="docs-row"><code>/quickstart</code><span>Get running in five minutes</span></div>
          <div class="docs-row"><code>/agents</code><span>Canonical integration rules</span></div>
          <div class="docs-row"><code>/llms.txt</code><span>Agent-readable product summary</span></div>
          <div class="docs-row"><code>/llms-full.txt</code><span>Every doc in one file</span></div>
          <div class="docs-row"><code>/openapi.json</code><span>Control-plane API contract</span></div>
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
              <p class="card-index">Co-op / 2–4 players</p>
              <h3>Orbital Relay</h3>
              <p class="muted">Pass the signal together before the orbit closes.</p>
            </div>
          </article>
          <article class="editorial-card game-card">
            <div class="game-art" aria-hidden="true">×</div>
            <div class="game-copy">
              <p class="card-index">Puzzle / 1–8 players</p>
              <h3>Moss &amp; Match</h3>
              <p class="muted">A quiet puzzle party about patterns and memory.</p>
            </div>
          </article>
          <article class="editorial-card game-card">
            <div class="game-art" aria-hidden="true">○</div>
            <div class="game-copy">
              <p class="card-index">Party / 3–6 players</p>
              <h3>Signal Kitchen</h3>
              <p class="muted">Cook together while every instruction changes.</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="marketing-section final-section" id="pricing" aria-labelledby="final-title">
      <div class="marketing-section-inner final-layout">
        <div class="final-copy">
          <p class="eyebrow">One plugin. Zero infrastructure sprawl.</p>
          <h2 id="final-title">Give your game somewhere to go.</h2>
          <p>Start free with private hosting, add multiplayer when you need it, and go public only when you are ready.</p>
          <div class="final-actions">
            <a class="button final-button" href="https://app.lokiplay.cc/signup">Create free project ↗</a>
            <a class="inline-link" href="#pricing">Compare plans →</a>
          </div>
        </div>
        <aside class="free-plan" aria-label="Free plan">
          <p class="eyebrow">Free to start</p>
          <p class="price">$0</p>
          <ul class="feature-list">
            <li>Private projects</li>
            <li>Small multiplayer rooms</li>
            <li>Usage caps with no surprise bill</li>
            <li>Community support</li>
          </ul>
        </aside>
      </div>
    </section>
  </main>

  <footer class="marketing-footer">
    <div class="marketing-section-inner">
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span><span>LOKI</span></a>
          <p>Everything your vibe-coded game needs to go from local prototype to a game people can play.</p>
          <a class="card-link" href="https://play.lokiplay.cc/">Play games ↗</a>
        </div>
        <div class="footer-column"><h3>Product</h3><div class="footer-links"><a href="#product">Hosting</a><a href="#product">Multiplayer</a><a href="#product">Distribution</a><a href="#pricing">Pricing</a></div></div>
        <div class="footer-column"><h3>Developers</h3><div class="footer-links"><a href="https://docs.lokiplay.cc/">Docs</a><a href="https://docs.lokiplay.cc/quickstart">Quickstart</a><a href="https://docs.lokiplay.cc/sdk">SDK</a><a href="https://docs.lokiplay.cc/mcp">MCP</a></div></div>
        <div class="footer-column"><h3>Company</h3><div class="footer-links"><a href="/about">About</a><a href="/blog">Blog</a><a href="/changelog">Changelog</a><a href="/contact">Contact</a></div></div>
        <div class="footer-column"><h3>Legal</h3><div class="footer-links"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/aup">Acceptable Use</a><a href="/dmca">DMCA</a></div></div>
      </div>
      <div class="footer-base"><span>© 2026 Loki Play</span><span>docs.lokiplay.cc · app.lokiplay.cc · play.lokiplay.cc</span></div>
    </div>
  </footer>
`;

export function renderMarketingPage(config: ProductPageConfig): string {
  return renderProductPage({
    config,
    title: "Loki — The only plugin you need for your vibe-coded games",
    description:
      "Hosting, multiplayer, social features, and distribution for vibe-coded games.",
    body,
    styles: marketingStyles,
    moduleScript: "",
    bodyClass: "marketing-product",
  });
}
