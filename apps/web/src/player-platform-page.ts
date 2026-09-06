import {
  type ProductPageConfig,
  renderProductPage,
} from "./product-theme.js";

const pageStyles = `
  .site-header { grid-template-columns: 1fr auto; }
  .player-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(18rem, .65fr);
    gap: clamp(2rem, 7vw, 7rem);
    align-items: end;
    min-height: min(34rem, 62vh);
    padding-block: clamp(3.5rem, 8vw, 6.5rem) clamp(2.5rem, 5vw, 4rem);
  }
  .player-hero h1 {
    max-width: 12ch;
    margin: 0;
    font-size: clamp(2.8rem, 6vw, 5.8rem);
    font-weight: 480;
    letter-spacing: -.065em;
    line-height: 1;
  }
  .player-hero-copy {
    max-width: 32rem;
    color: var(--muted);
    font-size: clamp(1rem, 1.5vw, 1.22rem);
    line-height: 1.65;
  }
  .entry-card {
    padding: clamp(1.5rem, 4vw, 2.5rem);
    border: 1px solid var(--line);
    background: var(--ink-raised);
  }
  .site-header nav {
    display: flex;
    align-items: center;
    gap: clamp(.8rem, 2vw, 1.5rem);
  }
  .site-header nav a {
    color: var(--muted);
    font-size: .82rem;
    text-decoration: none;
  }
  .site-header nav a:hover { color: var(--paper); }
  .wordmark { font-weight: 760; letter-spacing: -.03em; text-decoration: none; }
  .entry-card h2, .section-heading h2 { margin: 0; font-weight: 520; }
  .entry-card p { margin: .75rem 0 1.5rem; color: var(--muted); line-height: 1.6; }
  .entry-row { display: flex; gap: .6rem; }
  .entry-card label {
    display: block;
    margin-bottom: .55rem;
    color: var(--muted);
    font-size: .72rem;
    font-weight: 680;
    letter-spacing: .07em;
    text-transform: uppercase;
  }
  .entry-row input {
    min-width: 0;
    min-height: 3.15rem;
    flex: 1;
    padding: .72rem .82rem;
    border: 1px solid var(--line-strong);
    border-radius: 0;
    background: #0c0c09;
    color: var(--paper);
  }
  .entry-row input:focus { border-color: var(--amber); outline: 1px solid var(--amber); }
  .field-error { min-height: 1.4rem; margin: .7rem 0 0; color: var(--danger); font-size: .875rem; }
  .player-section { padding-block: clamp(3rem, 7vw, 6rem); border-top: 1px solid var(--line); }
  .section-heading {
    display: flex;
    gap: 2rem;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 2rem;
  }
  .section-heading p { margin: 0; color: var(--muted); }
  .game-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
  }
  .game-card {
    display: flex;
    min-height: 15rem;
    padding: 1.5rem;
    flex-direction: column;
    justify-content: space-between;
    gap: 2rem;
    background: var(--ink-raised);
  }
  .game-card:hover { background: #171711; }
  .game-card h3 { margin: .5rem 0; font-size: 1.35rem; font-weight: 520; }
  .game-card p { margin: 0; color: var(--muted); line-height: 1.55; }
  .game-card-meta {
    color: var(--amber);
    font-size: .75rem;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .game-card-link { color: inherit; text-decoration: none; }
  .game-card-link:focus-visible { outline: 2px solid var(--amber); outline-offset: -3px; }
  .collection-state {
    grid-column: 1 / -1;
    min-height: 10rem;
    margin: 0;
    padding: 2rem;
    color: var(--muted);
    background: var(--ink-raised);
    line-height: 1.6;
  }
  .recent-actions { display: flex; justify-content: flex-end; margin-top: 1rem; }
  .site-footer {
    display: flex;
    justify-content: space-between;
    gap: 1.5rem;
    padding-top: 2rem;
    border-top: 1px solid var(--line);
    color: var(--muted);
  }
  .site-footer p { margin: 0; }
  @media (max-width: 850px) {
    .player-hero { grid-template-columns: 1fr; min-height: auto; }
    .game-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 560px) {
    .entry-row, .section-heading { align-items: stretch; flex-direction: column; }
    .game-grid { grid-template-columns: 1fr; }
  }
`;

