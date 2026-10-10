import {
  brandMarkHtml,
  type ProductPageConfig,
  renderProductPage,
  serializeInlineJson,
} from "./product-theme.js";

/**
 * Reasons an operator can pick when suspending a game. The chosen text is
 * stored as the suspension reason and shown to the creator on that game.
 */
export const SUSPENSION_REASONS = [
  "Violates the Terms of Service",
  "Violates the Acceptable Use Policy",
  "Illegal content",
  "Malware, phishing, or mining",
  "Intellectual property complaint",
] as const;

const pageStyles = `
body.operator-dashboard .operator-header { display: none; }
body.operator-dashboard .page-shell { width: 100%; max-width: none; margin: 0; padding: 0; }

.operator-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  padding: 1.25rem var(--space);
  border-bottom: 1px solid var(--line);
}
.operator-role {
  color: var(--amber);
  font-size: .72rem;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.auth-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(21rem, .8fr);
  gap: clamp(2.5rem, 5vw, 5rem);
  align-items: center;
  min-height: calc(100vh - 6rem);
  padding-block: clamp(3rem, 7vw, 6rem);
}
.auth-intro h1 {
  max-width: 10ch;
  margin: 0 0 1.5rem;
  font-size: clamp(2.8rem, 5.5vw, 5.4rem);
  font-weight: 470;
  letter-spacing: -.06em;
  line-height: 1;
}
.auth-intro p:last-child { max-width: 34rem; color: var(--muted); line-height: 1.65; }
.auth-card { padding: clamp(1.5rem, 4vw, 2.5rem); border: 1px solid var(--line); background: var(--ink-raised); }
.auth-card h2 { margin: 0 0 .6rem; font-weight: 520; }
.auth-card > p { margin: 0 0 2rem; color: var(--muted); line-height: 1.55; }
.form-stack { display: grid; gap: 1.1rem; }
.form-stack label {
  display: block;
  margin-bottom: .55rem;
  color: var(--muted);
  font-size: .72rem;
  font-weight: 680;
  letter-spacing: .07em;
  text-transform: uppercase;
}
.form-stack input {
  width: 100%;
  min-height: 3.15rem;
  padding: .72rem .82rem;
  border: 1px solid var(--line-strong);
  border-radius: 0;
  background: #0c0c09;
  color: var(--paper);
}
.form-stack input:focus { border-color: var(--amber); outline: 1px solid var(--amber); }
.form-stack button { margin-top: .5rem; }
.form-message { min-height: 1.5rem; margin: 1rem 0 0; color: var(--danger); line-height: 1.5; }
.access-denied {
  max-width: 44rem;
  margin: clamp(5rem, 15vh, 10rem) auto;
  padding: clamp(2rem, 5vw, 4rem);
  border: 1px solid var(--danger);
  background: var(--ink-raised);
}
.access-denied h1 { margin: .4rem 0 1rem; font-size: clamp(2.4rem, 5vw, 4.6rem); font-weight: 480; }
.access-denied p { color: var(--muted); line-height: 1.65; }

.dashboard-shell {
  display: grid;
  grid-template-columns: 15.5rem minmax(0, 1fr);
  align-items: start;
  min-height: 100vh;
  min-height: 100dvh;
}
.dashboard-shell.sidebar-collapsed { grid-template-columns: 4.75rem minmax(0, 1fr); }
.dashboard-sidebar {
  position: sticky;
  top: 0;
  display: flex;
  height: 100vh;
  height: 100dvh;
  flex-direction: column;
  gap: 2.25rem;
  padding: 1.75rem 1.25rem;
  border-right: 1px solid var(--line-strong);
  background: var(--ink-raised);
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--line);
}
.dashboard-sidebar .brand { min-width: 0; }
.sidebar-toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
}
.sidebar-toggle svg { width: 1rem; height: 1rem; stroke: currentColor; }
.dashboard-shell.sidebar-collapsed .sidebar-head { justify-content: center; }
.dashboard-shell.sidebar-collapsed .brand { display: none; }
.dashboard-shell.sidebar-collapsed .nav-label,
.dashboard-shell.sidebar-collapsed .account-label,
.dashboard-shell.sidebar-collapsed .logout-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.dashboard-shell.sidebar-collapsed .sidebar-toggle svg { transform: scaleX(-1); }
.dashboard-shell.sidebar-collapsed .nav-item {
  justify-content: center;
  padding-right: .55rem;
  padding-left: .55rem;
}
.dashboard-shell.sidebar-collapsed .sidebar-account { justify-items: center; }
.sidebar-nav { display: grid; gap: .15rem; }
.nav-item {
  display: flex;
  align-items: center;
  gap: .65rem;
  padding: .75rem;
  border: 1px solid transparent;
  border-left: 2px solid transparent;
  background: transparent;
  color: var(--muted);
  font-size: .74rem;
  font-weight: 720;
  letter-spacing: .08em;
  text-align: left;
  text-transform: uppercase;
}
.nav-item svg { flex: none; width: 1.05rem; height: 1.05rem; stroke: currentColor; }
.nav-item:hover:not(:disabled) { border-color: var(--line); background: var(--ink); color: var(--paper); }
.nav-item[aria-current="page"] { border-left-color: var(--amber); background: var(--ink); color: var(--amber); }
.sidebar-account {
  display: grid;
  gap: .5rem;
  margin-top: auto;
  padding-top: 1.5rem;
  border-top: 1px solid var(--line);
}
.sidebar-account .account-label {
  color: var(--amber);
  font-size: .72rem;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.sidebar-account .text-button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: .45rem;
  width: calc(100% + 1.3rem);
  margin-left: -.65rem;
  padding: .45rem .65rem;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  font-size: .78rem;
  text-decoration: none;
}
.sidebar-account .text-button:hover { border-color: var(--line); background: var(--ink); color: var(--paper); }
.dashboard-shell.sidebar-collapsed .sidebar-account .text-button { justify-content: center; width: 2rem; margin-left: 0; padding: .55rem; }

.dashboard-content { min-width: 0; padding: clamp(1.5rem, 3vw, 3rem); }
.panel-header { margin-bottom: 2rem; }
.panel-header h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.2rem);
  font-weight: 580;
  letter-spacing: -.06em;
  line-height: 1;
}
.panel-header p:last-child { max-width: 44rem; margin: .9rem 0 0; color: var(--muted); line-height: 1.6; }
.nav-panel { display: grid; gap: 2rem; }
.nav-panel[hidden] { display: none; }

.dashboard-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  border: 1px solid var(--line);
  background: var(--line);
}
.metric {
  display: grid;
  gap: .5rem;
  padding: 1rem 1.25rem;
  background: var(--ink);
  border-top: 2px solid var(--amber);
}
.metric span { color: var(--muted); font-size: .68rem; letter-spacing: .08em; text-transform: uppercase; }
.metric strong { font-family: var(--mono); font-size: 1.6rem; font-weight: 500; }

.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; }
.segmented { display: flex; flex-wrap: wrap; gap: .4rem; }
.segmented button {
  padding: .5rem .8rem;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--muted);
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
}
.segmented button:hover { color: var(--paper); border-color: var(--paper); }
.segmented button[aria-pressed="true"] { border-color: var(--amber); color: var(--amber); }
.search-field {
  width: min(100%, 18rem);
  min-height: 2.5rem;
  padding: .5rem .75rem;
  border: 1px solid var(--line-strong);
  border-radius: 0;
  background: #0c0c09;
  color: var(--paper);
}
.search-field:focus { border-color: var(--amber); outline: 1px solid var(--amber); }

.section-title { margin: 0; font-size: 1.15rem; font-weight: 560; letter-spacing: -.02em; }
.data-list { display: grid; gap: 1px; border: 1px solid var(--line); background: var(--line); }
.data-list:empty { display: none; }

.game-row { display: grid; gap: 1rem; padding: 1.1rem 1.25rem; background: var(--ink); }
.game-main {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) auto;
  gap: 1.5rem;
  align-items: center;
}
.game-row h3 { margin: 0 0 .35rem; overflow-wrap: anywhere; font-size: 1.05rem; font-weight: 560; letter-spacing: -.02em; }
.game-path { margin: 0; overflow-wrap: anywhere; color: var(--muted); font-family: var(--mono); font-size: .72rem; }
.game-meta { display: grid; gap: .5rem; color: var(--quiet); font-size: .72rem; }
.game-meta p { margin: 0; }
.badges { display: flex; flex-wrap: wrap; gap: .4rem; }
.pill[data-state="hosted"] { border-color: #49613a; color: #bde3a5; }
.pill[data-state="listed"] { border-color: #80602c; color: var(--amber-bright); }
.game-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: .6rem; }
.game-actions .button { white-space: nowrap; }
.button-danger { border-color: #714139; color: #ffafa3; }
.button-danger:hover:not(:disabled) { border-color: var(--danger); background: var(--danger); color: var(--ink); }
.no-link { color: var(--quiet); font-size: .72rem; }
.suspend-panel {
  display: grid;
  gap: .9rem;
  padding: 1rem 1.1rem;
  border: 1px solid #714139;
  background: var(--ink-raised);
}
.suspend-panel[hidden] { display: none; }
.suspend-panel label {
  color: var(--muted);
  font-size: .7rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.suspend-panel select {
  width: 100%;
  min-height: 2.75rem;
  padding: .5rem .7rem;
  border: 1px solid var(--line-strong);
  border-radius: 0;
  background: #0c0c09;
  color: var(--paper);
}
.suspend-panel p { margin: 0; color: var(--muted); font-size: .8rem; line-height: 1.5; }
.suspend-actions { display: flex; flex-wrap: wrap; gap: .6rem; }

.audit-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.4fr) auto;
  gap: 1.25rem;
  align-items: center;
  padding: .9rem 1.25rem;
  background: var(--ink);
}
.audit-row h3 { margin: 0 0 .25rem; font-size: .92rem; font-weight: 560; }
.audit-row p, .audit-row time { margin: 0; color: var(--muted); font-size: .8rem; overflow-wrap: anywhere; }

.meter-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(10rem, 1.2fr) minmax(8rem, auto);
  gap: 1.5rem;
  align-items: center;
  padding: 1rem 1.25rem;
  background: var(--ink);
}
.meter-row h3 { margin: 0 0 .3rem; font-size: .98rem; font-weight: 560; }
.meter-row p { margin: 0; overflow-wrap: anywhere; color: var(--muted); font-size: .76rem; }
.meter-bar { position: relative; height: .6rem; border: 1px solid var(--line-strong); background: #0c0c09; }
.meter-bar > span { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--success); }
.meter-bar[data-level="warn"] > span { background: var(--amber); }
.meter-bar[data-level="danger"] > span { background: var(--danger); }
.meter-bar[data-level="none"] { border-style: dashed; }
.meter-figures { text-align: right; font-family: var(--mono); font-size: .8rem; }
.meter-figures small { display: block; margin-top: .25rem; color: var(--muted); font-size: .7rem; }

.section-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 2.5rem; }
.section-head .section-title { margin: 0; }
.section-title { margin-top: 2.5rem; }
.section-head + .section-note, .section-title + .section-note { margin-top: .5rem; }
.section-note { margin: .5rem 0 1rem; color: var(--muted); font-size: .82rem; line-height: 1.55; max-width: 60rem; }
.sub-title { margin: 1.5rem 0 .6rem; font-size: .8rem; font-weight: 560; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.vendor-card { background: var(--ink); }
.vendor-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .75rem; padding: 1rem 1.25rem .4rem; }
.vendor-head h3 { margin: 0; font-size: 1.05rem; font-weight: 560; }
.vendor-head strong { font-family: var(--mono); font-size: 1.15rem; font-weight: 500; }
.vendor-meta { margin: 0; padding: 0 1.25rem .9rem; color: var(--muted); font-size: .76rem; line-height: 1.55; overflow-wrap: anywhere; }
.vendor-card .meter-row { border-top: 1px solid var(--line); }
.cost-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
  gap: 1.25rem;
  align-items: center;
  padding: .8rem 1.25rem;
  background: var(--ink);
}
.cost-row h4 { margin: 0 0 .2rem; font-size: .92rem; font-weight: 560; }
.cost-row p { margin: 0; color: var(--muted); font-size: .76rem; overflow-wrap: anywhere; }
.cost-row strong { font-family: var(--mono); font-size: .95rem; font-weight: 500; text-align: right; }
.empty-state, .loading-state { min-height: 8rem; padding: 1.5rem; margin: 0; color: var(--muted); border: 1px solid var(--line); line-height: 1.6; }
.empty-state { min-height: 6rem; }
.error-banner { padding: 1rem 1.25rem; border: 1px solid var(--danger); color: var(--danger); }
.error-banner[hidden] { display: none; }

@media (max-width: 60rem) {
  .auth-layout { grid-template-columns: 1fr; gap: 2.5rem; min-height: auto; padding-block: 3rem; }
  .auth-intro h1 { font-size: clamp(2.75rem, 9vw, 3.8rem); line-height: 1.02; }
  .dashboard-shell, .dashboard-shell.sidebar-collapsed { grid-template-columns: 1fr; }
  .dashboard-sidebar {
    position: static;
    height: auto;
    gap: 1rem;
    padding: 1rem var(--space);
    border-right: 0;
    border-bottom: 1px solid var(--line-strong);
  }
  .sidebar-head { padding-bottom: 1rem; }
  .sidebar-toggle { display: none; }
  .sidebar-nav { grid-auto-flow: column; grid-auto-columns: 1fr; }
  .sidebar-account { margin-top: 0; padding-top: 1rem; }
  .dashboard-shell.sidebar-collapsed .brand { display: inline-flex; }
  .dashboard-shell.sidebar-collapsed .nav-label,
  .dashboard-shell.sidebar-collapsed .account-label,
  .dashboard-shell.sidebar-collapsed .logout-label {
    position: static;
    width: auto;
    height: auto;
    margin: 0;
    clip: auto;
  }
  .dashboard-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .game-main { grid-template-columns: 1fr; }
  .game-actions { justify-content: flex-start; }
  .audit-row { grid-template-columns: 1fr; }
  .meter-row, .cost-row { grid-template-columns: 1fr; gap: .75rem; }
  .cost-row strong { text-align: left; }
  .meter-figures { text-align: left; }
}
@media (max-width: 560px) {
  .operator-header { align-items: flex-start; flex-direction: column; }
  .dashboard-metrics { grid-template-columns: 1fr; }
}
`;

