import {
  brandMarkHtml,
  renderProductPage,
  type ProductPageConfig,
} from "./product-theme.js";

export const LOKI_PACKAGE_VERSION = "0.4.0";

export const docsRoutes = [
  "/",
  "/quickstart",
  "/concepts",
  "/hosting",
  "/game-json",
  "/cli",
  "/multiplayer",
  "/synchronized-rooms",
  "/realtime-rooms",
  "/rooms",
  "/presence-chat-scores",
  "/reconnect",
  "/sdk",
  "/overlay",
  "/hosted-session",
  "/mobile",
  "/native",
  "/agents",
  "/mcp",
  "/errors",
  "/limits",
  "/safety",
] as const;

export type DocsRoute = (typeof docsRoutes)[number];

export function normalizeDocsPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isDocsRoute(pathname: string): pathname is DocsRoute {
  return (docsRoutes as readonly string[]).includes(normalizeDocsPath(pathname));
}

function currentAttr(path: string, href: string): string {
  return path === href ? ' aria-current="page"' : "";
}

const navGroups: Array<{ label: string; items: Array<{ href: DocsRoute; label: string }> }> =
  [
    {
      label: "Start",
      items: [
        { href: "/", label: "Docs home" },
        { href: "/quickstart", label: "Quickstart" },
        { href: "/concepts", label: "How Loki works" },
      ],
    },
    {
      label: "Ship",
      items: [
        { href: "/hosting", label: "Hosting" },
        { href: "/game-json", label: "game.json" },
        { href: "/cli", label: "CLI" },
      ],
    },
    {
      label: "Multiplayer",
      items: [
        { href: "/multiplayer", label: "Choose a room type" },
        { href: "/synchronized-rooms", label: "Synchronized rooms" },
        { href: "/realtime-rooms", label: "Realtime rooms" },
        { href: "/rooms", label: "Rooms and invites" },
        { href: "/presence-chat-scores", label: "Presence, chat, scores" },
        { href: "/reconnect", label: "Reconnect" },
      ],
    },
    {
      label: "Clients",
      items: [
        { href: "/sdk", label: "JavaScript SDK" },
        { href: "/overlay", label: "Overlay" },
        { href: "/hosted-session", label: "Hosted session" },
        { href: "/mobile", label: "Mobile" },
        { href: "/native", label: "Native SDKs" },
      ],
    },
    {
      label: "Agents",
      items: [
        { href: "/agents", label: "Agent rules" },
        { href: "/mcp", label: "MCP" },
      ],
    },
    {
      label: "Reference",
      items: [
        { href: "/errors", label: "Errors" },
        { href: "/limits", label: "Limits" },
        { href: "/safety", label: "Safety note" },
      ],
    },
  ];

export function docsEyebrow(path: DocsRoute): string {
  for (const group of navGroups) {
    const item = group.items.find((entry) => entry.href === path);
    if (item) return `${group.label} --> ${item.label}`;
  }
  return "Start --> Docs home";
}

export const docsSafetyCopy = {
  eyebrow: "Safety note",
  title: "Install is not the finish.",
  body: "Each game still requires fine-tuning after Loki is installed. The SDK, CLI, and overlay give you a host, rooms, and a playable URL. They do not invent the right player count, room type, lobby, reducer, realtime profile, or mobile layout for that title. Inspect the real modes, confirm the integration, playtest reconnect and phones, then ship again. Agents must not treat npm install or lokiplay ship as a complete game.",
};