const body = `
  <header class="site-header">
    <a class="wordmark" href="/" aria-label="Loki home">LOKI</a>
    <nav aria-label="Primary navigation">
      <a href="#catalog">Catalog</a>
      <a href="#recent">Recent</a>
      <a href="/creator">Creator sign in</a>
    </nav>
  </header>
  <main class="page-shell">
    <section class="player-hero" aria-labelledby="player-title">
      <div>
        <p class="eyebrow">Layer 1 / Play</p>
        <h1 id="player-title">Your game, one link away.</h1>
      </div>
      <p class="player-hero-copy">
        Open an unlisted Loki project directly. An account is optional; private
        releases remain restricted until a creator shares authorized access.
      </p>
    </section>

    <section class="entry-card" aria-labelledby="entry-title">
      <p class="eyebrow">Direct play</p>
      <h2 id="entry-title">Enter a play link or project ID</h2>
      <p>Paste the link shared by the creator. Loki will take you directly to the hosted build.</p>
      <form id="play-entry-form" novalidate>
        <label for="play-entry">Play link or project ID</label>
        <div class="entry-row">
          <input id="play-entry" name="project" type="text" autocomplete="off"
            spellcheck="false" placeholder="https://…/play/project-id" required>
          <button class="button button-primary" type="submit">Open game</button>
        </div>
        <p class="field-error" id="play-entry-error" role="alert"></p>
      </form>
    </section>

    <section class="player-section" id="catalog" aria-labelledby="catalog-title">
      <div class="section-heading">
        <h2 id="catalog-title">Public catalog</h2>
        <p>Reviewed games available to everyone.</p>
      </div>
      <div class="game-grid" id="catalog-grid" aria-live="polite" aria-busy="true">
        <p class="collection-state">Loading the public catalog…</p>
      </div>
    </section>

    <section class="player-section" id="recent" aria-labelledby="recent-title">
      <div class="section-heading">
        <h2 id="recent-title">Recent games</h2>
        <p>Stored only in this browser.</p>
      </div>
      <div class="game-grid" id="recent-grid" aria-live="polite"></div>
      <div class="recent-actions">
        <button class="button button-quiet" id="clear-recent" type="button" hidden>Clear recent games</button>
      </div>
    </section>
  </main>
  <footer class="site-footer page-shell">
    <p>Private hosting first. Public discovery only after review.</p>
    <a href="/creator">Build on Loki</a>
  </footer>
`;