const body = `
  <div class="operator-shell">
    <header class="operator-header">
      <a class="brand" href="/" aria-label="Loki home">${brandMarkHtml()}<span>LOKI</span></a>
      <span class="operator-role">Operator console</span>
    </header>

    <main class="page-shell">
      <section class="auth-layout" id="auth-view" aria-labelledby="auth-title">
        <div class="auth-intro">
          <h1 id="auth-title">Operator Dashboard</h1>
          <p>Restricted access for Loki operators. Review hosted games, suspend violations, and watch usage against limits.</p>
        </div>
        <div class="auth-card">
          <h2>Operator sign in</h2>
          <p>Use your authorized Supabase account.</p>
          <form class="form-stack" id="login-form">
            <div>
              <label for="operator-email">Email</label>
              <input id="operator-email" name="email" type="email" autocomplete="username" required>
            </div>
            <div>
              <label for="operator-password">Password</label>
              <input id="operator-password" name="password" type="password" autocomplete="current-password" required>
            </div>
            <button class="button button-primary" id="login-submit" type="submit">Sign in</button>
          </form>
          <p class="form-message" id="login-message" role="alert"></p>
        </div>
      </section>

      <section class="access-denied" id="denied-view" hidden aria-labelledby="denied-title">
        <p class="eyebrow">Access denied</p>
        <h1 id="denied-title">This account is not an operator.</h1>
        <p>Your authentication succeeded, but the Loki API did not authorize access to operator data. No platform information has been shown.</p>
        <button class="button button-primary" id="denied-logout" type="button">Return to sign in</button>
      </section>

      <div class="dashboard-shell" id="dashboard-view" hidden>
        <aside class="dashboard-sidebar">
          <div class="sidebar-head">
            <a class="brand" href="/" aria-label="Loki home">${brandMarkHtml()}<span class="brand-word">LOKI</span></a>
            <button class="sidebar-toggle" id="sidebar-toggle" type="button" aria-expanded="true" aria-label="Collapse sidebar">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" aria-hidden="true"><path d="M15 6 9 12l6 6"></path></svg>
            </button>
          </div>
          <nav class="sidebar-nav" aria-label="Operator navigation">
            <button class="nav-item" type="button" data-nav-target="nav-games" aria-current="page" title="Games">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" aria-hidden="true"><path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z"></path></svg>
              <span class="nav-label">Games</span>
            </button>
            <button class="nav-item" type="button" data-nav-target="nav-limits" aria-current="false" title="Limits">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" aria-hidden="true"><path d="M4 20V10M12 20V4M20 20v-7"></path></svg>
              <span class="nav-label">Limits</span>
            </button>
          </nav>
          <div class="sidebar-account">
            <span class="account-label">Operator console</span>
            <button class="text-button" id="logout" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" width="16" height="16"><path d="M9 6H5v12h4M10 12h9M15 8l4 4-4 4"></path></svg>
              <span class="logout-label">Log out</span>
            </button>
          </div>
        </aside>

        <div class="dashboard-content">
          <div class="status-line" id="overview-status" role="status" aria-live="polite">Loading operator data…</div>
          <div class="error-banner" id="console-error" role="alert" hidden></div>

          <section class="nav-panel" id="nav-games" aria-labelledby="games-title">
            <div class="panel-header">
              <p class="eyebrow">Operator console</p>
              <h1 id="games-title">Games</h1>
              <p>Every project on Loki. Open a game to check it against the Terms and Acceptable Use Policy, and suspend it from here if it breaks them.</p>
            </div>
            <div class="dashboard-metrics" id="metrics-grid"></div>
            <div class="toolbar">
              <div class="segmented" id="game-filters" role="group" aria-label="Filter games">
                <button type="button" data-filter="all" aria-pressed="true">All</button>
                <button type="button" data-filter="hosted" aria-pressed="false">Hosted</button>
                <button type="button" data-filter="listed" aria-pressed="false">Listed</button>
                <button type="button" data-filter="suspended" aria-pressed="false">Suspended</button>
              </div>
              <input class="search-field" id="game-search" type="search" placeholder="Search name, studio, or link" aria-label="Search games">
            </div>
            <div class="data-list" id="projects-list" aria-live="polite" aria-busy="true"></div>
            <p class="loading-state" id="projects-loading">Loading projects…</p>

            <h2 class="section-title" id="audit-title">Audit events</h2>
            <div class="data-list" id="audit-list"></div>
          </section>

          <section class="nav-panel" id="nav-limits" aria-labelledby="limits-title" hidden>
            <div class="panel-header">
              <p class="eyebrow">Operator console</p>
              <h1 id="limits-title">Limits</h1>
              <p>What our infrastructure vendors are charging this month, who that cost belongs to, and how close creators are to the limits Loki enforces. Bars turn amber at 75% and red at 90%.</p>
            </div>

            <h2 class="section-title">Plans</h2>
            <p class="section-note" id="plan-note">The subscription each provider account is on, and what that subscription costs per month.</p>
            <div class="data-list" id="plan-list" aria-live="polite"></div>

            <div class="section-head">
              <h2 class="section-title">Vendor usage</h2>
              <button class="button button-quiet" id="vendor-refresh" type="button">Refresh</button>
            </div>
            <p class="section-note" id="vendor-note">Month to date, read from each vendor. Dollar figures are estimates at list prices.</p>
            <div class="data-list" id="vendor-list" aria-live="polite"></div>
            <p class="loading-state" id="vendor-loading">Loading vendor usage…</p>

            <h2 class="section-title">Cost analytics</h2>
            <p class="section-note" id="cost-note"></p>
            <div class="dashboard-metrics" id="cost-metrics"></div>
            <h3 class="sub-title">By game</h3>
            <div class="data-list" id="cost-games"></div>
            <h3 class="sub-title">By creator</h3>
            <div class="data-list" id="cost-creators"></div>
            <p class="loading-state" id="cost-loading">Loading cost analytics…</p>

            <h2 class="section-title">Creator limits</h2>
            <p class="section-note">Usage against the limits Loki enforces, closest to the limit first.</p>
            <div class="dashboard-metrics" id="usage-metrics"></div>
            <div class="toolbar">
              <div class="segmented" id="usage-filters" role="group" aria-label="Filter meters">
                <button type="button" data-usage-filter="all" aria-pressed="true">All meters</button>
                <button type="button" data-usage-filter="near" aria-pressed="false">Near limit</button>
              </div>
            </div>
            <div class="data-list" id="usage-list" aria-live="polite"></div>
            <p class="loading-state" id="usage-loading">Loading usage…</p>
          </section>
        </div>
      </div>
    </main>
  </div>
`;