export const docsStyles = `
.docs-product {
  --hero-title-size: clamp(3rem, 5.8vw, 6.4rem);
  --section-title-size: calc(0.72 * var(--hero-title-size));
}

.docs-header {
  position: relative;
  z-index: 10;
  grid-template-columns: auto 1fr auto;
  gap: 2rem;
}

.docs-nav-top,
.docs-actions,
.docs-page-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.docs-nav-top {
  justify-content: center;
  gap: clamp(0.85rem, 1.8vw, 1.7rem);
}

.docs-nav-top a,
.docs-footer-links a,
.docs-menu a,
.docs-menu summary,
.docs-side a {
  color: var(--muted);
  font-size: 0.78rem;
  text-decoration: none;
}

.docs-nav-top a:hover,
.docs-footer-links a:hover,
.docs-menu a:hover,
.docs-side a:hover,
.docs-nav-top a[aria-current="page"],
.docs-footer-links a[aria-current="page"],
.docs-side a[aria-current="page"] {
  color: var(--paper);
}

.docs-menu {
  display: none;
}

.docs-menu summary {
  list-style: none;
  cursor: pointer;
}

.docs-menu summary::-webkit-details-marker {
  display: none;
}

.docs-menu-panel {
  position: absolute;
  top: 100%;
  right: var(--space);
  left: var(--space);
  z-index: 20;
  display: grid;
  gap: 0.35rem;
  padding: 1rem 1.1rem 1.2rem;
  border: 1px solid var(--line);
  background: var(--ink-raised);
}

.docs-menu-panel a,
.docs-menu-panel summary {
  padding: 0.45rem 0;
}

.docs-shell {
  display: grid;
  grid-template-columns: minmax(13rem, 16rem) minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 4.5rem);
  width: min(100%, 106rem);
  margin: 0 auto;
  padding: 0 var(--space) 5rem;
}

.docs-side {
  position: sticky;
  top: 6rem;
  align-self: start;
  padding: 2.25rem 0 3rem;
}

.docs-side-group {
  margin: 0 0 1.5rem;
}

.docs-side-group h2 {
  margin: 0 0 0.55rem;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.docs-side-group ol {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.docs-side a[aria-current="page"] {
  color: var(--amber-bright);
}

.docs-article {
  min-width: 0;
  padding: 2.25rem 0 0;
}

.docs-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(16rem, 0.8fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: start;
  padding: clamp(1.75rem, 3.5vw, 2.75rem) 0 1.75rem;
  border-bottom: 1px solid var(--line);
}

.docs-hero:not(:has(.docs-aside)) {
  grid-template-columns: 1fr;
}

.docs-hero .eyebrow {
  text-transform: none;
  letter-spacing: 0.06em;
}

.docs-hero .docs-caption {
  max-width: 42rem;
  margin: 0;
  color: var(--muted);
  font-size: clamp(1.05rem, 1.6vw, 1.25rem);
  font-weight: 450;
  letter-spacing: -0.02em;
  line-height: 1.45;
}

.docs-hero .lede,
.docs-prose > p,
.docs-prose li {
  color: var(--muted);
  line-height: 1.65;
}

.docs-page-actions {
  flex-wrap: wrap;
  margin-top: 1.75rem;
}

.docs-prose {
  display: grid;
  gap: 1.15rem;
  padding: clamp(2rem, 4vw, 3rem) 0 0;
}

.docs-prose h2 {
  margin: 1.4rem 0 0;
  font-size: clamp(1.45rem, 2.4vw, 2.2rem);
  font-weight: 580;
  letter-spacing: -0.045em;
  line-height: 1.1;
}

.docs-prose h3 {
  margin: 0.6rem 0 0;
  font-size: 1.05rem;
  font-weight: 620;
  letter-spacing: -0.03em;
}

.docs-prose p,
.docs-prose ul,
.docs-prose ol,
.docs-prose pre,
.docs-table-wrap,
.docs-panel,
.docs-cards {
  margin: 0;
}

.docs-prose ul,
.docs-prose ol {
  display: grid;
  gap: 0.45rem;
  padding-left: 1.15rem;
}

.docs-prose a {
  color: var(--amber-bright);
}

.docs-prose code,
.docs-row code {
  color: var(--paper);
  font-family: var(--mono);
  font-size: 0.86em;
}

.docs-prose pre {
  overflow: auto;
  padding: 1rem 1.15rem;
  border: 1px solid var(--line-strong);
  background: var(--ink-raised);
  color: var(--paper);
  font-family: var(--mono);
  font-size: 0.78rem;
  line-height: 1.55;
}

.docs-table-wrap {
  overflow: auto;
  border: 1px solid var(--line);
}

.docs-table {
  width: 100%;
  border-collapse: collapse;
}

.docs-table th,
.docs-table td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
  font-size: 0.84rem;
  vertical-align: top;
}

.docs-table th {
  color: var(--quiet);
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.docs-table tr:last-child th,
.docs-table tr:last-child td {
  border-bottom: 0;
}

.docs-cards,
.docs-panel {
  display: grid;
  gap: 1px;
  border: 1px solid var(--line);
  background: var(--line);
}

.docs-cards {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.docs-card,
.docs-panel-header,
.docs-row {
  min-width: 0;
  padding: 1.15rem 1.25rem;
  background: var(--ink);
}

.docs-card h3 {
  margin: 0 0 0.45rem;
  font-size: 1.15rem;
}

.docs-card p,
.docs-row {
  margin: 0;
  color: var(--quiet);
  font-size: 0.82rem;
  line-height: 1.5;
}

.docs-panel-header,
.docs-row {
  display: grid;
  grid-template-columns: minmax(9rem, 0.85fr) minmax(0, 1.15fr);
  gap: 1rem;
}

.docs-panel-header {
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.docs-aside {
  display: grid;
  gap: 1px;
  border: 1px solid var(--line);
  background: var(--line);
}

.docs-aside div {
  padding: 1.1rem 1.2rem;
  background: var(--ink-raised);
}

.docs-aside strong {
  display: block;
  margin-bottom: 0.3rem;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.docs-aside p {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}

.docs-footer {
  padding: clamp(3rem, 6vw, 5rem) var(--space) 2rem;
}

.docs-footer-grid {
  display: grid;
  grid-template-columns: minmax(16rem, 1.5fr) repeat(3, minmax(8rem, 0.7fr));
  gap: clamp(2rem, 5vw, 4rem);
  width: min(100%, 106rem);
  margin: 0 auto;
}

.docs-footer-brand p {
  max-width: 28rem;
  color: var(--muted);
}

.docs-footer-column h3 {
  margin: 0 0 1rem;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.67rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.docs-footer-links {
  display: grid;
  gap: 0.55rem;
}

.docs-footer-base {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  width: min(100%, 106rem);
  margin: 2.5rem auto 0;
  padding-top: 1.25rem;
  border-top: 1px solid var(--line);
  color: var(--quiet);
  font-family: var(--mono);
  font-size: 0.62rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

@media (max-width: 68rem) {
  .docs-nav-top {
    display: none;
  }

  .docs-menu {
    display: block;
  }

  .docs-header {
    grid-template-columns: 1fr auto auto;
  }

  .docs-shell,
  .docs-hero,
  .docs-cards,
  .docs-footer-grid {
    grid-template-columns: 1fr;
  }

  .docs-side {
    position: static;
    padding-top: 1.5rem;
    padding-bottom: 0;
  }
}

@media (max-width: 48rem) {
  .docs-header .button-quiet {
    display: none;
  }

  .docs-panel-header,
  .docs-row {
    grid-template-columns: 1fr;
  }

  .docs-footer-base {
    flex-direction: column;
  }
}
`;