const script = `
  const config = productConfig;
  const apiOrigin = String(config?.apiOrigin || "").replace(/\\/$/, "");
  const recentKey = "loki.player.recent-games.v1";
  const catalogGrid = document.querySelector("#catalog-grid");
  const recentGrid = document.querySelector("#recent-grid");
  const clearRecent = document.querySelector("#clear-recent");
  const entryForm = document.querySelector("#play-entry-form");
  const entryInput = document.querySelector("#play-entry");
  const entryError = document.querySelector("#play-entry-error");

  function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function text(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function catalogItems(payload) {
    if (Array.isArray(payload)) return payload;
    const record = asRecord(payload);
    for (const key of ["games", "projects", "items", "catalog"]) {
      if (Array.isArray(record[key])) return record[key];
    }
    return [];
  }

  function projectId(item) {
    const record = asRecord(item);
    const project = asRecord(record.project);
    return text(record.projectId, text(record.id, text(project.id, "")));
  }

  function projectRecord(item) {
    const record = asRecord(item);
    const project = asRecord(record.project);
    return Object.keys(project).length ? project : record;
  }

  function makeState(message) {
    const state = document.createElement("p");
    state.className = "collection-state";
    state.textContent = message;
    return state;
  }

  function makeGameCard(item, recent) {
    const record = asRecord(item);
    const project = projectRecord(record);
    const metadata = asRecord(record.metadata);
    const organization = asRecord(record.organization);
    const id = projectId(record);
    const link = document.createElement("a");
    link.className = "game-card game-card-link";
    link.href = "/play/" + encodeURIComponent(id);
    link.dataset.projectId = id;

    const top = document.createElement("div");
    const meta = document.createElement("span");
    meta.className = "game-card-meta";
    meta.textContent = recent
      ? "Recently opened"
      : text(organization.name, text(record.category, "Public game"));
    const title = document.createElement("h3");
    title.textContent = text(project.name, text(metadata.name, "Untitled game"));
    const description = document.createElement("p");
    description.textContent = text(
      record.description,
      "A reviewed browser game hosted securely on Loki."
    );
    top.append(meta, title, description);

    const action = document.createElement("span");
    action.className = "text-link";
    action.textContent = "Play now";
    link.append(top, action);
    link.addEventListener("click", () => rememberGame(record));
    return link;
  }

  function readRecent() {
    try {
      const value = JSON.parse(localStorage.getItem(recentKey) || "[]");
      return Array.isArray(value) ? value.filter((item) => projectId(item)).slice(0, 6) : [];
    } catch {
      return [];
    }
  }

  function rememberGame(item) {
    const record = asRecord(item);
    const project = projectRecord(record);
    const metadata = asRecord(record.metadata);
    const id = projectId(record);
    if (!id) return;
    const stored = {
      projectId: id,
      name: text(project.name, text(metadata.name, "Untitled game")),
      description: text(record.description, "Opened from a direct Loki play link."),
      openedAt: new Date().toISOString()
    };
    const next = [stored, ...readRecent().filter((entry) => projectId(entry) !== id)].slice(0, 6);
    try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch {}
  }

  function renderRecent() {
    const items = readRecent();
    recentGrid.replaceChildren();
    if (!items.length) {
      recentGrid.append(makeState("No recent games yet. Open an unlisted play link or choose a public game."));
      clearRecent.hidden = true;
      return;
    }
    for (const item of items) recentGrid.append(makeGameCard(item, true));
    clearRecent.hidden = false;
  }

  function idFromEntry(value) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      const url = new URL(trimmed, window.location.origin);
      const match = url.pathname.match(/^\\/play\\/([^/?#]+)\\/?$/);
      if (match) return decodeURIComponent(match[1]);
    } catch {}
    return /^[A-Za-z0-9_-]{3,128}$/.test(trimmed) ? trimmed : "";
  }

  entryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const id = idFromEntry(entryInput.value);
    if (!id) {
      entryError.textContent = "Enter a valid Loki play link or project ID.";
      entryInput.focus();
      return;
    }
    entryError.textContent = "";
    rememberGame({ projectId: id, name: "Private or unlisted game" });
    window.location.assign("/play/" + encodeURIComponent(id));
  });

  clearRecent.addEventListener("click", () => {
    try { localStorage.removeItem(recentKey); } catch {}
    renderRecent();
  });

  async function loadCatalog() {
    catalogGrid.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(apiOrigin + "/v1/catalog", {
        headers: { accept: "application/json" }
      });
      if (!response.ok) throw new Error("Catalog request failed");
      const items = catalogItems(await response.json()).filter((item) => projectId(item));
      catalogGrid.replaceChildren();
      if (!items.length) {
        catalogGrid.append(makeState("No public games are listed yet. Private and unlisted play links still work."));
        return;
      }
      for (const item of items) catalogGrid.append(makeGameCard(item, false));
    } catch {
      catalogGrid.replaceChildren(makeState("The public catalog could not be loaded. Try again later or use a direct play link."));
    } finally {
      catalogGrid.setAttribute("aria-busy", "false");
    }
  }

  renderRecent();
  loadCatalog();
`;

export function renderPlayerPlatformPage(config: ProductPageConfig): string {
  return renderProductPage({
    config,
    title: "Play on Loki",
    description:
      "Open unlisted Loki games directly or browse the reviewed public catalog.",
    body,
    styles: pageStyles,
    moduleScript: script,
  });
}