const script = `
  const config = productConfig;
  const apiOrigin = String(config?.apiOrigin || "").replace(/\\/$/, "");
  const supabaseUrl = String(config?.supabaseUrl || "").replace(/\\/$/, "");
  const supabaseAnonKey = String(config?.supabaseAnonKey || "");
  const sessionKey = "loki.operator.session.v1";
  const sidebarKey = "loki.operator.sidebar-collapsed";
  const suspensionReasons = ${serializeInlineJson(SUSPENSION_REASONS)};
  const restoreReason = "Restored after operator review";
  const NEAR_LIMIT = 0.75;
  const DANGER_LIMIT = 0.9;

  const $ = (selector) => document.querySelector(selector);
  const authView = $("#auth-view");
  const deniedView = $("#denied-view");
  const dashboardView = $("#dashboard-view");
  const loginForm = $("#login-form");
  const loginSubmit = $("#login-submit");
  const loginMessage = $("#login-message");
  const overviewStatus = $("#overview-status");
  const consoleError = $("#console-error");
  const metricsGrid = $("#metrics-grid");
  const projectsList = $("#projects-list");
  const projectsLoading = $("#projects-loading");
  const auditList = $("#audit-list");
  const usageMetrics = $("#usage-metrics");
  const usageList = $("#usage-list");
  const usageLoading = $("#usage-loading");
  const planList = $("#plan-list");
  const planNote = $("#plan-note");
  const vendorList = $("#vendor-list");
  const vendorLoading = $("#vendor-loading");
  const vendorNote = $("#vendor-note");
  const costMetrics = $("#cost-metrics");
  const costNote = $("#cost-note");
  const costGames = $("#cost-games");
  const costCreators = $("#cost-creators");
  const costLoading = $("#cost-loading");

  const state = {
    projects: [],
    overview: {},
    usage: [],
    vendors: [],
    plans: [],
    planTotalUsd: null,
    plansComplete: false,
    costs: null,
    filter: "all",
    search: "",
    usageFilter: "all",
    openPanel: ""
  };

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function display(value, fallback = "Not reported") {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return fallback;
  }

  function label(value) {
    return String(value)
      .replace(/[_.-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  function empty(message) {
    const element = document.createElement("p");
    element.className = "empty-state";
    element.textContent = message;
    return element;
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
  }

  function formatNumber(value) {
    return Number(value).toLocaleString();
  }

  function formatBytes(value) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let amount = Number(value);
    let unit = 0;
    while (amount >= 1024 && unit < units.length - 1) {
      amount /= 1024;
      unit += 1;
    }
    const text = unit === 0 ? String(amount) : amount.toFixed(amount >= 10 ? 0 : 1);
    return text + " " + units[unit];
  }

  function readSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
      return session && typeof session.access_token === "string" ? session : null;
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    sessionStorage.setItem(sessionKey, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type
    }));
  }

  function clearSession() {
    sessionStorage.removeItem(sessionKey);
  }

  function showView(view) {
    authView.hidden = view !== "auth";
    deniedView.hidden = view !== "denied";
    dashboardView.hidden = view !== "dashboard";
    document.body.classList.toggle("operator-dashboard", view === "dashboard");
  }

  async function api(path, options = {}) {
    const session = readSession();
    if (!session) throw new Error("Authentication required");
    const response = await fetch(apiOrigin + path, {
      ...options,
      headers: {
        accept: "application/json",
        authorization: "Bearer " + session.access_token,
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    if (response.status === 401 || response.status === 403) {
      const error = new Error("Access denied");
      error.accessDenied = true;
      throw error;
    }
    if (!response.ok) {
      let message = "Request failed";
      try { message = display((await response.json()).error, message); } catch {}
      throw new Error(message);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function showError(message) {
    consoleError.textContent = message;
    consoleError.hidden = !message;
  }

  /* ---------- Navigation ---------- */

  const navItems = Array.from(document.querySelectorAll(".nav-item"));
  const navPanels = Array.from(document.querySelectorAll(".nav-panel"));

  function setActiveNav(target) {
    for (const item of navItems) {
      item.setAttribute("aria-current", item.dataset.navTarget === target ? "page" : "false");
    }
    for (const panel of navPanels) panel.hidden = panel.id !== target;
  }

  for (const item of navItems) {
    item.addEventListener("click", () => setActiveNav(item.dataset.navTarget));
  }

  function setSidebarCollapsed(collapsed) {
    dashboardView.classList.toggle("sidebar-collapsed", collapsed);
    const toggle = $("#sidebar-toggle");
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    try { sessionStorage.setItem(sidebarKey, collapsed ? "1" : "0"); } catch {}
  }

  $("#sidebar-toggle").addEventListener("click", () => {
    setSidebarCollapsed(!dashboardView.classList.contains("sidebar-collapsed"));
  });

  try {
    if (sessionStorage.getItem(sidebarKey) === "1") setSidebarCollapsed(true);
  } catch {}

  /* ---------- Games ---------- */

  function isHosted(project) {
    return Boolean(project.activeDeploymentId);
  }

  function isListed(project) {
    return project.state === "unlisted" || project.state === "published";
  }

  function matchesFilter(project) {
    if (state.filter === "hosted") return isHosted(project);
    if (state.filter === "listed") return isListed(project);
    if (state.filter === "suspended") return project.state === "suspended";
    return true;
  }

  function gamePath(project) {
    const organization = record(project.organization);
    return display(organization.slug, "organization") + "/" + display(project.slug, "game");
  }

  function playLink(project) {
    const organization = record(project.organization);
    if (!organization.slug || !project.slug) return "/play/" + encodeURIComponent(project.id);
    return "/play/" + encodeURIComponent(organization.slug) + "/" + encodeURIComponent(project.slug);
  }

  function matchesSearch(project) {
    const query = state.search.trim().toLowerCase();
    if (!query) return true;
    const organization = record(project.organization);
    return [project.name, project.slug, organization.name, organization.slug, project.id]
      .filter((value) => typeof value === "string")
      .some((value) => value.toLowerCase().includes(query));
  }

  function renderMetrics() {
    const counts = record(state.overview.counts);
    const projects = state.projects;
    const entries = [
      ["Accounts", counts.accounts],
      ["Projects", counts.projects],
      ["Deployments", counts.deployments],
      ["Hosted games", projects.filter(isHosted).length],
      ["Listed games", projects.filter(isListed).length],
      ["Suspended", projects.filter((project) => project.state === "suspended").length]
    ];
    metricsGrid.replaceChildren();
    for (const [name, value] of entries) {
      const item = node("div", "metric");
      item.append(node("span", "", name), node("strong", "", display(value, "0")));
      metricsGrid.append(item);
    }
  }

  function renderFilterCounts() {
    const counts = {
      all: state.projects.length,
      hosted: state.projects.filter(isHosted).length,
      listed: state.projects.filter(isListed).length,
      suspended: state.projects.filter((project) => project.state === "suspended").length
    };
    for (const button of document.querySelectorAll("[data-filter]")) {
      const name = button.dataset.filter;
      button.textContent = label(name) + " (" + counts[name] + ")";
      button.setAttribute("aria-pressed", String(name === state.filter));
    }
  }

  function suspendPanel(project, row) {
    const panel = node("form", "suspend-panel");
    panel.hidden = state.openPanel !== project.id;
    const selectId = "reason-" + project.id;
    const reasonLabel = node("label", "", "Reason for suspension");
    reasonLabel.htmlFor = selectId;
    const select = document.createElement("select");
    select.id = selectId;
    for (const reason of suspensionReasons) {
      const option = document.createElement("option");
      option.value = reason;
      option.textContent = reason;
      select.append(option);
    }
    const note = node("p", "", "Play stops immediately. The creator sees this reason on the game in their dashboard.");
    const actions = node("div", "suspend-actions");
    const confirm = node("button", "button button-danger", "Suspend now");
    confirm.type = "submit";
    const cancel = node("button", "button button-quiet", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      state.openPanel = "";
      panel.hidden = true;
    });
    actions.append(confirm, cancel);
    panel.append(reasonLabel, select, note, actions);
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      setSuspension(project.id, true, select.value, confirm);
    });
    return panel;
  }

  function projectRow(project) {
    const organization = record(project.organization);
    const suspended = project.state === "suspended";
    const row = node("article", "game-row");
    row.dataset.projectId = project.id;

    const main = node("div", "game-main");

    const identity = node("div");
    identity.append(
      node("h3", "", display(project.name, "Untitled project")),
      node("p", "game-path", gamePath(project))
    );

    const meta = node("div", "game-meta");
    const badges = node("div", "badges");
    const statePill = node("span", "pill", label(display(project.state, "unknown")));
    statePill.dataset.state = display(project.state, "unknown");
    badges.append(statePill);
    if (isHosted(project)) {
      const hosted = node("span", "pill", "Hosted");
      hosted.dataset.state = "hosted";
      badges.append(hosted);
    }
    if (isListed(project)) {
      const listed = node("span", "pill", "Listed");
      listed.dataset.state = "listed";
      badges.append(listed);
    }
    const latest = record(project.latestDeployment);
    meta.append(
      badges,
      node("p", "", display(organization.name, "Studio not reported") + " · " + formatNumber(project.deploymentCount || 0) + " releases"),
      node("p", "", latest.status ? "Latest release: " + label(latest.status) : "No releases"),
      node("p", "", "Updated " + formatDate(project.updatedAt))
    );

    const actions = node("div", "game-actions");
    if (isHosted(project) && !suspended) {
      const open = node("button", "button button-quiet", "Open game");
      open.type = "button";
      open.addEventListener("click", () => openGame(project, open));
      actions.append(open);
    } else {
      actions.append(node("span", "no-link", suspended ? "Play disabled" : "No release to open"));
    }
    if (suspended) {
      const restore = node("button", "button button-primary", "Restore to private");
      restore.type = "button";
      restore.addEventListener("click", () => setSuspension(project.id, false, restoreReason, restore));
      actions.append(restore);
    } else {
      const suspend = node("button", "button button-danger", "Suspend");
      suspend.type = "button";
      suspend.addEventListener("click", () => {
        state.openPanel = state.openPanel === project.id ? "" : project.id;
        const panel = row.querySelector(".suspend-panel");
        if (panel) panel.hidden = state.openPanel !== project.id;
      });
      actions.append(suspend);
    }
    main.append(identity, meta, actions);
    row.append(main);

    if (suspended) {
      const notice = node("div", "notice", "Suspended. Reason shown to the creator: " + display(project.suspensionReason, "No reason was recorded."));
      notice.dataset.tone = "error";
      row.append(notice);
    } else {
      row.append(suspendPanel(project, row));
    }
    return row;
  }

  function renderProjects() {
    renderFilterCounts();
    renderMetrics();
    projectsList.replaceChildren();
    projectsList.setAttribute("aria-busy", "false");
    projectsLoading.hidden = true;
    const items = state.projects.filter((project) => matchesFilter(project) && matchesSearch(project));
    if (!items.length) {
      projectsLoading.hidden = false;
      projectsLoading.className = "empty-state";
      projectsLoading.textContent = state.projects.length
        ? "No games match this filter."
        : "No projects have been created yet.";
      return;
    }
    for (const project of items) projectsList.append(projectRow(project));
  }

  function renderAudit() {
    auditList.replaceChildren();
    const names = new Map(state.projects.map((project) => [project.id, project.name]));
    for (const raw of list(state.overview.recentAudits)) {
      const event = record(raw);
      const detail = record(event.detail);
      const row = node("article", "audit-row");
      const identity = node("div");
      identity.append(
        node("h3", "", label(display(event.action, "event"))),
        node("p", "", names.get(event.projectId) || display(event.projectId, "Platform"))
      );
      let summary = "";
      if (typeof detail.reason === "string" && detail.reason) summary = detail.reason;
      else if (typeof detail.next === "string") summary = "Moved to " + detail.next;
      const time = node("time", "", formatDate(event.occurredAt));
      time.dateTime = display(event.occurredAt, "");
      row.append(identity, node("p", "", summary), time);
      auditList.append(row);
    }
  }

  async function openGame(project, button) {
    // The tab opens first, inside the click, so the browser does not block it.
    const tab = window.open("", "_blank");
    button.disabled = true;
    showError("");
    try {
      const invite = record(await api("/v1/operator/projects/" + encodeURIComponent(project.id) + "/play-invite", {
        method: "POST",
        body: "{}"
      }));
      if (typeof invite.token !== "string") throw new Error("No play invite was returned.");
      const target = playLink(project) + "?invite=" + encodeURIComponent(invite.token);
      if (tab) {
        tab.opener = null;
        tab.location.href = target;
      } else {
        window.location.href = target;
      }
      loadGames().catch(() => {});
    } catch (error) {
      if (tab) tab.close();
      if (error.accessDenied) {
        showView("denied");
        return;
      }
      showError(error instanceof Error ? error.message : "The game could not be opened.");
    } finally {
      button.disabled = false;
    }
  }

  async function setSuspension(projectId, suspended, reason, button) {
    button.disabled = true;
    showError("");
    try {
      await api("/v1/operator/projects/" + encodeURIComponent(projectId) + "/suspension", {
        method: "PATCH",
        body: JSON.stringify({ suspended, reason })
      });
      state.openPanel = "";
      await loadGames();
    } catch (error) {
      if (error.accessDenied) {
        showView("denied");
        return;
      }
      showError(error instanceof Error ? error.message : "Suspension change failed.");
      button.disabled = false;
    }
  }

  async function loadGames() {
    const [overview, projects] = await Promise.all([
      api("/v1/operator/overview"),
      api("/v1/operator/projects")
    ]);
    state.overview = record(overview);
    state.projects = list(projects);
    renderProjects();
    renderAudit();
  }

  /* ---------- Limits ---------- */

  function meterRatio(meter) {
    if (meter.limit === null || meter.limit === undefined) return -1;
    if (meter.limit === 0) return meter.used > 0 ? Infinity : 0;
    return meter.used / meter.limit;
  }

  function formatMeterValue(meter, value) {
    return meter.metric === "stored_bytes" ? formatBytes(value) : formatNumber(value);
  }

  function meterRow(meter) {
    const ratio = meterRatio(meter);
    const row = node("article", "meter-row");

    const identity = node("div");
    identity.append(
      node("h3", "", display(meter.label, label(display(meter.metric, "meter")))),
      node("p", "", display(meter.scopeLabel, "Unknown") + " · " + display(meter.scope, "scope") + " · " + display(meter.period, ""))
    );

    const bar = node("div", "meter-bar");
    const fill = document.createElement("span");
    bar.append(fill);
    bar.setAttribute("role", "meter");
    bar.setAttribute("aria-label", display(meter.label, "Usage") + " for " + display(meter.scopeLabel, "scope"));
    bar.setAttribute("aria-valuemin", "0");
    const figures = node("div", "meter-figures");
    if (ratio < 0) {
      bar.dataset.level = "none";
      figures.textContent = formatMeterValue(meter, meter.used) + " used";
      figures.append(node("small", "", "No limit"));
    } else {
      const percent = Math.min(100, ratio * 100);
      fill.style.width = percent + "%";
      bar.dataset.level = ratio >= DANGER_LIMIT ? "danger" : ratio >= NEAR_LIMIT ? "warn" : "ok";
      bar.setAttribute("aria-valuemax", String(meter.limit));
      bar.setAttribute("aria-valuenow", String(Math.min(meter.used, meter.limit)));
      figures.textContent = formatMeterValue(meter, meter.used) + " / " + formatMeterValue(meter, meter.limit);
      figures.append(node("small", "", Number.isFinite(ratio) ? Math.round(ratio * 100) + "% used" : "Over a zero limit"));
    }
    row.append(identity, bar, figures);
    return row;
  }

  function renderUsage() {
    const meters = state.usage;
    const near = meters.filter((meter) => meterRatio(meter) >= NEAR_LIMIT);
    const atLimit = meters.filter((meter) => meterRatio(meter) >= 1);
    usageMetrics.replaceChildren();
    for (const [name, value] of [
      ["Meters tracked", meters.length],
      ["Near limit (75%+)", near.length],
      ["At limit", atLimit.length]
    ]) {
      const item = node("div", "metric");
      item.append(node("span", "", name), node("strong", "", String(value)));
      usageMetrics.append(item);
    }
    for (const button of document.querySelectorAll("[data-usage-filter]")) {
      button.setAttribute("aria-pressed", String(button.dataset.usageFilter === state.usageFilter));
    }
    usageList.replaceChildren();
    const shown = state.usageFilter === "near" ? near : meters;
    usageLoading.hidden = shown.length > 0;
    if (!shown.length) {
      usageLoading.className = "empty-state";
      usageLoading.textContent = meters.length
        ? "No meters are near their limit."
        : "No usage has been recorded in the current period.";
      return;
    }
    for (const meter of shown) usageList.append(meterRow(meter));
  }

  function formatMoney(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Not available";
    if (amount === 0) return "$0.00";
    if (Math.abs(amount) < 0.01) return "<$0.01";
    return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatSmallMoney(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Not available";
    if (amount === 0) return "$0.00";
    if (amount < 1) return "$" + amount.toFixed(4);
    return formatMoney(amount);
  }

  function vendorLineRow(line) {
    const unavailable = line.used === null || line.used === undefined;
    const used = unavailable ? 0 : Number(line.used) || 0;
    const included = line.included === null || line.included === undefined ? null : Number(line.included);
    const ratio = included === null ? -1 : included === 0 ? (used > 0 ? Infinity : 0) : used / included;
    const row = node("article", "meter-row");
    const identity = node("div");
    identity.append(
      node("h3", "", display(line.label, "Usage")),
      node("p", "", unavailable ? "Not reported by this API" : included === null ? "No plan allowance" : "Included: " + formatNumber(included) + " " + display(line.unit, ""))
    );
    const bar = node("div", "meter-bar");
    const fill = document.createElement("span");
    bar.append(fill);
    bar.setAttribute("role", "meter");
    bar.setAttribute("aria-label", display(line.label, "Usage"));
    bar.setAttribute("aria-valuemin", "0");
    if (ratio < 0) {
      bar.dataset.level = "none";
    } else {
      fill.style.width = Math.min(100, ratio * 100) + "%";
      bar.dataset.level = ratio >= DANGER_LIMIT ? "danger" : ratio >= NEAR_LIMIT ? "warn" : "ok";
      bar.setAttribute("aria-valuemax", String(included));
      bar.setAttribute("aria-valuenow", String(Math.min(used, included)));
    }
    const figures = node("div", "meter-figures");
    figures.textContent = unavailable ? "Not available" : formatNumber(used) + " " + display(line.unit, "");
    figures.append(node("small", "", unavailable || line.costUsd === null || line.costUsd === undefined ? "No separate charge" : formatMoney(line.costUsd) + " this month"));
    row.append(identity, bar, figures);
    return row;
  }

  function renderPlans() {
    planList.replaceChildren();
    const plans = state.plans.map((raw) => record(raw));
    if (!plans.length) {
      planList.append(node("p", "empty-state", "No plan information was returned."));
      return;
    }
    for (const plan of plans) {
      const fee = plan.monthlyUsd === null || plan.monthlyUsd === undefined
        ? "Not available"
        : formatMoney(plan.monthlyUsd) + " / month";
      planList.append(costRow(
        display(plan.provider, "Provider"),
        display(plan.plan, "Plan not available"),
        display(plan.message, ""),
        fee
      ));
    }
    const missing = plans.filter((plan) => plan.monthlyUsd === null || plan.monthlyUsd === undefined).map((plan) => display(plan.provider, "Provider"));
    planList.append(costRow(
      "Total",
      state.plansComplete ? "Every plan fee is included" : "Missing fees are left out",
      missing.length ? missing.join(", ") + " " + (missing.length === 1 ? "is" : "are") + " not included." : "Subscription fees only. Railway's fee is a usage credit, so it is not added to the usage estimate.",
      formatMoney(state.planTotalUsd)
    ));
    planNote.textContent = "Subscription fees for the plans these accounts are on. Railway's fee already covers usage up to that amount, so it is not added to the usage estimate below.";
  }

  function renderVendors() {
    vendorList.replaceChildren();
    vendorLoading.hidden = state.vendors.length > 0;
    if (!state.vendors.length) {
      vendorLoading.className = "empty-state";
      vendorLoading.textContent = "No vendor usage was returned.";
      return;
    }
    for (const raw of state.vendors) {
      const vendor = record(raw);
      const card = node("article", "vendor-card");
      const head = node("div", "vendor-head");
      const title = node("h3", "", display(vendor.name, "Vendor"));
      const status = node("span", "pill", vendor.status === "ok" ? "Live" : vendor.status === "not_configured" ? "Not connected" : "Error");
      status.dataset.state = vendor.status === "ok" ? "hosted" : vendor.status === "not_configured" ? "private" : "suspended";
      const left = node("div");
      left.append(title, status);
      head.append(left, node("strong", "", vendor.costUsd === null || vendor.costUsd === undefined ? "No cost figure" : formatMoney(vendor.costUsd)));
      card.append(head);
      let detail = display(vendor.message, "");
      const breakdown = list(vendor.breakdown).map((entry) => record(entry)).filter((entry) => Number(entry.costUsd) > 0);
      if (breakdown.length) {
        detail += " By service: " + breakdown.map((entry) => display(entry.label, "Service") + " " + formatMoney(entry.costUsd)).join(", ") + ".";
      }
      card.append(node("p", "vendor-meta", (detail + " Source: " + display(vendor.source, "unknown") + ".").trim()));
      for (const line of list(vendor.lines)) card.append(vendorLineRow(record(line)));
      vendorList.append(card);
    }
  }

  function storageDetail(entry) {
    const sessions = formatNumber(entry.sessions || 0) + " sessions";
    const uploads = formatBytes(entry.storedBytes || 0) + " 30-day uploads";
    const retained = formatBytes(entry.retainedBytes || 0) + " retained";
    const releases = formatNumber(entry.releaseCount || 0) + " releases";
    const cap = entry.storedBytesCap
      ? "cap " + formatBytes(entry.storedBytesCap)
      : "";
    const warning = entry.nearStorageCap ? "near storage cap" : "";
    return [sessions, uploads, retained, releases, cap, warning].filter(Boolean).join(" · ");
  }

  function costRow(name, sub, detail, cost) {
    const row = node("article", "cost-row");
    const identity = node("div");
    identity.append(node("h4", "", name), node("p", "", sub));
    row.append(identity, node("p", "", detail), node("strong", "", cost));
    return row;
  }

  function renderCosts() {
    const costs = state.costs;
    costMetrics.replaceChildren();
    costGames.replaceChildren();
    costCreators.replaceChildren();
    if (!costs) {
      costLoading.hidden = false;
      return;
    }
    costLoading.hidden = true;
    const totals = record(costs.totals);
    costNote.textContent = display(costs.method, "") +
      (costs.complete ? "" : " Totals are a minimum: " + list(costs.missingVendors).join(", ") + " could not be read.");
    for (const [name, value] of [
      ["Vendor cost, month to date", formatMoney(costs.totalCostUsd)],
      ["Per game", totals.costPerGameUsd === null ? "n/a" : formatSmallMoney(totals.costPerGameUsd)],
      ["Per creator", totals.costPerCreatorUsd === null ? "n/a" : formatSmallMoney(totals.costPerCreatorUsd)],
      ["Per session", totals.costPerSessionUsd === null ? "n/a" : formatSmallMoney(totals.costPerSessionUsd)],
      ["Not assigned to a game", formatMoney(costs.unallocatedUsd)]
    ]) {
      const item = node("div", "metric");
      item.append(node("span", "", name), node("strong", "", value));
      costMetrics.append(item);
    }
    const games = list(costs.games).map((entry) => record(entry)).slice(0, 15);
    if (!games.length) costGames.append(node("p", "empty-state", "No games yet."));
    for (const game of games) {
      costGames.append(costRow(
        display(game.name, "Game"),
        display(game.organizationName, "Studio") + (game.ownerEmail ? " · " + game.ownerEmail : ""),
        storageDetail(game),
        formatSmallMoney(game.costUsd)
      ));
    }
    const creators = list(costs.creators).map((entry) => record(entry)).slice(0, 15);
    if (!creators.length) costCreators.append(node("p", "empty-state", "No creators yet."));
    for (const creator of creators) {
      costCreators.append(costRow(
        display(creator.email, "Creator"),
        formatNumber(creator.games || 0) + (creator.games === 1 ? " game" : " games"),
        storageDetail(creator),
        formatSmallMoney(creator.costUsd)
      ));
    }
  }

  async function loadVendors(refresh) {
    const [vendors, costs] = await Promise.allSettled([
      api("/v1/operator/vendor-usage" + (refresh ? "?refresh=1" : "")),
      api("/v1/operator/costs")
    ]);
    for (const result of [vendors, costs]) {
      if (result.status === "rejected" && result.reason && result.reason.accessDenied) throw result.reason;
    }
    if (vendors.status === "fulfilled") {
      const payload = record(vendors.value);
      state.vendors = list(payload.vendors);
      state.plans = list(payload.plans);
      state.planTotalUsd = payload.planTotalUsd;
      state.plansComplete = payload.plansComplete === true;
      renderPlans();
      vendorNote.textContent = "Month to date" + (payload.generatedAt ? ", read " + formatDate(payload.generatedAt) : "") + ". Dollar figures are estimates at list prices; check them against each vendor's invoice.";
      renderVendors();
    } else {
      vendorLoading.hidden = false;
      vendorLoading.className = "empty-state";
      vendorLoading.textContent = "Vendor usage could not be loaded: " + (vendors.reason instanceof Error ? vendors.reason.message : "unknown error");
    }
    if (costs.status === "fulfilled") {
      state.costs = record(costs.value);
      renderCosts();
    } else {
      costLoading.hidden = false;
      costLoading.className = "empty-state";
      costLoading.textContent = "Cost analytics could not be loaded: " + (costs.reason instanceof Error ? costs.reason.message : "unknown error");
    }
  }

  async function loadUsage() {
    const payload = record(await api("/v1/operator/usage"));
    state.usage = list(payload.meters).map((raw) => record(raw));
    renderUsage();
  }

  /* ---------- Load ---------- */

  async function loadAll() {
    showView("dashboard");
    overviewStatus.textContent = "Loading operator data…";
    showError("");
    const [games, usage, vendors] = await Promise.allSettled([loadGames(), loadUsage(), loadVendors(false)]);
    for (const result of [games, usage, vendors]) {
      if (result.status === "rejected" && result.reason && result.reason.accessDenied) {
        overviewStatus.textContent = "";
        showView("denied");
        return;
      }
    }
    const failures = [];
    if (games.status === "rejected") {
      failures.push("Games: " + (games.reason instanceof Error ? games.reason.message : "could not be loaded"));
      projectsLoading.hidden = false;
      projectsLoading.className = "empty-state";
      projectsLoading.textContent = "Projects could not be loaded.";
    }
    if (usage.status === "rejected") {
      failures.push("Limits: " + (usage.reason instanceof Error ? usage.reason.message : "could not be loaded"));
      usageLoading.hidden = false;
      usageLoading.className = "empty-state";
      usageLoading.textContent = "Usage could not be loaded.";
    }
    if (failures.length) showError(failures.join(" "));
    overviewStatus.textContent = failures.length ? "Operator data unavailable." : "Operator data loaded.";
  }

  for (const button of document.querySelectorAll("[data-filter]")) {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      renderProjects();
    });
  }

  $("#vendor-refresh").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await loadVendors(true);
    } catch (error) {
      if (error && error.accessDenied) showView("denied");
    } finally {
      button.disabled = false;
    }
  });

  $("#game-search").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderProjects();
  });

  for (const button of document.querySelectorAll("[data-usage-filter]")) {
    button.addEventListener("click", () => {
      state.usageFilter = button.dataset.usageFilter;
      renderUsage();
    });
  }

  /* ---------- Sign in ---------- */

  async function login(email, password) {
    const response = await fetch(supabaseUrl + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        apikey: supabaseAnonKey
      },
      body: JSON.stringify({ email, password })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.access_token !== "string") {
      throw new Error(display(payload.error_description,
        display(payload.msg, "Unable to sign in with those credentials.")));
    }
    saveSession(payload);
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginMessage.textContent = "";
    loginSubmit.disabled = true;
    loginSubmit.textContent = "Signing in…";
    const data = new FormData(loginForm);
    try {
      await login(String(data.get("email") || ""), String(data.get("password") || ""));
      loginForm.reset();
      await loadAll();
    } catch (error) {
      clearSession();
      showView("auth");
      loginMessage.textContent = error instanceof Error ? error.message : "Unable to sign in.";
    } finally {
      loginSubmit.disabled = false;
      loginSubmit.textContent = "Sign in";
    }
  });

  function logout() {
    clearSession();
    showError("");
    loginMessage.textContent = "";
    state.projects = [];
    state.usage = [];
    showView("auth");
    $("#operator-email").focus();
  }

  $("#logout").addEventListener("click", logout);
  $("#denied-logout").addEventListener("click", logout);

  if (readSession()) {
    loadAll();
  } else {
    showView("auth");
  }
`;

export function renderOperatorPage(config: ProductPageConfig): string {
  return renderProductPage({
    config,
    title: "Operator console",
    description:
      "Restricted Loki operations console for reviewing hosted games, suspending violations, and watching usage against limits.",
    body,
    styles: pageStyles,
    moduleScript: script,
  });
}