function header(path: string): string {
  return `
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header docs-header">
    <a class="brand" href="https://lokiplay.cc/" aria-label="Loki home">
      ${brandMarkHtml()}
      <span>LOKI</span>
    </a>
    <nav class="docs-nav-top" aria-label="Docs shortcuts">
      <a href="/quickstart"${currentAttr(path, "/quickstart")}>Quickstart</a>
      <a href="/sdk"${currentAttr(path, "/sdk")}>SDK</a>
      <a href="/agents"${currentAttr(path, "/agents")}>Agents</a>
      <a href="/mcp"${currentAttr(path, "/mcp")}>MCP</a>
      <a href="https://lokiplay.cc/">Product ↗</a>
    </nav>
    <details class="docs-menu">
      <summary>Menu</summary>
      <div class="docs-menu-panel">
        <a href="/quickstart"${currentAttr(path, "/quickstart")}>Quickstart</a>
        <a href="/sdk"${currentAttr(path, "/sdk")}>SDK</a>
        <a href="/agents"${currentAttr(path, "/agents")}>Agents</a>
        <a href="/mcp"${currentAttr(path, "/mcp")}>MCP</a>
        <a href="https://lokiplay.cc/">Product ↗</a>
      </div>
    </details>
    <div class="docs-actions">
      <a class="button button-quiet" href="https://lokiplay.cc/">Product</a>
      <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get Started</a>
    </div>
  </header>`;
}

function sidebar(path: string): string {
  return `
    <nav class="docs-side" aria-label="Documentation">
      ${navGroups
        .map(
          (group) => `
      <div class="docs-side-group">
        <h2>${group.label}</h2>
        <ol>
          ${group.items
            .map(
              (item) =>
                `<li><a href="${item.href}"${currentAttr(path, item.href)}>${item.label}</a></li>`,
            )
            .join("")}
        </ol>
      </div>`,
        )
        .join("")}
    </nav>`;
}

function footer(): string {
  return `
  <footer class="docs-footer">
    <div class="docs-footer-grid">
      <div class="docs-footer-brand">
        <a class="brand" href="/" aria-label="Loki docs home">${brandMarkHtml()}<span>LOKI / Docs</span></a>
        <p>Hosting and host-authoritative multiplayer for finished browser games. One SDK. One CLI. No invented backend.</p>
      </div>
      <div class="docs-footer-column"><h3>Start</h3><div class="docs-footer-links">
        <a href="/quickstart">Quickstart</a>
        <a href="/concepts">How Loki works</a>
        <a href="/agents">Agent rules</a>
      </div></div>
      <div class="docs-footer-column"><h3>Reference</h3><div class="docs-footer-links">
        <a href="/sdk">JavaScript SDK</a>
        <a href="/cli">CLI</a>
        <a href="/mcp">MCP</a>
        <a href="/safety">Safety note</a>
        <a href="/llms.txt">llms.txt</a>
      </div></div>
      <div class="docs-footer-column"><h3>Product</h3><div class="docs-footer-links">
        <a href="https://lokiplay.cc/">lokiplay.cc</a>
        <a href="https://app.lokiplay.cc/">Creator desk</a>
        <a href="https://play.lokiplay.cc/">Play</a>
      </div></div>
    </div>
    <div class="docs-footer-base"><span>© 2026 Loki Play</span><span>docs.lokiplay.cc · @lokiplay/sdk@${LOKI_PACKAGE_VERSION}</span></div>
  </footer>`;
}

function protectPackagePins(html: string): string {
  return html.replace(/([A-Za-z0-9/_-])@(\d)/g, "$1&#64;$2");
}

export function renderDocsSite(input: {
  config: ProductPageConfig;
  path: DocsRoute;
  title: string;
  description: string;
  lede: string;
  aside?: string;
  main: string;
}): string {
  return protectPackagePins(renderProductPage({
    config: input.config,
    title: input.title,
    description: input.description,
    body: `<!--email_off-->
${header(input.path)}
  <main class="docs-main" id="main-content">
    <div class="docs-shell">
      ${sidebar(input.path)}
      <article class="docs-article">
        <header class="docs-hero">
          <div>
            <p class="eyebrow">${docsEyebrow(input.path)}</p>
            <h1 class="docs-caption">${input.lede}</h1>
          </div>
          ${input.aside ?? ""}
        </header>
        <div class="docs-prose">
${input.main}
        </div>
      </article>
    </div>
  </main>
${footer()}
<!--/email_off-->`,
    styles: docsStyles,
    moduleScript: "",
    bodyClass: "docs-product",
  }));
}
