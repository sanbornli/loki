import {
  brandMarkHtml,
  renderProductPage,
  type ProductPageConfig,
} from "./product-theme.js";

export const productSections = [
  {
    id: "hosting",
    label: "Hosting",
    description: "A scanned, isolated home for every build.",
  },
  {
    id: "multiplayer",
    label: "Multiplayer",
    description: "Rooms, invites, and shared state without a server project.",
  },
  {
    id: "distribution",
    label: "Distribution",
    description: "Private while you build. Public when you are ready.",
  },
  {
    id: "agents",
    label: "Agents",
    description: "One source of truth for coding agents.",
  },
] as const;

export const productSectionIds = productSections.map((section) => section.id);

export function productSectionHref(id: string): string {
  return `/product#${id}`;
}

export const marketingRoutes = [
  "/",
  "/product",
  "/hosting",
  "/multiplayer",
  "/distribution",
  "/agents",
  "/sdk",
  "/examples",
  "/pricing",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
  "/aup",
] as const;

export type MarketingRoute = (typeof marketingRoutes)[number];

export function normalizeMarketingPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isMarketingRoute(pathname: string): pathname is MarketingRoute {
  return (marketingRoutes as readonly string[]).includes(
    normalizeMarketingPath(pathname),
  );
}

function currentAttr(path: string, href: string): string {
  return path === href ? ' aria-current="page"' : "";
}

const productPaths = [
  "/product",
  "/hosting",
  "/multiplayer",
  "/distribution",
  "/agents",
  "/sdk",
] as const;

function productMenuOpen(path: string): string {
  return (productPaths as readonly string[]).includes(path) ? " open" : "";
}

export const marketingStyles = `
.marketing-product {
  --hero-title-size: clamp(3.4rem, 6.6vw, 7.6rem);
  --section-title-size: calc(0.8 * var(--hero-title-size));
  --page-inset: clamp(4rem, 20vw, 18rem);
  --page-max: 72rem;
  --page-gutter: max(calc(var(--page-inset) / 2), calc((100vw - var(--page-max)) / 2));
  --header-height: 5.25rem;
}

.marketing-header {
  position: sticky;
  top: 0;
  z-index: 20;
  grid-template-columns: 1fr auto 1fr;
  gap: 2rem;
  padding-right: var(--page-gutter);
  padding-left: var(--page-gutter);
  background: var(--ink);
}

.marketing-actions {
  justify-self: end;
}

.marketing-nav,
.marketing-actions,
.agent-links,
.page-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.hero-actions {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  width: max-content;
  max-width: 100%;
  gap: 0.75rem;
  margin-top: 2rem;
}

.hero-actions .button {
  min-width: 0;
}

.marketing-nav {
  justify-content: center;
  align-items: center;
  gap: clamp(0.85rem, 1.8vw, 1.7rem);
}

.marketing-nav a,
.marketing-nav .nav-flyout-toggle,
.footer-links a,
.product-subnav a,
.marketing-menu a,
.marketing-menu summary {
  color: var(--muted);
  font-size: 0.78rem;
  text-decoration: none;
}

.marketing-nav a,
.marketing-nav .nav-flyout-toggle {
  display: inline-flex;
  align-items: center;
  margin: 0;
  padding: 0;
  line-height: 1;
}

.marketing-nav a:hover,
.marketing-nav .nav-flyout-toggle:hover,
.nav-flyout:hover .nav-flyout-toggle,
.nav-flyout:focus-within .nav-flyout-toggle,
.footer-links a:hover,
.product-subnav a:hover,
.marketing-menu a:hover,
.marketing-menu summary:hover,
.marketing-nav a[aria-current="page"],
.footer-links a[aria-current="page"],
.product-subnav a[aria-current="page"] {
  color: var(--paper);
}

.marketing-nav summary,
.marketing-menu summary {
  list-style: none;
  cursor: pointer;
}

.marketing-nav summary::-webkit-details-marker,
.marketing-menu summary::-webkit-details-marker {
  display: none;
}

.nav-flyout {
  display: flex;
  align-items: center;
  position: relative;
}

.nav-flyout-toggle {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.nav-flyout .nav-menu {
  position: absolute;
  top: calc(100% + 0.55rem);
  left: 50%;
  z-index: 20;
  display: grid;
  width: 22.5rem;
  padding: 0.45rem;
  transform: translateX(-50%);
  border: 1px solid var(--line-strong);
  background: var(--ink-raised);
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}

.nav-flyout::after {
  position: absolute;
  top: 100%;
  left: 50%;
  width: 22.5rem;
  height: 0.7rem;
  transform: translateX(-50%);
  content: "";
}

.nav-flyout:hover .nav-menu,
.nav-flyout:focus-within .nav-menu {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
}

.nav-menu a {
  display: grid;
  gap: 0.2rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid transparent;
}

.nav-menu a:hover,
.nav-menu a:focus-visible,
.nav-menu a[aria-current="page"] {
  border-color: color-mix(in srgb, var(--amber) 55%, var(--line));
  background: color-mix(in srgb, var(--amber) 18%, var(--ink));
}

.nav-menu a:hover strong,
.nav-menu a:focus-visible strong,
.nav-menu a[aria-current="page"] strong {
  color: var(--amber-bright);
}

.nav-menu strong {
  color: var(--paper);
  font-size: 0.82rem;
  font-weight: 620;
}

.nav-menu span {
  color: var(--quiet);
  font-size: 0.72rem;
  line-height: 1.4;
}

.nav-menu a:hover span,
.nav-menu a:focus-visible span,
.nav-menu a[aria-current="page"] span {
  color: var(--muted);
}

.marketing-menu {
  display: none;
}

.marketing-menu-panel {
  position: absolute;
  top: 100%;
  right: var(--page-gutter);
  left: var(--page-gutter);
  z-index: 20;
  display: grid;
  gap: 0.35rem;
  padding: 1rem 1.1rem 1.2rem;
  border: 1px solid var(--line);
  background: var(--ink-raised);
}

.marketing-menu-panel a,
.menu-product > summary {
  padding: 0.45rem 0;
}

.menu-product > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.menu-product > summary::after {
  color: var(--quiet);
  content: "+";
  font-family: var(--mono);
  font-size: 0.7rem;
}

.menu-product[open] > summary {
  color: var(--paper);
}

.menu-product[open] > summary::after {
  content: "–";
}

.menu-product-list {
  display: grid;
  gap: 0.1rem;
  margin: 0.15rem 0 0.45rem;
  padding: 0.15rem 0 0.15rem 0.9rem;
  border-left: 1px solid var(--line-strong);
}

.menu-product-list a {
  padding: 0.4rem 0;
}

.marketing-main {
  overflow-x: clip;
}

.marketing-section {
  padding: clamp(2.25rem, 5vw, 4.25rem) 0;
}

.marketing-section-inner {
  width: min(100% - var(--page-inset), var(--page-max));
  margin: 0 auto;
}

.marketing-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(2.5rem, 6vw, 4.5rem);
  width: min(100% - var(--page-inset), var(--page-max));
  margin: 0 auto;
  padding: clamp(3.5rem, 8vw, 6rem) 0 clamp(1.5rem, 4vw, 2.5rem);
  text-align: center;
}

.marketing-hero-copy {
  position: relative;
  z-index: 1;
  width: min(100%, 52rem);
  min-width: 0;
}

.marketing-hero .display {
  max-width: none;
  font-size: var(--hero-title-size);
}

.marketing-hero .lede {
  max-width: 40rem;
  margin-right: auto;
  margin-left: auto;
}

.marketing-hero .hero-actions {
  margin-right: auto;
  margin-left: auto;
}

.marketing-hero .game-stage {
  width: 100%;
  min-height: clamp(22rem, 36vw, 32rem);
}

.hero-keep {
  white-space: nowrap;
}

.page-actions {
  flex-wrap: wrap;
  margin-top: 2rem;
}

.game-stage {
  position: relative;
  align-self: stretch;
  min-width: 0;
  min-height: min(46rem, calc(100vh - 6.5rem));
  margin: 0;
  border: 0;
  background: #0a0a08;
}

.ops-wall {
  display: grid;
  grid-template-columns: minmax(14rem, 0.95fr) minmax(4rem, 0.28fr) minmax(18rem, 1.1fr);
  gap: 0.7rem;
  padding: 0.7rem;
  overflow: hidden;
}

.ops-command,
.ops-live,
.ops-core {
  min-width: 0;
}

.ops-command,
.ops-live {
  display: grid;
  align-content: start;
  gap: 0.75rem;
  border: 1px solid #2f2c26;
  background: #10100d;
}

.ops-command {
  padding: 0.95rem;
}

.ops-live {
  padding: 0.95rem;
}

.ops-panel-head,
.pipe-bar,
.pipe-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.ops-panel-head em {
  color: #8d8878;
  font-style: normal;
}

.ops-terminal {
  display: grid;
  gap: 0.55rem;
  min-height: 8rem;
  padding: 0.9rem;
  border: 1px solid #2c2b25;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--amber) 9%, transparent) 0 1px, transparent 1px 100%),
    #080806;
  background-size: 1.35rem 100%;
}

.ops-type {
  display: block;
  width: 0;
  max-width: max-content;
  overflow: hidden;
  border-right: 1px solid var(--amber);
  color: var(--paper);
  font-family: var(--mono);
  font-size: clamp(0.58rem, 1vw, 0.78rem);
  line-height: 1.5;
  white-space: nowrap;
}

.ops-type::before {
  color: var(--amber);
  content: "$ ";
}

.ops-type-1 { animation: ops-type 12s steps(38, end) -2.2s infinite; }
.ops-type-2 { animation: ops-type 12s steps(34, end) -0.6s infinite; }
.ops-type-3 { animation: ops-type 12s steps(36, end) 1.1s infinite; }

.ops-log {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ops-log li {
  display: grid;
  grid-template-columns: 1.8rem 1fr auto;
  gap: 0.65rem;
  align-items: center;
  min-height: 2.75rem;
  padding: 0 0.7rem;
  border: 1px solid #2c2b25;
  background: #0c0b09;
  color: #8d8878;
  opacity: 0.4;
  animation: ops-log 12s linear infinite;
}

.ops-log li:nth-child(2) { animation-delay: 1.5s; }
.ops-log li:nth-child(3) { animation-delay: 3s; }
.ops-log li:nth-child(4) { animation-delay: 4.5s; }

.ops-log b {
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.56rem;
}

.ops-log span {
  color: var(--paper);
  font-size: 0.76rem;
}

.ops-log em {
  color: #8d8878;
  font-family: var(--mono);
  font-size: 0.56rem;
  font-style: normal;
}

.ops-core {
  position: relative;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 1.1rem;
}

.ops-core::before {
  position: absolute;
  top: 10%;
  bottom: 10%;
  left: 50%;
  width: 1px;
  background: linear-gradient(transparent, color-mix(in srgb, var(--amber) 60%, transparent), transparent);
  content: "";
}

.ops-node {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 4rem;
  min-height: 4rem;
  border: 1px solid color-mix(in srgb, var(--amber) 45%, #2c2b25);
  background: #10100d;
  color: var(--amber-bright);
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  animation: ops-node 12s linear infinite;
}

.ops-node-loki {
  width: 5.2rem;
  min-height: 5.2rem;
  border-color: var(--amber);
  background: color-mix(in srgb, var(--amber) 12%, #10100d);
  color: var(--paper);
}

.ops-beam {
  position: relative;
  z-index: 1;
  width: 0.5rem;
  height: 5.4rem;
  background: linear-gradient(transparent, var(--amber), transparent);
  opacity: 0.35;
  animation: ops-beam 12s linear infinite;
}

.ops-room-card,
.ops-url-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem;
  border: 1px solid #2c2b25;
  background: #0c0b09;
}

.ops-room-card strong,
.ops-url-card span {
  display: block;
  color: var(--paper);
  font-size: 0.9rem;
  letter-spacing: -0.03em;
}

.ops-room-card span,
.ops-url-card b {
  display: block;
  margin-top: 0.25rem;
  color: #8d8878;
  font-family: var(--mono);
  font-size: 0.56rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ops-room-card small {
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.ops-mini-grid {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 0.65rem;
}

.ops-mini {
  position: relative;
  min-height: 8rem;
  overflow: hidden;
  border: 1px solid #2c2b25;
  background: #0c0b09;
}

.ops-mini span {
  position: absolute;
  top: 0.55rem;
  left: 0.6rem;
  z-index: 2;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ops-mini-board {
  background:
    linear-gradient(#5aa7e6 1px, transparent 1px),
    linear-gradient(90deg, #5aa7e6 1px, transparent 1px),
    #0a2434;
  background-size: 1.75rem 1.75rem;
}

.ops-mini-board i {
  position: absolute;
  border: 1px solid #8d98a2;
  border-radius: 999px;
  background: #d5dee4;
}

.ops-mini-board i:nth-of-type(1) { top: 3.1rem; left: 2.6rem; width: 5.2rem; height: 0.9rem; }
.ops-mini-board i:nth-of-type(2) { top: 5.5rem; left: 7rem; width: 3.5rem; height: 0.9rem; }
.ops-mini-board i:nth-of-type(3) { top: 3.9rem; right: 2.4rem; width: 0.9rem; height: 4.6rem; }
.ops-mini-board i:nth-of-type(4),
.ops-mini-board i:nth-of-type(5),
.ops-mini-board i:nth-of-type(6) {
  width: 0.8rem;
  height: 0.8rem;
  border-color: var(--amber);
  background: #c43b28;
  animation: ops-hit 7s linear infinite;
}

.ops-mini-board i:nth-of-type(4) { top: 4.3rem; left: 5rem; }
.ops-mini-board i:nth-of-type(5) { top: 6rem; right: 4.8rem; animation-delay: 2s; }
.ops-mini-board i:nth-of-type(6) { top: 2.7rem; right: 6.8rem; animation-delay: 4s; }

.ops-mini-pool {
  background:
    radial-gradient(circle at 42% 48%, #f3ead8 0 0.34rem, transparent 0.36rem),
    radial-gradient(circle at 65% 44%, #e36a2c 0 0.34rem, transparent 0.36rem),
    radial-gradient(circle at 72% 57%, #2c62d4 0 0.34rem, transparent 0.36rem),
    radial-gradient(circle at 78% 42%, #090907 0 0.34rem, transparent 0.36rem),
    linear-gradient(#4a2d19 0 0.8rem, transparent 0.8rem calc(100% - 0.8rem), #4a2d19 calc(100% - 0.8rem)),
    #14532e;
}

.ops-mini-pool::after {
  position: absolute;
  top: 54%;
  left: -10%;
  width: 60%;
  height: 2px;
  background: #c4a074;
  transform: rotate(-4deg);
  transform-origin: right center;
  animation: ops-cue 7s linear infinite;
  content: "";
}

.ops-mini-chat {
  grid-column: 1 / -1;
  display: grid;
  align-content: end;
  gap: 0.45rem;
  padding: 2.2rem 0.7rem 0.7rem;
}

.ops-mini-chat p {
  margin: 0;
  padding: 0.55rem 0.65rem;
  border: 1px solid #2c2b25;
  background: color-mix(in srgb, var(--amber) 8%, #10100d);
  color: #d8d0c0;
  font-size: 0.7rem;
  animation: ops-chat 7s linear infinite;
}

.ops-mini-chat p:nth-of-type(2) { animation-delay: 2s; }

.ops-player-rail {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

.ops-player-rail span {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  padding: 0.55rem;
  border: 1px solid #2c2b25;
  color: var(--paper);
  font-family: var(--mono);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  animation: ops-player 9s linear infinite;
}

.ops-player-rail span:nth-child(2) { animation-delay: 1.5s; }
.ops-player-rail span:nth-child(3) { animation-delay: 3s; }
.ops-seat-open { opacity: 0.45; }

.ops-player-rail i {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  background: var(--amber);
  color: var(--ink);
  font-style: normal;
}

.ops-url-card {
  border-color: color-mix(in srgb, var(--amber) 48%, #2c2b25);
  animation: ops-url 12s linear infinite;
}

@keyframes ops-type {
  0%, 10% { width: 0; }
  28%, 82% { width: 100%; }
  90%, 100% { width: 100%; border-right-color: transparent; }
}

@keyframes ops-log {
  0%, 12% { opacity: 0.35; }
  18%, 38% {
    border-color: color-mix(in srgb, var(--amber) 55%, #2c2b25);
    background: color-mix(in srgb, var(--amber) 10%, #10100d);
    opacity: 1;
  }
  48%, 100% { opacity: 0.48; }
}

@keyframes ops-node {
  0%, 100% { box-shadow: none; }
  32%, 58% { box-shadow: 0 0 28px color-mix(in srgb, var(--amber) 28%, transparent); }
}

@keyframes ops-beam {
  0%, 15% { opacity: 0.18; transform: scaleY(0.55); }
  34%, 70% { opacity: 0.85; transform: scaleY(1); }
  100% { opacity: 0.18; transform: scaleY(0.55); }
}

@keyframes ops-hit {
  0%, 32% { opacity: 0; transform: scale(0.5); }
  38% { opacity: 1; transform: scale(1.2); }
  52%, 100% { opacity: 0.6; transform: scale(1); }
}

@keyframes ops-cue {
  0%, 20% { transform: translateX(0) rotate(-4deg); opacity: 0.28; }
  32% { transform: translateX(1rem) rotate(-4deg); opacity: 1; }
  52%, 100% { transform: translateX(0) rotate(-4deg); opacity: 0.28; }
}

@keyframes ops-chat {
  0%, 34% { opacity: 0; transform: translateY(0.6rem); }
  44%, 100% { opacity: 1; transform: translateY(0); }
}

@keyframes ops-player {
  0%, 24% { border-color: #2c2b25; background: transparent; }
  36%, 64% {
    border-color: color-mix(in srgb, var(--amber) 48%, #2c2b25);
    background: color-mix(in srgb, var(--amber) 8%, transparent);
  }
  78%, 100% { border-color: #2c2b25; background: transparent; }
}

@keyframes ops-url {
  0%, 42% { opacity: 0.45; }
  52%, 100% {
    opacity: 1;
    box-shadow: 0 0 24px color-mix(in srgb, var(--amber) 22%, transparent);
  }
}

.game-windows {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 0.7rem;
  height: 100%;
  padding: 0.7rem;
}

.game-window {
  position: relative;
  overflow: hidden;
  min-height: 0;
  border: 1px solid #3a392f;
  background: #10100d;
}

.game-window-tall {
  grid-row: 1 / 3;
}

.game-window-bar {
  display: flex;
  gap: 0.28rem;
  align-items: center;
  height: 1.35rem;
  padding: 0 0.55rem;
  border-bottom: 1px solid #2c2b25;
  background: #161612;
}

.game-window-bar i {
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 50%;
  background: #3f3d36;
}

.game-window-bar i:first-child { background: #6a4338; }
.game-window-bar i:nth-child(2) { background: #6a5a32; }
.game-window-bar span {
  margin-left: 0.4rem;
  color: #8d8878;
  font-family: var(--mono);
  font-size: 0.52rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.game-scene {
  position: absolute;
  inset: 1.35rem 0 0;
}

.seat {
  position: absolute;
  left: 0.5rem;
  right: 0.5rem;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  height: 1.45rem;
  padding: 0 0.45rem;
  border: 1px solid #2f2c26;
  background: color-mix(in srgb, #0c0b09 84%, transparent);
  color: #e8e0d0;
  font-family: var(--mono);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.scene-battleship .seat-you,
.scene-pool .seat-you,
.scene-chess .seat-you { top: 0.45rem; }

.scene-battleship .seat-them,
.scene-pool .seat-them,
.scene-chess .seat-them { bottom: 0.45rem; }

.scene-chess .seat-them { top: 0.45rem; bottom: auto; }
.scene-chess .seat-you { top: auto; bottom: 0.45rem; }

.seat i {
  display: grid;
  place-items: center;
  width: 1.05rem;
  height: 1.05rem;
  border-radius: 50%;
  font-size: 0.48rem;
  font-style: normal;
  color: #14110c;
}

.seat-you i { background: var(--amber-bright); box-shadow: 0 0 10px color-mix(in srgb, var(--amber) 50%, transparent); }
.seat-them i { background: #8ec8ff; box-shadow: 0 0 10px #5aa7e6; color: #102033; }

.seat em {
  margin-left: auto;
  color: var(--amber-bright);
  opacity: 0;
}

.scene-battleship .seat-you,
.scene-pool .seat-you,
.scene-chess .seat-you {
  animation: you-active 8s linear infinite;
}

.scene-battleship .seat-them,
.scene-pool .seat-them,
.scene-chess .seat-them {
  animation: them-active 8s linear infinite;
}

.scene-battleship .seat-you em,
.scene-pool .seat-you em,
.scene-chess .seat-you em {
  animation: you-label 8s linear infinite;
}

.scene-battleship .seat-them em,
.scene-pool .seat-them em,
.scene-chess .seat-them em {
  animation: them-label 8s linear infinite;
}

.game-scene-art {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.scene-battleship { background: #07141f; }
.scene-pool { background: #0b0d0a; }
.scene-chess { background: #16130f; }

.bs-reticle { animation: bs-aim 8s linear infinite; }
.bs-shot { animation: bs-fire 8s linear infinite; }
.bs-hit { animation: show-hit 8s linear infinite; }
.bs-miss { animation: show-miss 8s linear infinite; }
.bs-splash { transform-origin: 93px 105px; animation: bs-splash 8s linear infinite; }

.pool-cueball { animation: pool-cue 8s linear infinite; }
.pool-object { animation: pool-object 8s linear infinite; }
.cue-you { animation: cue-you 8s linear infinite; }
.cue-them { animation: cue-them 8s linear infinite; }

.wn { animation: chess-wn 8s linear infinite; }
.bn { animation: chess-bn 8s linear infinite; }
.move-w { animation: mark-w 8s linear infinite; }
.move-w2 { animation: mark-w2 8s linear infinite; }
.move-b { animation: mark-b 8s linear infinite; }
.move-b2 { animation: mark-b2 8s linear infinite; }

@keyframes you-active {
  0%, 49% { background: color-mix(in srgb, var(--amber) 16%, transparent); }
  50%, 100% { background: transparent; }
}

@keyframes them-active {
  0%, 49% { background: transparent; }
  50%, 100% { background: color-mix(in srgb, #8ec8ff 16%, transparent); }
}

@keyframes you-label {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

@keyframes them-label {
  0%, 49% { opacity: 0; }
  50%, 100% { opacity: 1; }
}

@keyframes bs-aim {
  0%, 8% { transform: translate(57px, 69px); opacity: 1; }
  18% { transform: translate(93px, 105px); opacity: 1; }
  24%, 48% { transform: translate(93px, 105px); opacity: 0; }
  50%, 58% { transform: translate(75px, 123px); opacity: 1; }
  68% { transform: translate(57px, 141px); opacity: 1; }
  74%, 100% { transform: translate(57px, 141px); opacity: 0; }
}

@keyframes bs-fire {
  0%, 16% { transform: translate(100px, 30px); opacity: 0; }
  20% { transform: translate(93px, 78px); opacity: 1; }
  24%, 64% { transform: translate(93px, 105px); opacity: 0; }
  66% { transform: translate(100px, 214px); opacity: 0; }
  70% { transform: translate(72px, 160px); opacity: 1; }
  74%, 100% { transform: translate(57px, 141px); opacity: 0; }
}

@keyframes show-hit {
  0%, 22% { opacity: 0; }
  24%, 100% { opacity: 1; }
}

@keyframes show-miss {
  0%, 70% { opacity: 0; }
  72%, 100% { opacity: 1; }
}

@keyframes bs-splash {
  0%, 22% { transform: scale(0.4); opacity: 0; }
  26% { transform: scale(1.35); opacity: 0.9; }
  36%, 100% { transform: scale(1.8); opacity: 0; }
}

@keyframes cue-you {
  0%, 8% { transform: translate(0, 0); opacity: 1; }
  16% { transform: translate(-16px, 0); opacity: 1; }
  20% { transform: translate(8px, 0); opacity: 1; }
  28%, 100% { transform: translate(0, 0); opacity: 0.18; }
}

@keyframes cue-them {
  0%, 49% { transform: translate(0, 0); opacity: 0.18; }
  56% { transform: translate(16px, 0); opacity: 1; }
  62% { transform: translate(-8px, 0); opacity: 1; }
  70%, 100% { transform: translate(0, 0); opacity: 0.18; }
}

@keyframes pool-cue {
  0%, 18% { transform: translate(0, 0); }
  28% { transform: translate(118px, -8px); }
  36%, 58% { transform: translate(124px, -6px); }
  68% { transform: translate(36px, 6px); }
  76%, 100% { transform: translate(12px, 0); }
}

@keyframes pool-object {
  0%, 24% { transform: translate(0, 0); }
  34%, 100% { transform: translate(42px, -22px); }
}

@keyframes chess-wn {
  0%, 14% { transform: translate(0, 0); }
  24%, 100% { transform: translate(20px, -40px); }
}

@keyframes chess-bn {
  0%, 56% { transform: translate(0, 0); }
  66%, 100% { transform: translate(20px, 40px); }
}

@keyframes mark-w {
  0%, 12% { opacity: 0.32; }
  24%, 100% { opacity: 0.12; }
}

@keyframes mark-w2 {
  0%, 14% { opacity: 0; }
  24%, 100% { opacity: 0.22; }
}

@keyframes mark-b {
  0%, 54% { opacity: 0; }
  66%, 100% { opacity: 0.28; }
}

@keyframes mark-b2 {
  0%, 56% { opacity: 0; }
  66%, 100% { opacity: 0.2; }
}

.page-hero {
  padding: clamp(3.2rem, 7vw, 5.8rem) 0 clamp(2.5rem, 5vw, 3.8rem);
}

.page-hero-inner {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(16rem, 0.75fr);
  gap: clamp(2rem, 6vw, 6rem);
  align-items: end;
  width: min(100% - var(--page-inset), var(--page-max));
  margin: 0 auto;
}

.page-hero .display {
  max-width: 12ch;
  font-size: clamp(2.8rem, 5.4vw, 6rem);
}

.page-hero .lede {
  max-width: 40rem;
}

.page-aside {
  display: grid;
  gap: 1px;
  border: 1px solid var(--line);
  background: var(--line);
}

.page-aside div {
  padding: 1.1rem 1.2rem;
  background: var(--ink-raised);
}

.page-aside strong {
  display: block;
  margin-bottom: 0.3rem;
  font-family: var(--mono);
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--amber);
}

.page-aside p {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.5;
}

.product-subnav {
  position: sticky;
  top: var(--header-height);
  z-index: 15;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
  width: min(100% - var(--page-inset), var(--page-max));
  margin: 0 auto;
  padding: 0.95rem 0;
  background: var(--ink);
}

.product-block {
  scroll-margin-top: calc(var(--header-height) + 3.5rem);
}

.grok-hero {
  width: min(100% - var(--page-inset), 52rem);
  margin: 0 auto;
  padding: clamp(4.5rem, 10vw, 7.5rem) 0 clamp(3.5rem, 7vw, 5.5rem);
  text-align: center;
}

.grok-kicker {
  display: flex;
  gap: 0.85rem;
  align-items: center;
  justify-content: center;
  margin: 0 0 1.6rem;
  color: var(--quiet);
  font-family: var(--mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.grok-kicker-rule {
  width: 1px;
  height: 0.9rem;
  background: var(--line-strong);
}

.grok-hero .display {
  max-width: 100%;
  margin: 0 auto;
  font-size: clamp(2.7rem, 5.2vw, 4.5rem);
}

.grok-hero .lede {
  max-width: 38rem;
  margin: 0.85rem auto 0;
}

.grok-hero .display + .lede {
  margin-top: 2.25rem;
}

.grok-hero .page-actions,
.grok-start .page-actions,
.grok-build .page-actions {
  justify-content: center;
  margin-top: 2rem;
}

.grok-stage {
  border-top: 1px solid var(--line);
}

.grok-stage-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
  gap: clamp(2rem, 4vw, 4.5rem);
  align-items: stretch;
  width: min(100% - var(--page-inset), var(--page-max));
  margin: 0 auto;
  padding: clamp(2rem, 5vw, 3.5rem) 0 clamp(3rem, 6vw, 5rem);
}

.grok-feature {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 52vh;
  padding: 2.5rem 0;
  scroll-margin-top: calc(var(--header-height) + 1.5rem);
}

.grok-feature h2 {
  margin: 0;
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  font-weight: 560;
  letter-spacing: -0.045em;
  line-height: 1.05;
}

.grok-feature > p {
  max-width: 36rem;
  margin: 1rem 0 0;
  color: var(--muted);
  font-size: 1.05rem;
  line-height: 1.6;
}

.grok-checks {
  display: grid;
  gap: 0.7rem;
  margin: 1.4rem 0 0;
  padding: 0;
  list-style: none;
}

.grok-checks li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.7rem;
  align-items: start;
  color: var(--paper);
  font-size: 0.95rem;
  line-height: 1.45;
}

.grok-checks li::before {
  color: var(--amber);
  content: "✓";
  font-size: 0.85rem;
  line-height: 1.5;
}

.grok-inline-panel {
  display: none;
  margin-top: 1.6rem;
}

.grok-sticky {
  position: sticky;
  top: calc(50vh - 13rem);
}

.grok-panel {
  display: none;
}

.grok-stage[data-active="hosting"] .grok-panel[data-panel="hosting"],
.grok-stage[data-active="multiplayer"] .grok-panel[data-panel="multiplayer"],
.grok-stage[data-active="distribution"] .grok-panel[data-panel="distribution"],
.grok-stage[data-active="agents"] .grok-panel[data-panel="agents"] {
  display: block;
}

.grok-panel .release-panel,
.grok-panel .lobby-panel,
.grok-panel .docs-panel,
.grok-panel .page-aside,
.grok-panel .host-laptop,
.grok-panel .world-net-frame,
.grok-panel .grok-montage,
.grok-inline-panel .release-panel,
.grok-inline-panel .lobby-panel,
.grok-inline-panel .docs-panel,
.grok-inline-panel .page-aside,
.grok-inline-panel .host-laptop,
.grok-inline-panel .world-net-frame,
.grok-inline-panel .grok-montage {
  width: 100%;
}

.host-laptop {
  margin: 0;
  color: #1c1a16;
}

.host-lid {
  padding: 0.55rem 0.55rem 0.7rem;
  border-radius: 1.05rem 1.05rem 0.35rem 0.35rem;
  background: #e4dfd6;
  box-shadow: 0 0 0 1px #8d877c, 0 22px 48px rgba(0, 0, 0, 0.35);
}

.host-browser {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  aspect-ratio: 16 / 10.5;
  border-radius: 0.55rem;
  background: #10281c;
}

.host-chrome {
  display: grid;
  flex: none;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.7rem;
  align-items: center;
  padding: 0.55rem 0.7rem;
  background: #ece7df;
}

.host-lights { display: flex; gap: 0.32rem; }
.host-lights i { width: 0.55rem; height: 0.55rem; border-radius: 50%; }
.host-lights i:nth-child(1) { background: #e15b4a; }
.host-lights i:nth-child(2) { background: #e2b23a; }
.host-lights i:nth-child(3) { background: #59b36a; }

.host-url {
  display: block;
  padding: 0.42rem 0.85rem;
  border-radius: 999px;
  background: #fff;
  color: #1c1a16;
  font-family: var(--mono);
  font-size: clamp(0.95rem, 2vw, 1.2rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
}

.host-table {
  position: relative;
  flex: 1;
  margin: 0.75rem;
  border-radius: 0.35rem;
  background: radial-gradient(ellipse at center, #1f6b45 0 72%, #0e2a1c 74% 100%);
  box-shadow: inset 0 0 0 0.42rem #c8b48a;
}

.host-table .pocket,
.host-table .ball {
  width: 1.35rem;
  height: 1.35rem;
}

.host-table .pocket-tl { top: 0.55rem; left: 0.55rem; }
.host-table .pocket-tr { top: 0.55rem; right: 0.55rem; }
.host-table .pocket-bl { bottom: 0.55rem; left: 0.55rem; }
.host-table .pocket-br { bottom: 0.55rem; right: 0.55rem; }

.host-cue {
  position: absolute;
  top: 34%;
  left: 4%;
  width: 28%;
  height: 0.28rem;
  border-radius: 999px;
  background: linear-gradient(90deg, #f4efe3, #c47a12 18%, #8a5a28);
  transform: rotate(18deg);
  transform-origin: right center;
}

.host-base {
  position: relative;
  height: 0.85rem;
  margin: 0 8%;
  border-radius: 0 0 0.85rem 0.85rem;
  background: linear-gradient(#6a655e, #3e3b36);
}

.host-base span {
  position: absolute;
  top: 0;
  left: 18%;
  width: 64%;
  height: 0.28rem;
  border-radius: 0 0 0.35rem 0.35rem;
  background: #2a2824;
}

.world-net-frame {
  margin: 0;
}

.world-net {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  object-position: center;
  border-radius: 1.15rem;
  background: #0c0b09;
  box-shadow: 0 0 0 1px #2c2a26, 0 22px 48px rgba(0, 0, 0, 0.38);
}

.grok-section-intro {
  max-width: 36rem;
  margin-bottom: clamp(2rem, 4vw, 3rem);
}

.grok-section-intro h2,
.grok-build h2 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.2rem);
  font-weight: 560;
  letter-spacing: -0.045em;
  line-height: 1.05;
}

.grok-section-intro p,
.grok-build p {
  margin: 0.9rem 0 0;
  color: var(--muted);
  font-size: 1.05rem;
  line-height: 1.6;
}

.grok-more {
  border-top: 1px solid var(--line);
}

.grok-more-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2.2rem 3rem;
}

.grok-more-grid h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.grok-more-grid p {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.5;
}

.grok-start {
  border-top: 1px solid var(--line);
  padding-bottom: clamp(5.5rem, 12vw, 9rem);
}

.grok-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.grok-steps li {
  padding: 1.25rem 0 0;
  border-top: 1px solid var(--line);
}

.grok-steps span {
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
}

.grok-steps h3 {
  margin: 0.7rem 0 0;
  font-size: 1.25rem;
  font-weight: 560;
  letter-spacing: -0.03em;
}

.grok-steps p {
  margin: 0.55rem 0 0;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.55;
}

.grok-build {
  border-top: 1px solid var(--line);
  scroll-margin-top: calc(var(--header-height) + 1.5rem);
}

.grok-build .marketing-section-inner {
  max-width: 40rem;
}

@media (max-width: 68rem) {
  .grok-stage-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .grok-visual {
    display: none;
  }

  .grok-inline-panel {
    display: block;
    margin-top: 3.5rem;
  }

  .grok-feature {
    min-height: 0;
  }

  .grok-more-grid,
  .grok-steps {
    grid-template-columns: 1fr;
  }

  .grok-kicker {
    flex-wrap: wrap;
  }
}

.split-heading {
  display: grid;
  grid-template-columns: minmax(12rem, 0.7fr) minmax(0, 1.3fr);
  gap: 0.85rem 3rem;
  align-items: start;
  margin-bottom: clamp(2.5rem, 5vw, 4.5rem);
  text-align: right;
}

.split-heading > .eyebrow {
  grid-column: 2;
  grid-row: 1;
  margin: 0;
}

.split-heading > h2,
.split-heading > div {
  grid-column: 2;
  grid-row: 2;
  justify-self: end;
}

.split-heading h2,
.section-heading h2 {
  max-width: 16ch;
  margin: 0;
  font-size: var(--section-title-size);
  font-weight: 560;
  letter-spacing: -0.065em;
  line-height: 0.98;
}

.split-heading h2 {
  margin-left: auto;
}

.split-heading-start {
  text-align: left;
}

.split-heading-start > .eyebrow,
.split-heading-start > h2,
.split-heading-start > div {
  grid-column: 1;
  justify-self: start;
}

.split-heading-start h2,
.split-heading-start .lede {
  margin-left: 0;
  margin-right: auto;
}

#workflow-title {
  max-width: none;
  margin: 0;
  font-size: var(--section-title-size);
  font-weight: 560;
  letter-spacing: -0.065em;
  line-height: 0.98;
}

.split-heading .lede {
  margin-left: auto;
  margin-right: 0;
}

.section-heading {
  margin-bottom: clamp(1.5rem, 3vw, 2.5rem);
}

.editorial-grid,
.capability-grid,
.plan-grid,
.sdk-grid {
  display: grid;
  gap: 1px;
  border: 1px solid var(--line);
  background: var(--line);
}

.editorial-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.editorial-stack {
  grid-template-columns: 1fr;
}

.capability-grid,
.sdk-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.plan-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.editorial-card,
.capability-card,
.sdk-card,
.plan-card,
.compare-wrap,
.legal-banner,
.placeholder-card,
.layer-card,
.lobby-panel,
.release-panel {
  min-width: 0;
  padding: clamp(1.5rem, 3vw, 2.5rem);
  background: var(--ink);
}

.editorial-card-raised,
.plan-card,
.layer-card,
.lobby-panel,
.release-panel {
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

.editorial-card h3,
.capability-card h3,
.layer-card h3 {
  max-width: 16ch;
  margin: 0;
  font-size: clamp(1.65rem, 2.6vw, 3rem);
  font-weight: 560;
  letter-spacing: -0.05em;
  line-height: 1.03;
}

.feature-copy h3 {
  max-width: 16ch;
  margin: 0;
  font-size: var(--section-title-size);
  font-weight: 560;
  letter-spacing: -0.065em;
  line-height: 0.98;
  letter-spacing: -0.05em;
  line-height: 1.03;
}

.editorial-card > p:not(.card-index),
.capability-card p,
.plan-card > p:not(.card-index):not(.price) {
  max-width: 34rem;
  margin: 1.2rem 0 0;
  color: var(--muted);
  line-height: 1.65;
}

.feature-copy > p:not(.card-index) {
  max-width: 36rem;
  margin: 1.4rem 0 0;
  color: var(--muted);
  font-size: 1.15rem;
  margin: 1.2rem 0 0;
  color: var(--muted);
  line-height: 1.65;
}

.feature-list,
.plain-list {
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

.plain-list {
  margin: 1.25rem 0 0;
  padding: 0;
  border: 0;
  color: var(--muted);
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

.agent-layout,
.two-col {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(28rem, 0.85fr);
  gap: clamp(3rem, 8vw, 9rem);
  align-items: center;
}

.agent-layout {
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(2rem, 4vw, 3rem);
  min-height: 0;
  align-items: stretch;
}

.agent-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.agent-copy h2,
.final-copy h2 {
  max-width: 12ch;
  margin: 0;
  font-size: var(--section-title-size);
  font-weight: 560;
  letter-spacing: -0.065em;
  line-height: 0.98;
}

.agent-copy h2 {
  max-width: 16ch;
  margin-right: auto;
  margin-left: auto;
}

.agent-copy > p:not(.eyebrow),
.final-copy > p:not(.eyebrow) {
  max-width: 40rem;
  margin: 1.5rem 0 0;
  color: var(--muted);
  font-size: 1.05rem;
  line-height: 1.65;
}

.agent-copy > p:not(.eyebrow) {
  margin-right: auto;
  margin-left: auto;
}

.agent-links {
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 2rem;
  gap: 1.5rem;
}

.agent-marquee {
  align-self: stretch;
  width: 100%;
  margin-top: 2.5rem;
  overflow: hidden;
  mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
}

.agent-logos-track {
  display: flex;
  width: max-content;
  animation: agent-roll 36s linear infinite;
}

.agent-marquee:hover .agent-logos-track {
  animation-play-state: paused;
}

.agent-logos {
  display: flex;
  flex: none;
  gap: 2.75rem;
  margin: 0;
  padding: 0 2.75rem 0 0;
  list-style: none;
}

.agent-logo {
  display: flex;
  flex: none;
  gap: 0.55rem;
  align-items: center;
  color: #f4f1ea;
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agent-logo img {
  display: block;
  width: 1.45rem;
  height: 1.45rem;
  object-fit: contain;
  filter: grayscale(1) brightness(0) invert(1);
}

@keyframes agent-roll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

@media (prefers-reduced-motion: reduce) {
  .agent-logos-track {
    width: 100%;
    animation: none;
    justify-content: center;
  }

  .agent-logos[aria-hidden="true"] {
    display: none;
  }

  .agent-logos {
    flex-wrap: wrap;
    justify-content: center;
  }
}

.ide-stage {
  min-width: 0;
}

.share-editor {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 32rem;
  overflow: hidden;
  border-radius: 1.15rem;
  background: #f7f4ee;
  color: #1c1a16;
  box-shadow:
    0 0 0 1px #2c2a26,
    0 22px 48px rgba(0, 0, 0, 0.38);
}

.share-editor-chrome,
.share-editor-tab {
  display: flex;
  gap: 0.7rem;
  align-items: center;
}

.share-editor-chrome {
  padding: 0.7rem 0.95rem;
  border-bottom: 1px solid rgba(28, 26, 22, 0.08);
  background: #eceae4;
}

.share-editor-dots {
  display: flex;
  flex: none;
  gap: 0.32rem;
}

.share-editor-dots i {
  display: block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #c8c2b6;
}

.share-editor-dots i:nth-child(1) { background: #e0a090; }
.share-editor-dots i:nth-child(2) { background: #e3c27a; }
.share-editor-dots i:nth-child(3) { background: #9dbe9a; }

.share-editor-name,
.share-editor-tabname,
.share-editor-side p,
.share-editor-side span,
.share-editor-tab,
.share-editor-code,
.ide-typed,
.ide-log {
  overflow-wrap: normal;
  word-break: keep-all;
  hyphens: none;
}

.share-editor-name {
  font-size: 0.82rem;
  font-weight: 650;
}

.share-editor-tabname {
  color: #6d675e;
  font-size: 0.78rem;
}

.share-editor-workspace {
  display: grid;
  grid-template-columns: 11rem minmax(0, 1fr);
  flex: 1;
  min-height: 16rem;
}

.share-editor-side {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.85rem 0.7rem;
  border-right: 1px solid rgba(28, 26, 22, 0.08);
  background: #f3f1ec;
}

.share-editor-side p {
  margin: 0 0 0.45rem;
  color: #6d675e;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.share-editor-side span {
  padding: 0.32rem 0.5rem;
  border-radius: 0.4rem;
  color: #3a362f;
  font-family: var(--mono);
  font-size: 0.78rem;
}

.share-editor-side .is-open {
  background: #fff;
  color: #1c1a16;
  font-weight: 650;
}

.ide-file-new {
  opacity: 0;
  animation: ide-file 14s linear infinite;
}

.share-editor-code {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
}

.share-editor-tab {
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid rgba(28, 26, 22, 0.08);
  color: #1c1a16;
  font-family: var(--mono);
  font-size: 0.75rem;
}

.share-editor-code ol {
  margin: 0;
  padding: 0.85rem 0 1rem;
  list-style: none;
  counter-reset: ide-line;
}

.share-editor-code li {
  display: grid;
  grid-template-columns: 2.4rem minmax(0, 1fr);
  gap: 0.75rem;
  padding: 0.12rem 0.9rem 0.12rem 0;
  color: #1c1a16;
  font-family: var(--mono);
  font-size: 0.82rem;
  line-height: 1.55;
  white-space: nowrap;
}

.share-editor-code li::before {
  counter-increment: ide-line;
  color: #b0a89c;
  content: counter(ide-line);
  font-size: 0.72rem;
  text-align: right;
}

.ide-indent {
  padding-left: 1.1rem;
}

.tok-k { color: #8a5a12; }
.tok-s { color: #1f6b58; }

.ide-added {
  opacity: 0;
  background: rgba(240, 167, 46, 0.16);
  animation: ide-added 14s linear infinite;
}

.share-editor-agent {
  display: grid;
  gap: 0.65rem;
  padding: 0.85rem 0.95rem 1rem;
  border-top: 1px solid rgba(28, 26, 22, 0.08);
  background: #f7f4ee;
}

.share-editor-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: center;
  min-height: 2.8rem;
  padding: 0.45rem 0.5rem 0.45rem 0.85rem;
  border-radius: 0.8rem;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(28, 26, 22, 0.1);
}

.ide-typed {
  display: block;
  width: 0;
  max-width: 100%;
  overflow: hidden;
  border-right: 2px solid #1c1a16;
  color: #1c1a16;
  font-family: var(--mono);
  font-size: clamp(0.72rem, 1.5vw, 0.92rem);
  line-height: 1.4;
  white-space: nowrap;
  animation: ide-type 14s steps(45, end) infinite;
}

.ide-run {
  padding: 0.38rem 0.75rem;
  border-radius: 999px;
  background: #eceae4;
  color: #6d675e;
  font-size: 0.75rem;
  font-weight: 700;
  animation: ide-run 14s linear infinite;
}

.ide-log {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ide-log li {
  color: #3a362f;
  font-size: 0.82rem;
  line-height: 1.35;
  opacity: 0;
}

.ide-log li:nth-child(1) { animation: ide-log-1 14s linear infinite; }
.ide-log li:nth-child(2) { animation: ide-log-2 14s linear infinite; }
.ide-log li:nth-child(3) { animation: ide-log-3 14s linear infinite; }

@keyframes ide-type {
  0%, 6% { width: 0; }
  36%, 92% { width: 45ch; }
  100% { width: 0; }
}

@keyframes ide-run {
  0%, 34% { background: #eceae4; color: #6d675e; }
  40%, 92% { background: #1c1a16; color: #f7f4ee; }
  100% { background: #eceae4; color: #6d675e; }
}

@keyframes ide-log-1 {
  0%, 40% { opacity: 0; }
  46%, 92% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes ide-log-2 {
  0%, 52% { opacity: 0; }
  58%, 92% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes ide-log-3 {
  0%, 66% { opacity: 0; }
  72%, 92% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes ide-added {
  0%, 54% { opacity: 0; }
  62%, 92% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes ide-file {
  0%, 50% { opacity: 0; }
  58%, 92% { opacity: 1; color: #1c1a16; font-weight: 650; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .ide-typed {
    width: 100%;
    animation: none;
  }

  .ide-run,
  .ide-log li,
  .ide-added,
  .ide-file-new {
    opacity: 1;
    animation: none;
  }

  .ide-run {
    background: #1c1a16;
    color: #f7f4ee;
  }
}

@media (max-width: 48rem) {
  .share-editor-code li {
    font-size: 0.72rem;
  }
}

.docs-panel,
.release-panel,
.lobby-panel {
  border: 1px solid var(--line-strong);
}

.docs-panel {
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  background: var(--ink);
}

.docs-panel-header,
.docs-row,
.release-row,
.lobby-row {
  display: grid;
  grid-template-columns: minmax(9rem, 0.8fr) minmax(0, 1.2fr);
  gap: 1rem;
  padding: 1rem 1.25rem;
}

.docs-panel-header,
.release-head,
.lobby-head {
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.docs-row,
.release-row,
.lobby-row {
  border-top: 1px solid var(--line);
  color: var(--quiet);
  font-size: 0.78rem;
}

.docs-row code,
.release-row code {
  color: var(--paper);
  font-family: var(--mono);
}

.game-card {
  padding: 0;
  background: var(--ink-raised);
}

.game-art {
  position: relative;
  display: grid;
  min-height: 11rem;
  overflow: hidden;
  border-bottom: 1px solid var(--line);
  background: var(--ink);
}

.games-heading.games-heading {
  grid-template-columns: 1fr;
  justify-items: center;
  text-align: center;
}

.games-heading.games-heading > .eyebrow,
.games-heading.games-heading > h2 {
  grid-column: 1;
  grid-row: auto;
  justify-self: center;
  margin-right: auto;
  margin-left: auto;
  text-align: center;
}

.game-art-ship {
  background:
    linear-gradient(#243038 1px, transparent 1px),
    linear-gradient(90deg, #243038 1px, transparent 1px),
    #102028;
  background-size: 12.5% 12.5%;
}

.mini-ship {
  position: absolute;
  border-radius: 999px;
  background: #f4efe3;
}

.mini-ship-h {
  top: 58%;
  left: 28%;
  width: 42%;
  height: 12%;
}

.mini-ship-v {
  top: 16%;
  right: 20%;
  width: 8%;
  height: 40%;
}

.mini-hit,
.mini-splash {
  position: absolute;
  width: 14%;
  aspect-ratio: 1;
  border-radius: 50%;
}

.mini-hit {
  top: 54%;
  left: 40%;
  background: #f0a72e;
  box-shadow: 0 0 0 2px #102028;
  animation: mini-pop 4.5s linear infinite;
}

.mini-splash {
  top: 30%;
  left: 16%;
  border: 2px solid #7eb4d0;
  animation: mini-pop 4.5s linear infinite;
}

.game-art-pool {
  background:
    radial-gradient(ellipse at center, #1f6b45 0 68%, #143c28 70% 100%);
}

.pocket {
  position: absolute;
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 50%;
  background: #080806;
  box-shadow: inset 0 0 0 2px #c8b48a;
}

.pocket-tl { top: 0.7rem; left: 0.7rem; }
.pocket-tr { top: 0.7rem; right: 0.7rem; }
.pocket-bl { bottom: 0.7rem; left: 0.7rem; }
.pocket-br { bottom: 0.7rem; right: 0.7rem; }

.ball {
  position: absolute;
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 50%;
  box-shadow: inset -2px -2px 0 rgba(0, 0, 0, 0.25);
}

.ball-cue { top: 38%; left: 22%; background: #f4efe3; }
.ball-one { top: 46%; left: 48%; background: #f0a72e; animation: ball-roll 4.5s ease-in-out infinite; }
.ball-eight { top: 58%; left: 64%; background: #16140f; box-shadow: inset 0 0 0 3px #f4efe3, inset -2px -2px 0 rgba(0, 0, 0, 0.25); }

.game-art-chess {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  min-height: 11rem;
  background: #1a1814;
}

.game-art-chess::before {
  position: absolute;
  inset: 0;
  background:
    conic-gradient(#f4efe3 25%, #1a1814 0 50%, #f4efe3 0 75%, #1a1814 0) 0 0 / 25% 25%;
  content: "";
}

.chess-piece {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  font-size: 1.55rem;
  line-height: 1;
}

.chess-king { grid-column: 5; grid-row: 1; color: #f4efe3; }
.chess-queen { grid-column: 4; grid-row: 1; color: #1a1814; }
.chess-pawn { grid-column: 5; grid-row: 2; color: #1a1814; }
.chess-knight { grid-column: 2; grid-row: 8; color: #f4efe3; animation: mini-pop 4.5s linear infinite; }

@keyframes mini-pop {
  0%, 18% { opacity: 0; transform: scale(0.4); }
  32%, 78% { opacity: 1; transform: scale(1); }
  92%, 100% { opacity: 0; transform: scale(0.4); }
}

@keyframes ball-roll {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(1.1rem, 0.35rem); }
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

.feature-stack {
  display: grid;
  gap: clamp(1.75rem, 4vw, 3rem);
}

.feature-row,
.feature-row-flip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(2rem, 6vw, 5rem);
  align-items: center;
}

.workflow-row {
  min-height: 46.25rem;
}

.party-flow {
  position: relative;
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 0.9rem;
  padding: 0.9rem;
  overflow: hidden;
  border: 0;
  background:
    radial-gradient(circle at 24% 16%, color-mix(in srgb, var(--amber) 16%, transparent), transparent 28%),
    #080806;
}

.party-flow::before {
  position: absolute;
  inset: 1.4rem;
  border: 1px solid color-mix(in srgb, var(--amber) 24%, transparent);
  opacity: 0.28;
  content: "";
  pointer-events: none;
}

.party-command,
.party-step,
.party-room {
  position: relative;
  z-index: 1;
  border: 1px solid #2c2b25;
  background: #10100d;
}

.party-command {
  display: grid;
  gap: 0.45rem;
  padding: 0.9rem 1rem;
}

.party-command span,
.party-badge,
.party-link,
.party-step b,
.party-step em {
  font-family: var(--mono);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.party-command span,
.party-step b,
.party-badge {
  color: var(--amber);
}

.party-command code {
  display: block;
  width: 0;
  max-width: max-content;
  overflow: hidden;
  border-right: 1px solid var(--amber);
  color: var(--paper);
  font-family: var(--mono);
  font-size: clamp(0.68rem, 1vw, 0.9rem);
  white-space: nowrap;
  animation: party-type 10s steps(48, end) -2s infinite;
}

.party-command code::before {
  color: var(--amber);
  content: "$ ";
}

.party-steps {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.party-steps::before {
  position: absolute;
  top: 50%;
  right: 6%;
  left: 6%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--amber), transparent);
  opacity: 0.5;
  content: "";
}

.party-step {
  display: grid;
  gap: 0.25rem;
  min-height: 5.8rem;
  padding: 0.75rem 0.65rem;
  color: #8d8878;
  opacity: 0.42;
  animation: party-step 10s linear infinite;
}

.party-step:nth-child(2) { animation-delay: 1.2s; }
.party-step:nth-child(3) { animation-delay: 2.4s; }
.party-step:nth-child(4) { animation-delay: 3.6s; }
.party-step:nth-child(5) { animation-delay: 4.8s; }

.party-step span {
  color: var(--paper);
  font-size: 0.86rem;
  letter-spacing: -0.03em;
}

.party-step em {
  align-self: end;
  color: #8d8878;
  font-style: normal;
}

.party-room {
  min-height: 18rem;
  overflow: hidden;
  background:
    linear-gradient(#2c2b25 1px, transparent 1px),
    linear-gradient(90deg, #2c2b25 1px, transparent 1px),
    #0c0b09;
  background-size: 3rem 3rem;
}

.party-room::before,
.party-room::after {
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--amber) 34%, #2c2b25);
  content: "";
}

.party-room::before {
  inset: 3.1rem 1.2rem 4.4rem;
}

.party-room::after {
  top: 4.4rem;
  left: 50%;
  width: 8rem;
  height: 8rem;
  border-radius: 50%;
  transform: translateX(-50%);
  opacity: 0.26;
}

.party-badge {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 2;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--amber);
  background: color-mix(in srgb, var(--amber) 12%, #10100d);
  animation: party-ready 10s linear infinite;
}

.party-avatar {
  position: absolute;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 50%;
  background: var(--amber);
  color: var(--ink);
  font-family: var(--mono);
  font-size: 0.72rem;
  font-weight: 700;
  box-shadow: 0 0 16px color-mix(in srgb, var(--amber) 48%, transparent);
}

.party-avatar-you {
  bottom: 3rem;
  left: 18%;
  animation: party-seat-you 10s linear infinite;
}

.party-avatar-maya {
  top: 39%;
  left: 48%;
  animation: party-seat-maya 10s linear infinite;
}

.party-avatar-leo {
  right: 16%;
  bottom: 4.5rem;
  animation: party-seat-leo 10s linear infinite;
}

.party-chat {
  position: absolute;
  z-index: 2;
  max-width: 11rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid #2c2b25;
  background: color-mix(in srgb, var(--amber) 8%, #10100d);
  color: #d8d0c0;
  font-size: 0.72rem;
  line-height: 1.35;
  opacity: 0;
  animation: party-chat 10s linear infinite;
}

.party-chat b {
  margin-right: 0.4rem;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.58rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.party-chat-a {
  top: 3.5rem;
  left: 1.3rem;
}

.party-chat-b {
  right: 1.3rem;
  bottom: 6.2rem;
  animation-delay: 1.5s;
}

.party-link {
  position: absolute;
  right: 1.2rem;
  bottom: 1.1rem;
  left: 1.2rem;
  z-index: 2;
  padding: 0.7rem 0.85rem;
  border: 1px solid color-mix(in srgb, var(--amber) 45%, #2c2b25);
  background: #10100d;
  color: var(--amber-bright);
  animation: party-link 10s linear infinite;
}

@keyframes party-type {
  0%, 8% { width: 0; }
  28%, 100% { width: 100%; }
}

@keyframes party-step {
  0%, 14% { opacity: 0.38; }
  20%, 45% {
    border-color: color-mix(in srgb, var(--amber) 55%, #2c2b25);
    background: color-mix(in srgb, var(--amber) 10%, #10100d);
    opacity: 1;
  }
  58%, 100% { opacity: 0.55; }
}

@keyframes party-seat-you {
  0%, 18% { opacity: 0; transform: translate(-5rem, 3rem); }
  28%, 100% { opacity: 1; transform: translate(0, 0); }
}

@keyframes party-seat-maya {
  0%, 32% { opacity: 0; transform: translate(0, -4rem); }
  44%, 100% { opacity: 1; transform: translate(0, 0); }
}

@keyframes party-seat-leo {
  0%, 46% { opacity: 0; transform: translate(5rem, 2rem); }
  58%, 100% { opacity: 1; transform: translate(0, 0); }
}

@keyframes party-chat {
  0%, 48% { opacity: 0; transform: translateY(0.6rem); }
  58%, 100% { opacity: 1; transform: translateY(0); }
}

@keyframes party-ready {
  0%, 64% { opacity: 0.34; }
  74%, 100% {
    opacity: 1;
    box-shadow: 0 0 22px color-mix(in srgb, var(--amber) 28%, transparent);
  }
}

@keyframes party-link {
  0%, 54% { opacity: 0.34; }
  64%, 100% { opacity: 1; }
}

.workflow-row .editorial-card {
  padding: 1.05rem 1.15rem;
}

.workflow-row .editorial-card .card-index {
  margin: 0 0 0.55rem;
  font-size: 0.58rem;
}

.workflow-row .editorial-card h3 {
  font-size: clamp(1.15rem, 1.55vw, 1.5rem);
}

.workflow-row .editorial-card > p:not(.card-index) {
  max-width: 28rem;
  margin: 0.45rem 0 0;
  font-size: 0.82rem;
  line-height: 1.45;
}

.feature-row-flip .feature-copy {
  order: 2;
  text-align: right;
}

.feature-row-flip:not(.workflow-row) .feature-copy {
  container-type: inline-size;
}

.feature-row-flip .feature-copy h3.play-title {
  width: max-content;
  max-width: 100%;
  margin-right: 0;
  margin-left: auto;
  font-size: min(var(--section-title-size), 12.2cqi);
  text-align: right;
  white-space: nowrap;
}

.feature-row-flip .feature-stage,
.feature-row-flip .editorial-stack {
  order: 1;
}

.feature-row-flip .feature-copy h2,
.feature-row-flip .feature-copy h3,
.feature-row-flip .feature-copy > p:not(.card-index),
.feature-row-flip .feature-copy .feature-list {
  margin-left: auto;
  margin-right: 0;
}

.workflow-row {
  grid-template-columns: 1fr;
  justify-items: center;
  min-height: 0;
  gap: clamp(2rem, 5vw, 3.5rem);
  text-align: center;
}

.workflow-row .feature-copy {
  order: 0;
  max-width: 46rem;
  container-type: normal;
  text-align: center;
}

.workflow-row .editorial-stack {
  order: 0;
  width: 100%;
}

.workflow-row .feature-copy h2,
.workflow-row .feature-copy > p:not(.card-index) {
  margin-right: auto;
  margin-left: auto;
}

.feature-copy .card-index {
  margin-bottom: 1.4rem;
}

.feature-copy .feature-list {
  max-width: 28rem;
  font-size: 0.95rem;
}

.feature-stage {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: min(22rem, 52vh);
  overflow: hidden;
  border: 0;
  background: #0c0b09;
}

.scene-pipeline {
  padding: 1.15rem 1.2rem 1.2rem;
  gap: 0.75rem;
}

.feature-stage.scene-phone,
.feature-stage.scene-board {
  place-items: center;
  min-height: 0;
  padding: 0.5rem 0;
  overflow: visible;
  background: transparent;
}

.dist-montage {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 1.15rem;
  background: #0c0b09;
  box-shadow:
    0 0 0 1px #2c2a26,
    0 22px 48px rgba(0, 0, 0, 0.38);
}

.share-phone {
  width: min(18.75rem, 100%);
  aspect-ratio: 9 / 18.6;
  padding: 0.62rem;
  border-radius: 2.55rem;
  background: #f7f4ee;
  box-shadow:
    0 0 0 1px #2c2a26,
    0 22px 48px rgba(0, 0, 0, 0.38);
}

.share-phone-small {
  width: min(12rem, 100%);
  padding: 0.5rem;
  border-radius: 2.15rem;
}

.share-phone-screen {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 2.05rem;
  background: #f3f1ec;
  color: #1c1a16;
}

.share-phone-notch {
  position: absolute;
  top: 0.55rem;
  left: 50%;
  z-index: 2;
  width: 5.4rem;
  height: 1.15rem;
  border-radius: 1rem;
  background: #16140f;
  transform: translateX(-50%);
}

.share-phone-status,
.share-phone-header,
.share-phone-name,
.share-phone-bubble,
.share-phone-card-copy strong,
.share-phone-card-copy span,
.share-phone-time {
  overflow-wrap: anywhere;
}

.share-phone-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 1.05rem 0.2rem;
  color: #1c1a16;
  font-size: 0.72rem;
  font-weight: 650;
}

.share-phone-status-icons {
  display: inline-flex;
  gap: 0.18rem;
  align-items: flex-end;
  height: 0.7rem;
}

.share-phone-status-icons i,
.share-phone-status-icons b {
  display: block;
  width: 0.18rem;
  border-radius: 1px;
  background: #1c1a16;
}

.share-phone-status-icons i:nth-child(1) { height: 0.28rem; }
.share-phone-status-icons i:nth-child(2) { height: 0.42rem; }
.share-phone-status-icons i:nth-child(3) { height: 0.58rem; }

.share-phone-status-icons b {
  width: 0.85rem;
  height: 0.48rem;
  margin-left: 0.2rem;
  border: 1px solid #1c1a16;
  border-radius: 0.15rem;
  background: linear-gradient(90deg, #1c1a16 70%, transparent 70%);
}

.share-phone-header {
  display: flex;
  gap: 0.45rem;
  align-items: center;
  padding: 0.35rem 0.85rem 0.7rem;
  border-bottom: 1px solid rgba(28, 26, 22, 0.08);
}

.share-phone-back {
  color: #8a5a12;
  font-size: 1.35rem;
  line-height: 1;
}

.share-phone-avatar {
  display: grid;
  width: 1.7rem;
  height: 1.7rem;
  place-items: center;
  border-radius: 50%;
  background: #1f8a72;
  color: #f7f4ee;
  font-size: 0.72rem;
  font-weight: 700;
}

.share-phone-name {
  font-size: 0.92rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.share-phone-thread {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.65rem;
  justify-content: flex-end;
  min-height: 0;
  padding: 0.85rem 0.7rem 0.7rem;
}

.share-phone-small .share-phone-status,
.share-phone-small .share-phone-header {
  position: relative;
  z-index: 1;
  flex: none;
  background: #f3f1ec;
}

.share-phone-small .share-phone-status {
  padding: 0.55rem 0.7rem 0.05rem;
  font-size: 0.64rem;
}

.share-phone-small .share-phone-notch {
  top: 0.4rem;
  width: 4.2rem;
  height: 0.95rem;
}

.share-phone-small .share-phone-header {
  gap: 0.35rem;
  padding: 0.15rem 0.6rem 0.4rem;
}

.share-phone-small .share-phone-avatar {
  width: 1.35rem;
  height: 1.35rem;
  font-size: 0.62rem;
}

.share-phone-small .share-phone-name {
  font-size: 0.78rem;
}

.share-phone-small .share-phone-thread {
  gap: 0;
  overflow: hidden;
  padding: 0.35rem 0.45rem 0.2rem;
}

.share-phone-row {
  display: flex;
}

.share-phone-row.sent { justify-content: flex-end; }
.share-phone-row.received { justify-content: flex-start; }

.share-phone-small .share-phone-bubble {
  padding: 0.32rem 0.48rem 0.28rem;
  font-size: 0.68rem;
  line-height: 1.25;
}

.share-phone-small .share-phone-card {
  grid-template-columns: 1.85rem minmax(0, 1fr);
  gap: 0.32rem;
  margin-top: 0.28rem;
  padding: 0.28rem;
}

.share-phone-small .share-phone-thumb {
  height: 1.85rem;
}

.share-phone-small .share-phone-card-copy strong {
  overflow-wrap: normal;
  font-size: 0.62rem;
  word-break: keep-all;
  white-space: nowrap;
}

.share-phone-small .share-phone-card-copy span {
  font-size: 0.56rem;
  line-height: 1.25;
}

.share-phone-small .share-phone-composer {
  margin: 0 0.4rem 0.4rem;
  padding: 0.26rem 0.4rem 0.26rem 0.32rem;
}

.share-phone-small .share-phone-plus {
  width: 1.2rem;
  height: 1.2rem;
  font-size: 0.85rem;
}

.share-phone-small .share-phone-field {
  font-size: 0.66rem;
}

.chat-line {
  flex: none;
  max-height: 0;
  margin: 0;
  opacity: 0;
  overflow: hidden;
}

.chat-1 { animation: chat-1 8s linear infinite; }
.chat-2 { animation: chat-2 8s linear infinite; }
.chat-3 { animation: chat-3 8s linear infinite; }
.chat-4 { animation: chat-4 8s linear infinite; }
.chat-5 { animation: chat-5 8s linear infinite; }

@keyframes chat-1 {
  0% { max-height: 0; opacity: 0; margin-bottom: 0; }
  6%, 86% { max-height: 4rem; opacity: 1; margin-bottom: 0.28rem; }
  94%, 100% { max-height: 0; opacity: 0; margin-bottom: 0; }
}

@keyframes chat-2 {
  0%, 14% { max-height: 0; opacity: 0; margin-bottom: 0; }
  22%, 86% { max-height: 4rem; opacity: 1; margin-bottom: 0.28rem; }
  94%, 100% { max-height: 0; opacity: 0; margin-bottom: 0; }
}

@keyframes chat-3 {
  0%, 28% { max-height: 0; opacity: 0; margin-bottom: 0; }
  36%, 86% { max-height: 4.5rem; opacity: 1; margin-bottom: 0.28rem; }
  94%, 100% { max-height: 0; opacity: 0; margin-bottom: 0; }
}

@keyframes chat-4 {
  0%, 44% { max-height: 0; opacity: 0; margin-bottom: 0; }
  54%, 86% { max-height: 8rem; opacity: 1; margin-bottom: 0.28rem; }
  94%, 100% { max-height: 0; opacity: 0; margin-bottom: 0; }
}

@keyframes chat-5 {
  0%, 62% { max-height: 0; opacity: 0; margin-bottom: 0; }
  70%, 86% { max-height: 4rem; opacity: 1; margin-bottom: 0.28rem; }
  94%, 100% { max-height: 0; opacity: 0; margin-bottom: 0; }
}

.room-stage {
  position: relative;
  flex: 1;
  min-height: 0;
}

.room-gate,
.room-list,
.room-lobby {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.55rem 0.65rem 0.75rem;
}

.room-gate { animation: room-gate-show 9s linear infinite; }
.room-list { animation: room-list-show 9s linear infinite; }
.room-lobby { animation: room-lobby-show 9s linear infinite; }

.room-list-head {
  color: #1c1a16;
  font-size: 0.95rem;
  font-weight: 650;
  letter-spacing: -0.03em;
}

.room-row,
.room-seat {
  display: grid;
  grid-template-columns: 1.45rem minmax(0, 1fr) auto;
  gap: 0.45rem;
  align-items: center;
  min-height: 2.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: 0.75rem;
  background: #fff;
  color: #1c1a16;
}

.room-row i,
.room-seat i {
  display: grid;
  width: 1.45rem;
  height: 1.45rem;
  place-items: center;
  border-radius: 50%;
  background: #1c1a16;
  color: #f7f4ee;
  font-style: normal;
  font-size: 0.68rem;
  font-weight: 700;
}

.room-row span,
.room-seat span {
  min-width: 0;
}

.room-row strong,
.room-row em,
.room-seat span {
  display: block;
}

.room-row strong {
  font-size: 0.78rem;
  letter-spacing: -0.02em;
}

.room-row em,
.room-seat b {
  color: #6d675e;
  font-style: normal;
  font-size: 0.64rem;
  font-weight: 650;
}

.room-row.is-full {
  opacity: 0.45;
}

.room-action {
  display: grid;
  min-height: 2.6rem;
  place-items: center;
  border-radius: 0.75rem;
  background: #fff;
  color: #1c1a16;
  font-size: 0.84rem;
  font-weight: 650;
  white-space: nowrap;
}

.room-action-join { animation: room-join-pick 9s linear infinite; }

.room-row-pick {
  animation: room-pick 9s linear infinite;
}

.room-note,
.room-lobby-chat {
  margin: auto 0 0;
  color: #5c564e;
  font-size: 0.72rem;
}

.room-lobby-chat b {
  color: #1c1a16;
}

.seat-maya i { background: #1f8a72; }
.seat-leo i { background: #c47a12; }

.seat-maya { animation: seat-maya-in 9s linear infinite; }
.seat-leo,
.room-lobby-chat { animation: seat-leo-in 9s linear infinite; }

.room-pair {
  --pair-u: calc(100cqi / 38);
  position: relative;
  width: 100%;
  aspect-ratio: 38 / 32;
  container-type: inline-size;
  color: #1c1a16;
  font-size: var(--pair-u);
}

.pair-phone,
.pair-laptop,
.pair-lid,
.pair-browser,
.pair-chrome,
.pair-screen,
.pair-pane,
.pair-base { box-sizing: border-box; }

.pair-phone {
  position: absolute;
  top: 0;
  left: 0;
  width: calc(15 * var(--pair-u));
  height: calc(31 * var(--pair-u));
  padding: calc(0.5 * var(--pair-u));
  border-radius: calc(2.15 * var(--pair-u));
  background: #f7f4ee;
  box-shadow: 0 0 0 1px #2c2a26, 0 calc(22 * var(--pair-u)) calc(48 * var(--pair-u)) rgba(0, 0, 0, 0.38);
}

.pair-phone-screen {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-radius: calc(1.7 * var(--pair-u));
  background: #f3f1ec;
  color: #1c1a16;
}

.pair-notch {
  position: absolute;
  top: calc(0.55 * var(--pair-u));
  left: 50%;
  z-index: 2;
  width: calc(5.4 * var(--pair-u));
  height: calc(1.15 * var(--pair-u));
  border-radius: var(--pair-u);
  background: #16140f;
  transform: translateX(-50%);
}

.pair-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(0.7 * var(--pair-u)) calc(1.05 * var(--pair-u)) calc(0.2 * var(--pair-u));
  font-size: calc(0.72 * var(--pair-u));
  font-weight: 650;
}

.pair-status b {
  width: calc(0.85 * var(--pair-u));
  height: calc(0.48 * var(--pair-u));
  border: 1px solid #1c1a16;
  border-radius: calc(0.15 * var(--pair-u));
  background: linear-gradient(90deg, #1c1a16 70%, transparent 70%);
}

.pair-app,
.pair-pane {
  display: flex;
  flex-direction: column;
}

.pair-app {
  flex: 1;
  gap: calc(0.45 * var(--pair-u));
  padding: calc(0.55 * var(--pair-u)) calc(0.65 * var(--pair-u)) calc(0.85 * var(--pair-u));
}

.room-pair h2 {
  margin: 0;
  color: #1c1a16;
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.pair-app h2 { font-size: calc(0.95 * var(--pair-u)); }

.pair-row {
  display: grid;
  grid-template-columns: calc(1.45 * var(--pair-u)) minmax(0, 1fr);
  gap: calc(0.45 * var(--pair-u));
  align-items: center;
  min-height: calc(2.5 * var(--pair-u));
  padding: calc(0.35 * var(--pair-u)) calc(0.5 * var(--pair-u));
  border-radius: calc(0.75 * var(--pair-u));
  background: #fff;
}

.pair-row i,
.pair-seat i,
.pair-players b {
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #1c1a16;
  color: #f7f4ee;
  font-style: normal;
  font-weight: 700;
}

.pair-row i {
  width: calc(1.45 * var(--pair-u));
  height: calc(1.45 * var(--pair-u));
  font-size: calc(0.68 * var(--pair-u));
}

.pair-row strong,
.pair-row em { display: block; }
.pair-row strong { font-size: calc(0.78 * var(--pair-u)); letter-spacing: -0.02em; }
.pair-row em { color: #6d675e; font-style: normal; font-size: calc(0.64 * var(--pair-u)); font-weight: 650; }
.pair-phone .is-pick { box-shadow: inset 0 0 0 2px #c47a12; background: #fff8ee; }
.pair-row.is-full { opacity: 0.45; }

.pair-note {
  margin: auto 0 0;
  color: #5c564e;
  font-size: calc(0.72 * var(--pair-u));
}

.pair-laptop {
  position: absolute;
  z-index: 2;
  top: calc(9.25 * var(--pair-u));
  left: calc(13.25 * var(--pair-u));
  width: calc(23.5 * var(--pair-u));
}

.pair-lid {
  padding: calc(0.55 * var(--pair-u)) calc(0.55 * var(--pair-u)) calc(0.62 * var(--pair-u));
  border-radius: calc(0.9 * var(--pair-u)) calc(0.9 * var(--pair-u)) calc(0.28 * var(--pair-u)) calc(0.28 * var(--pair-u));
  background: #e4dfd6;
  box-shadow: 0 0 0 1px #8d877c, 0 calc(18 * var(--pair-u)) calc(36 * var(--pair-u)) rgba(0, 0, 0, 0.35);
}

.pair-browser {
  display: flex;
  flex-direction: column;
  height: calc(16.5 * var(--pair-u));
  overflow: hidden;
  border-radius: calc(0.45 * var(--pair-u));
  background: #f3f1ec;
  color: #1c1a16;
}

.pair-chrome {
  display: grid;
  flex: none;
  grid-template-columns: auto minmax(0, 1fr);
  gap: calc(0.55 * var(--pair-u));
  align-items: center;
  padding: calc(0.42 * var(--pair-u)) calc(0.55 * var(--pair-u));
  background: #ece7df;
}

.pair-lights { display: flex; gap: calc(0.28 * var(--pair-u)); }
.pair-lights i { width: calc(0.48 * var(--pair-u)); height: calc(0.48 * var(--pair-u)); border-radius: 50%; }
.pair-lights i:nth-child(1) { background: #e15b4a; }
.pair-lights i:nth-child(2) { background: #e2b23a; }
.pair-lights i:nth-child(3) { background: #59b36a; }

.pair-url {
  overflow: hidden;
  padding: calc(0.22 * var(--pair-u)) calc(0.55 * var(--pair-u));
  border-radius: 999px;
  background: #fff;
  color: #5c564e;
  font-size: calc(0.68 * var(--pair-u));
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pair-screen { position: relative; flex: 1; min-height: 0; }

.pair-pane {
  position: absolute;
  inset: 0;
  gap: calc(0.38 * var(--pair-u));
  padding: calc(0.55 * var(--pair-u)) calc(0.6 * var(--pair-u)) calc(0.62 * var(--pair-u));
}

.pair-pane h2 { font-size: calc(0.92 * var(--pair-u)); }

.pair-action,
.pair-seat {
  display: grid;
  align-items: center;
  border-radius: calc(0.65 * var(--pair-u));
  background: #fff;
  color: #1c1a16;
}

.pair-action {
  min-height: calc(2.15 * var(--pair-u));
  place-items: center;
  font-size: calc(0.82 * var(--pair-u));
  font-weight: 650;
}

.pair-seat {
  grid-template-columns: calc(1.35 * var(--pair-u)) minmax(0, 1fr) auto;
  gap: calc(0.4 * var(--pair-u));
  min-height: calc(2.05 * var(--pair-u));
  padding: calc(0.28 * var(--pair-u)) calc(0.45 * var(--pair-u));
  font-size: calc(0.78 * var(--pair-u));
  font-weight: 650;
}

.pair-seat i {
  width: calc(1.35 * var(--pair-u));
  height: calc(1.35 * var(--pair-u));
  font-size: calc(0.62 * var(--pair-u));
}

.pair-seat em { color: #6d675e; font-style: normal; font-size: calc(0.64 * var(--pair-u)); font-weight: 650; }
.pair-seat.is-maya i,
.pair-players .is-maya b { background: #1f8a72; }
.pair-seat.pair-leo i,
.pair-players .is-leo b { background: #c47a12; }

.pair-gate { animation: pair-show-gate 12s linear infinite; }
.pair-rooms { animation: pair-show-rooms 12s linear infinite; }
.pair-lobby { animation: pair-show-lobby 12s linear infinite; }
.pair-play { animation: pair-show-play 12s linear infinite; }
.pair-join { animation: pair-pick-join 12s linear infinite; }
.pair-row-pick { animation: pair-pick-room 12s linear infinite; }
.pair-leo { animation: pair-leo-in 12s linear infinite; }

.pair-board {
  display: grid;
  flex: 1;
  min-height: 0;
  grid-template-columns: calc(1.05 * var(--pair-u)) repeat(10, 1fr);
  grid-template-rows: calc(0.8 * var(--pair-u)) repeat(10, 1fr);
  padding: calc(0.28 * var(--pair-u));
  border-radius: calc(0.45 * var(--pair-u));
  background: #d5e3ea;
  gap: calc(0.125 * var(--pair-u));
}

.pair-blank,
.pair-axis,
.pair-cell { min-width: 0; min-height: 0; }
.pair-axis {
  display: grid;
  place-items: center;
  color: #5c6b73;
  font-size: calc(0.48 * var(--pair-u));
  font-weight: 700;
}
.pair-cell { border-radius: calc(0.125 * var(--pair-u)); background: #f4f8fa; }
.pair-ship { z-index: 1; border-radius: 999px; background: #241f1a; }
.pair-ship-h { grid-column: 6 / 10; grid-row: 7; height: 58%; align-self: center; }
.pair-ship-v { grid-column: 10; grid-row: 3 / 6; width: 58%; justify-self: center; }
.pair-peg { z-index: 2; width: 62%; aspect-ratio: 1; place-self: center; border-radius: 50%; }
.pair-hit { grid-column: 7; grid-row: 7; background: #f0a72e; box-shadow: 0 0 0 2px #241f1a; }
.pair-splash { grid-column: 2; grid-row: 8; border: 2px solid #3d7ea6; background: radial-gradient(circle, #f7fbff 0 28%, transparent 30%); }
.pair-shot { grid-column: 4; grid-row: 5; border: 2px solid #c47a12; background: rgba(240, 167, 46, 0.4); }

.pair-players {
  display: flex;
  gap: calc(0.55 * var(--pair-u));
  align-items: center;
  flex: none;
  margin-top: calc(0.45 * var(--pair-u));
  color: #1c1a16;
  font-size: calc(0.68 * var(--pair-u));
  font-weight: 650;
}
.pair-players span { display: inline-flex; gap: calc(0.28 * var(--pair-u)); align-items: center; }
.pair-players b {
  width: calc(1.05 * var(--pair-u));
  height: calc(1.05 * var(--pair-u));
  font-size: calc(0.55 * var(--pair-u));
}
.pair-joined {
  margin-left: auto;
  padding: calc(0.16 * var(--pair-u)) calc(0.45 * var(--pair-u));
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(28, 26, 22, 0.08);
}

.pair-base {
  position: relative;
  height: calc(0.95 * var(--pair-u));
  margin: 0 calc(-1.35 * var(--pair-u));
  border-radius: 0 0 calc(0.85 * var(--pair-u)) calc(0.85 * var(--pair-u));
  background: #5e5952;
  box-shadow: 0 calc(14 * var(--pair-u)) calc(22 * var(--pair-u)) rgba(0, 0, 0, 0.28);
}

.pair-base span {
  position: absolute;
  top: calc(0.28 * var(--pair-u));
  left: 50%;
  width: calc(3.2 * var(--pair-u));
  height: calc(0.34 * var(--pair-u));
  border-radius: 999px;
  background: #3a3834;
  transform: translateX(-50%);
}

@keyframes pair-show-gate {
  0%, 20% { opacity: 1; visibility: visible; }
  28%, 96% { opacity: 0; visibility: hidden; }
  100% { opacity: 1; visibility: visible; }
}
@keyframes pair-show-rooms {
  0%, 22% { opacity: 0; visibility: hidden; }
  30%, 46% { opacity: 1; visibility: visible; }
  54%, 100% { opacity: 0; visibility: hidden; }
}
@keyframes pair-show-lobby {
  0%, 48% { opacity: 0; visibility: hidden; }
  56%, 72% { opacity: 1; visibility: visible; }
  80%, 100% { opacity: 0; visibility: hidden; }
}
@keyframes pair-show-play {
  0%, 74% { opacity: 0; visibility: hidden; }
  82%, 96% { opacity: 1; visibility: visible; }
  100% { opacity: 0; visibility: hidden; }
}
@keyframes pair-pick-join {
  0%, 8% { box-shadow: none; background: #fff; }
  14%, 22% { box-shadow: inset 0 0 0 2px #c47a12; background: #fff8ee; }
  28%, 100% { box-shadow: none; background: #fff; }
}
@keyframes pair-pick-room {
  0%, 30% { box-shadow: none; background: #fff; }
  36%, 48% { box-shadow: inset 0 0 0 2px #c47a12; background: #fff8ee; }
  54%, 100% { box-shadow: none; background: #fff; }
}
@keyframes pair-leo-in {
  0%, 58% { opacity: 0; transform: translateY(calc(0.3 * var(--pair-u))); }
  66%, 72% { opacity: 1; transform: none; }
  80%, 100% { opacity: 0; }
}

@keyframes room-gate-show {
  0%, 22% { opacity: 1; visibility: visible; }
  30%, 94% { opacity: 0; visibility: hidden; }
  100% { opacity: 1; visibility: visible; }
}

@keyframes room-list-show {
  0%, 26% { opacity: 0; visibility: hidden; }
  34%, 50% { opacity: 1; visibility: visible; }
  58%, 100% { opacity: 0; visibility: hidden; }
}

@keyframes room-lobby-show {
  0%, 54% { opacity: 0; visibility: hidden; }
  62%, 90% { opacity: 1; visibility: visible; }
  98%, 100% { opacity: 0; visibility: hidden; }
}

@keyframes room-join-pick {
  0%, 10% { box-shadow: none; background: #fff; }
  16%, 24% { box-shadow: inset 0 0 0 2px #c47a12; background: #fff8ee; }
  30%, 100% { box-shadow: none; background: #fff; }
}

@keyframes room-pick {
  0%, 34% { box-shadow: none; background: #fff; }
  40%, 52% { box-shadow: inset 0 0 0 2px #c47a12; background: #fff8ee; }
  58%, 100% { box-shadow: none; background: #fff; }
}

@keyframes seat-maya-in {
  0%, 66% { opacity: 0; transform: translateY(0.35rem); }
  74%, 90% { opacity: 1; transform: none; }
  98%, 100% { opacity: 0; }
}

@keyframes seat-leo-in {
  0%, 76% { opacity: 0; transform: translateY(0.35rem); }
  84%, 90% { opacity: 1; transform: none; }
  98%, 100% { opacity: 0; }
}


.share-phone-bubble {
  max-width: 94%;
  padding: 0.6rem 0.72rem 0.5rem;
  border-radius: 1.05rem;
  font-size: 0.92rem;
  line-height: 1.35;
}

.share-phone-bubble p {
  margin: 0;
}

.share-phone-bubble.sent {
  border-bottom-right-radius: 0.35rem;
  background: #efeae2;
  color: #1c1a16;
}

.share-phone-bubble.received {
  border-bottom-left-radius: 0.35rem;
  background: #1c1a16;
  color: #f7f4ee;
}

.share-phone-card {
  display: grid;
  grid-template-columns: 2.35rem minmax(0, 1fr);
  gap: 0.45rem;
  align-items: center;
  margin-top: 0.45rem;
  padding: 0.4rem;
  border-radius: 0.7rem;
  background: #fff;
}

.share-phone-thumb {
  height: 2.35rem;
  border-radius: 0.4rem;
  background:
    linear-gradient(160deg, transparent 42%, rgba(240, 167, 46, 0.85) 43% 57%, transparent 58%),
    linear-gradient(135deg, #16384a, #0c1c26);
}

.share-phone-card-copy {
  min-width: 0;
}

.share-phone-card-copy strong,
.share-phone-card-copy span {
  display: block;
}

.share-phone-card-copy strong {
  font-size: 0.84rem;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.share-phone-card-copy span {
  margin-top: 0.16rem;
  overflow-wrap: normal;
  color: #5c564e;
  font-size: 0.74rem;
  line-height: 1.3;
  word-break: keep-all;
  hyphens: none;
}

.share-phone-composer {
  display: flex;
  gap: 0.45rem;
  align-items: center;
  margin: 0 0.55rem 0.6rem;
  padding: 0.38rem 0.45rem 0.38rem 0.4rem;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(28, 26, 22, 0.08);
}

.share-phone-plus {
  display: grid;
  width: 1.45rem;
  height: 1.45rem;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: #eceae4;
  color: #1c1a16;
  font-size: 1rem;
  line-height: 1;
}

.share-phone-field {
  min-width: 0;
  color: #8a847a;
  font-size: 0.78rem;
  line-height: 1.2;
}

.share-phone-time {
  display: block;
  margin-top: 0.28rem;
  color: #8a847a;
  font-size: 0.62rem;
  text-align: right;
}

.pipe-bar,
.pipe-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.pipe-bar em {
  color: #8d8878;
  font-style: normal;
}

.pipe-steps {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pipe-step {
  display: grid;
  grid-template-columns: 2rem 1fr auto;
  gap: 0.75rem;
  align-items: center;
  min-height: 3.4rem;
  padding: 0 0.9rem;
  border: 1px solid #2c2b25;
  background: #10100d;
  color: #8d8878;
  opacity: 0.42;
}

.pipe-step b {
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
}

.pipe-step span {
  color: var(--paper);
  font-size: 0.92rem;
  letter-spacing: -0.03em;
}

.pipe-step code {
  color: #8d8878;
  font-family: var(--mono);
  font-size: 0.62rem;
}

.pipe-status {
  margin-top: auto;
  padding-top: 0.35rem;
  border-top: 1px solid #2c2b25;
  color: #8d8878;
}

.pipe-step-1 { animation: pipe-lit 8s linear infinite; }
.pipe-step-2 { animation: pipe-lit 8s linear infinite 2s; }
.pipe-step-3 { animation: pipe-lit 8s linear infinite 4s; }
.pipe-step-4 { animation: pipe-lit 8s linear infinite 6s; }

.play-board {
  width: min(26rem, 100%);
  padding: 1rem 1rem 0.9rem;
  border-radius: 1.15rem;
  background: #f7f4ee;
  color: #1c1a16;
  box-shadow:
    0 0 0 1px #2c2a26,
    0 22px 48px rgba(0, 0, 0, 0.38);
}

.play-board-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.play-board-head strong {
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.03em;
}

.play-board-head span {
  color: #6d675e;
  font-family: var(--mono);
  font-size: 0.72rem;
}

.play-grid {
  display: grid;
  grid-template-columns: 1.35rem repeat(10, minmax(0, 1fr));
  grid-template-rows: 1.05rem repeat(10, minmax(0, 1fr));
  aspect-ratio: 1;
  padding: 0.35rem;
  border-radius: 0.7rem;
  background: #d5e3ea;
  gap: 2px;
}

.play-label,
.play-cell {
  min-width: 0;
  min-height: 0;
}

.play-label {
  display: grid;
  place-items: center;
  color: #5c6b73;
  font-family: var(--mono);
  font-size: 0.58rem;
  font-weight: 700;
}

.play-label.is-axis {
  color: #a86a10;
}

.play-cell {
  border-radius: 2px;
  background: #f4f8fa;
}

.play-ship,
.play-hit,
.play-splash,
.play-maya {
  z-index: 1;
  place-self: center;
}

.play-ship {
  border-radius: 999px;
  background: #241f1a;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 1px 2px rgba(0, 0, 0, 0.2);
}

.play-ship-h {
  grid-column: 6 / 10;
  grid-row: 7;
  width: calc(100% - 0.45rem);
  height: 52%;
}

.play-ship-v {
  grid-column: 10;
  grid-row: 3 / 6;
  width: 52%;
  height: calc(100% - 0.45rem);
}

.play-hit,
.play-splash,
.play-maya {
  position: relative;
  width: 62%;
  aspect-ratio: 1;
}

.play-hit {
  z-index: 2;
  grid-column: 7;
  grid-row: 7;
  border-radius: 50%;
  background: #f0a72e;
  box-shadow: 0 0 0 2px #241f1a;
  animation: peg-hit 9s linear infinite;
}

.play-hit::before,
.play-hit::after {
  position: absolute;
  background: #1c1a16;
  content: "";
}

.play-hit::before {
  top: 50%;
  left: 18%;
  width: 64%;
  height: 2px;
  transform: translateY(-50%) rotate(45deg);
}

.play-hit::after {
  top: 18%;
  left: 50%;
  width: 2px;
  height: 64%;
  transform: translateX(-50%) rotate(45deg);
}

.play-splash {
  z-index: 2;
  grid-column: 2;
  grid-row: 8;
  border: 2px solid #3d7ea6;
  border-radius: 50%;
  background:
    radial-gradient(circle, #f7fbff 0 28%, transparent 30%),
    radial-gradient(circle, transparent 0 46%, #7eb4d0 48% 62%, transparent 64%);
  animation: peg-splash 9s linear infinite;
}

.play-maya {
  z-index: 3;
  grid-column: 4;
  grid-row: 5;
  border: 2px solid #c47a12;
  border-radius: 50%;
  background: rgba(240, 167, 46, 0.35);
  animation: shot-land 9s linear infinite;
}

.play-maya::after {
  position: absolute;
  inset: -0.35rem;
  border: 2px solid rgba(196, 122, 18, 0.7);
  border-radius: 50%;
  animation: shot-ring 9s ease-out infinite;
  content: "";
}

.play-roster {
  display: flex;
  gap: 0.9rem;
  align-items: center;
  margin-top: 0.85rem;
  font-size: 0.84rem;
  font-weight: 650;
}

.play-roster span {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
}

.play-roster i {
  display: grid;
  width: 1.4rem;
  height: 1.4rem;
  place-items: center;
  border-radius: 50%;
  color: #f7f4ee;
  font-style: normal;
  font-size: 0.68rem;
}

.play-roster .is-you i { background: #1c1a16; }
.play-roster .is-maya i { background: #1f8a72; box-shadow: 0 0 0 2px #f0a72e; }
.play-roster .is-leo i { background: #c47a12; }

.play-call {
  margin: 0.45rem 0 0;
  color: #5c564e;
  font-size: 0.84rem;
}

.play-call b {
  color: #1c1a16;
  font-weight: 650;
}

@keyframes peg-splash {
  0%, 12% { opacity: 0; transform: scale(0.35); }
  22%, 82% { opacity: 1; transform: scale(1); }
  92%, 100% { opacity: 0; transform: scale(0.35); }
}

@keyframes peg-hit {
  0%, 36% { opacity: 0; transform: scale(0.35); }
  46%, 82% { opacity: 1; transform: scale(1); }
  92%, 100% { opacity: 0; transform: scale(0.35); }
}

@keyframes shot-land {
  0%, 58% { opacity: 0; transform: scale(0.4); }
  68% { opacity: 1; transform: scale(1.16); }
  76%, 82% { opacity: 1; transform: scale(1); }
  92%, 100% { opacity: 0; transform: scale(0.4); }
}

@keyframes shot-ring {
  0%, 60% { opacity: 0; transform: scale(0.6); }
  72% { opacity: 1; }
  86%, 100% { opacity: 0; transform: scale(1.4); }
}

@media (prefers-reduced-motion: reduce) {
  .chat-line,
  .room-gate,
  .room-list,
  .room-lobby,
  .room-row-pick,
  .room-action-join,
  .seat-maya,
  .seat-leo,
  .room-lobby-chat,
  .pair-gate,
  .pair-rooms,
  .pair-lobby,
  .pair-play,
  .pair-join,
  .pair-row-pick,
  .pair-leo,
  .play-splash,
  .play-hit,
  .play-maya,
  .play-maya::after,
  .mini-hit,
  .mini-splash,
  .chess-knight,
  .ball-one {
    animation: none;
  }

  .chat-line,
  .room-lobby,
  .seat-maya,
  .seat-leo,
  .room-lobby-chat,
  .play-splash,
  .play-hit,
  .play-maya,
  .mini-hit,
  .mini-splash,
  .chess-knight {
    max-height: 8rem;
    opacity: 1;
    visibility: visible;
    transform: none;
  }

  .room-gate,
  .room-list,
  .pair-gate,
  .pair-lobby,
  .pair-play {
    opacity: 0;
    visibility: hidden;
  }

  .pair-rooms {
    opacity: 1;
    visibility: visible;
  }

  .pair-row-pick {
    box-shadow: inset 0 0 0 2px #c47a12;
    background: #fff8ee;
  }

  .chat-line {
    margin-bottom: 0.28rem;
  }

  .play-maya::after {
    opacity: 0;
  }
}


@keyframes pipe-lit {
  0%, 18% {
    opacity: 1;
    border-color: color-mix(in srgb, var(--amber) 55%, #2c2b25);
    background: color-mix(in srgb, var(--amber) 10%, #10100d);
  }
  28%, 100% { opacity: 0.42; border-color: #2c2b25; background: #10100d; }
}

.final-section {
  background: var(--amber);
  color: var(--ink);
}

.final-layout {
  display: grid;
  grid-template-columns: minmax(0, 40rem);
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
  background: var(--ink);
  color: #fff;
}

.button.final-button:hover:not(:disabled) {
  border-color: #fff;
  background: #fff;
  color: var(--ink);
}

.free-plan,
.plan-card[data-featured="true"] {
  padding: 1.75rem;
  background: var(--ink);
  color: var(--paper);
}

.price {
  margin: 0.7rem 0 1rem;
  font-size: clamp(3rem, 5vw, 5rem);
  font-weight: 540;
  letter-spacing: -0.06em;
  line-height: 1;
}

.free-plan .feature-list,
.plan-card .feature-list {
  margin-bottom: 0;
  color: var(--muted);
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
}

.compare-table th,
.compare-table td {
  padding: 0.95rem 0;
  border-bottom: 1px solid var(--line);
  text-align: left;
  font-size: 0.86rem;
}

.compare-table th {
  color: var(--quiet);
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.compare-table td:not(:first-child),
.compare-table th:not(:first-child) {
  text-align: right;
}

.pricing-hero,
.pricing-plans,
.pricing-compare,
.pricing-custom {
  width: min(100% - var(--page-inset), var(--page-max));
  margin: 0 auto;
}

.pricing-hero {
  padding: clamp(4rem, 8vw, 6.5rem) 0 1.5rem;
  text-align: center;
}

.pricing-title {
  max-width: none;
  margin: 0;
  font-size: clamp(2.8rem, 6vw, 4.6rem);
  font-weight: 560;
  letter-spacing: -0.06em;
  line-height: 1;
}

.pricing-hero .lede {
  max-width: none;
  margin: 1rem auto 0;
}

@media (min-width: 64rem) {
  .pricing-hero .lede {
    white-space: nowrap;
  }
}

.pricing-plans,
.pricing-compare,
.pricing-custom {
  padding: clamp(1.5rem, 4vw, 3rem) 0;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 26rem));
  gap: 1rem;
  justify-content: center;
}

.billing-toggle {
  display: flex;
  justify-content: center;
  margin: 0 0 1.75rem;
}

.billing-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.billing-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 0.2rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--ink);
}

.billing-switch label {
  min-width: 6.5rem;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.78rem;
  text-align: center;
  cursor: pointer;
}

.pricing-plans-block:has(#billing-monthly:checked) label[for="billing-monthly"],
.pricing-plans-block:has(#billing-annual:checked) label[for="billing-annual"] {
  background: var(--paper);
  color: var(--ink);
}

.price-annual {
  display: none;
}

.pricing-plans-block:has(#billing-annual:checked) .price-monthly {
  display: none;
}

.pricing-plans-block:has(#billing-annual:checked) .price-annual {
  display: inline;
}

.pricing-period {
  margin: 0.45rem 0 0;
  color: var(--muted);
  font-size: 0.82rem;
}

.pricing-home {
  margin-bottom: clamp(4.5rem, 10vw, 8rem);
}

.pricing-home-title {
  margin: 0 0 1.5rem;
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 560;
  letter-spacing: -0.045em;
  text-align: center;
}

.pricing-card {
  display: flex;
  flex-direction: column;
  min-height: 28rem;
  padding: 1.6rem 1.5rem 1.4rem;
  border: 1px solid var(--line);
  border-radius: 1.25rem;
  background: var(--ink-raised);
}

.pricing-card-featured {
  border-color: color-mix(in srgb, var(--amber) 55%, var(--line));
  background: color-mix(in srgb, var(--amber) 8%, var(--ink-raised));
}

.pricing-card h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 620;
  letter-spacing: -0.03em;
}

.pricing-amount {
  margin: 1.1rem 0 0;
  font-size: clamp(2.6rem, 4vw, 3.4rem);
  font-weight: 560;
  letter-spacing: -0.06em;
  line-height: 1;
}

.pricing-note {
  margin: 0.85rem 0 0;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.5;
}

.pricing-features {
  display: grid;
  gap: 0.65rem;
  margin: 1.4rem 0 1.6rem;
  padding: 0;
  list-style: none;
  color: var(--paper);
  font-size: 0.86rem;
  line-height: 1.4;
}

.pricing-features li {
  display: grid;
  grid-template-columns: 1rem 1fr;
  gap: 0.55rem;
}

.pricing-features li::before {
  color: var(--amber);
  content: "✓";
}

.pricing-card .button {
  width: 100%;
  margin-top: auto;
  border-radius: 999px;
}

.pricing-compare {
  padding-top: clamp(2.5rem, 6vw, 4.5rem);
  text-align: center;
}

.pricing-compare h2 {
  margin: 0 0 2rem;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  font-weight: 560;
  letter-spacing: -0.04em;
}

.pricing-compare .compare-wrap {
  width: min(100%, calc(26rem * 2 + 1rem));
  margin: 0 auto;
  padding: 0;
  background: transparent;
}

.pricing-compare-table th,
.pricing-compare-table td {
  text-align: center;
}

.pricing-compare-table th:first-child,
.pricing-compare-table td:first-child {
  text-align: left;
}

.pricing-custom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: clamp(2rem, 5vw, 4rem);
  padding: 1.6rem 1.7rem;
  border: 1px solid var(--line);
  border-radius: 1.25rem;
  background: var(--ink-raised);
}

.pricing-custom h2 {
  margin: 0 0 0.55rem;
  font-size: 1.35rem;
  font-weight: 560;
  letter-spacing: -0.03em;
}

.pricing-custom p {
  max-width: 36rem;
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.pricing-custom .button {
  flex-shrink: 0;
  border-radius: 999px;
}

.legal-page {
  width: min(100% - var(--page-inset), 46rem);
  margin: 0 auto;
  padding: clamp(3rem, 7vw, 5.5rem) 0 6rem;
}

.legal-banner,
.placeholder-card {
  margin-bottom: 2rem;
  border: 1px solid var(--line-strong);
  background: var(--ink-raised);
  color: var(--amber-bright);
  font-size: 0.88rem;
  line-height: 1.55;
}

.legal-page h1 {
  max-width: 16ch;
  margin: 0 0 0.8rem;
  font-size: clamp(2.4rem, 5vw, 4.2rem);
  letter-spacing: -0.06em;
  line-height: 0.95;
}

.legal-page .lede {
  margin-top: 0;
}

.legal-article {
  margin-top: 2.4rem;
  padding-top: 1.6rem;
}

.legal-article h2 {
  margin: 0 0 0.8rem;
  font-size: 1.15rem;
  font-weight: 620;
  letter-spacing: -0.03em;
}

.legal-article p {
  margin: 0;
  color: var(--muted);
  line-height: 1.7;
}

.contact-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(18rem, 0.9fr);
  gap: 1px;
  border: 1px solid var(--line);
  background: var(--line);
}

.layer-stack {
  display: grid;
  gap: 1px;
  border: 1px solid var(--line);
  background: var(--line);
}

.marketing-footer {
  padding: clamp(3.5rem, 7vw, 6rem) 0 2rem;
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

  .marketing-menu {
    display: block;
  }

  .marketing-header {
    grid-template-columns: 1fr auto auto;
  }

  .marketing-hero,
  .agent-layout,
  .final-layout,
  .feature-row,
  .feature-row-flip,
  .page-hero-inner,
  .two-col,
  .contact-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .marketing-product {
    --section-title-size: clamp(1.85rem, 7.6vw, 3.15rem);
  }

  .agent-copy,
  .feature-copy,
  .feature-stage,
  .ide-stage,
  .editorial-stack,
  .display,
  .split-heading h2,
  .feature-copy h3,
  .agent-copy h2,
  .final-copy h2 {
    min-width: 0;
    max-width: 100%;
  }

  .feature-row,
  .feature-row-flip {
    min-height: 0;
  }

  .feature-row-flip .feature-copy,
  .feature-row-flip .feature-stage,
  .feature-row-flip .editorial-stack {
    order: unset;
  }

  .marketing-section-inner,
  .page-hero-inner,
  .feature-row .feature-copy,
  .feature-row-flip .feature-copy,
  .split-heading,
  .final-copy,
  .pricing-card,
  .pricing-custom,
  .pricing-custom-copy,
  .legal-page,
  .legal-article,
  .game-copy,
  .editorial-card,
  .capability-card,
  .layer-card,
  .plan-card,
  .page-aside,
  .contact-grid,
  .two-col,
  .footer-brand,
  .footer-column,
  .footer-base {
    text-align: center;
  }

  .feature-row .feature-copy h2,
  .feature-row .feature-copy h3,
  .feature-row-flip .feature-copy h2,
  .feature-row-flip .feature-copy h3,
  .feature-row .feature-copy > p:not(.card-index),
  .feature-row-flip .feature-copy > p:not(.card-index),
  .feature-row .feature-copy .feature-list,
  .feature-row-flip .feature-copy .feature-list,
  .feature-copy .card-link,
  .page-hero .display,
  .page-hero .lede,
  .final-copy h2,
  .final-copy > p,
  .final-actions,
  .split-heading h2,
  .split-heading .lede,
  .editorial-card h3,
  .editorial-card > p,
  .game-copy h3,
  .footer-brand p,
  .pricing-features {
    margin-right: auto;
    margin-left: auto;
  }

  .feature-row-flip .feature-copy h3.play-title {
    width: auto;
    margin-right: auto;
    margin-left: auto;
    text-align: center;
    white-space: normal;
  }

  .page-actions,
  .final-actions,
  .product-subnav {
    justify-content: center;
    justify-items: center;
  }

  .feature-stage,
  .editorial-stack,
  .room-pair,
  .party-flow,
  .party-command,
  .party-steps,
  .party-room,
  .dist-montage,
  .ide-stage,
  .share-editor {
    justify-self: stretch;
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .share-phone {
    justify-self: center;
  }

  .ide-stage {
    container-type: inline-size;
    height: auto;
    aspect-ratio: 40 / 32;
    overflow: hidden;
  }

  .share-editor {
    width: 40rem;
    max-width: none;
    min-height: 32rem;
    transform: scale(calc(100cqi / 40rem));
    transform-origin: top left;
  }

  .pricing-features {
    width: max-content;
    max-width: 100%;
  }

  .share-phone,
  .share-editor,
  .pair-phone,
  .pair-laptop,
  .party-flow,
  .ops-wall,
  .play-board,
  .dist-montage {
    text-align: left;
  }

  .agent-layout {
    min-height: 0;
  }

  .feature-stage {
    min-height: 0;
  }

  .marketing-hero {
    padding: clamp(2.5rem, 6vw, 4rem) 0 1.5rem;
  }

  .workflow-row .feature-copy {
    text-align: center;
  }

  .workflow-row .feature-copy h2,
  .workflow-row .feature-copy > p:not(.card-index) {
    margin-right: auto;
    margin-left: auto;
  }

  .game-stage,
  .marketing-hero .game-stage {
    min-height: 0;
  }

  .ops-wall {
    grid-template-columns: 1fr;
  }

  .ops-core {
    grid-template-columns: repeat(5, minmax(0, auto));
    justify-content: center;
  }

  .ops-core::before {
    top: 50%;
    right: 8%;
    bottom: auto;
    left: 8%;
    width: auto;
    height: 1px;
  }

  .ops-beam {
    width: 3rem;
    height: 0.5rem;
    background: linear-gradient(90deg, transparent, var(--amber), transparent);
  }

  .party-steps {
    grid-template-columns: 1fr;
  }

  .party-steps::before {
    top: 8%;
    right: auto;
    bottom: 8%;
    left: 1.2rem;
    width: 1px;
    height: auto;
    background: linear-gradient(transparent, var(--amber), transparent);
  }

  .footer-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .footer-brand {
    grid-column: 1 / -1;
  }
}

@media (max-width: 48rem) {
  .marketing-actions {
    gap: 0.4rem;
  }

  .marketing-actions .button {
    min-height: 2.15rem;
    padding: 0.45rem 0.55rem;
    font-size: 0.58rem;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .marketing-product {
    --hero-title-size: clamp(3.2rem, 15vw, 5.5rem);
    --page-inset: 2rem;
  }

  .hero-actions {
    width: 100%;
  }

  .game-stage {
    min-height: 22rem;
  }

  .ops-wall {
    min-height: auto;
  }

  .ops-mini-grid,
  .ops-player-rail {
    grid-template-columns: 1fr;
  }

  .ops-core {
    gap: 0.55rem;
  }

  .ops-node {
    width: 3.4rem;
    min-height: 3.4rem;
    font-size: 0.54rem;
  }

  .ops-node-loki {
    width: 4rem;
    min-height: 4rem;
  }

  .ops-beam {
    width: 1.5rem;
  }

  .party-room {
    min-height: 20rem;
  }

  .split-heading,
  .editorial-grid,
  .capability-grid,
  .sdk-grid,
  .plan-grid,
  .pricing-grid {
    grid-template-columns: 1fr;
  }

  .pricing-compare .compare-wrap {
    width: 100%;
  }

  .pricing-hero .lede {
    white-space: normal;
  .pricing-grid {
    grid-template-columns: 1fr;
  }

  .pricing-custom {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .split-heading {
    gap: 0.85rem;
    text-align: center;
  }

  .split-heading > .eyebrow,
  .split-heading > h2,
  .split-heading > div {
    grid-column: 1;
    justify-self: center;
  }

  .split-heading h2,
  .split-heading .lede {
    margin-right: auto;
    margin-left: auto;
  }

  .docs-panel-header,
  .docs-row,
  .release-row,
  .lobby-row {
    grid-template-columns: 1fr;
  }

  .footer-grid {
    grid-template-columns: 1fr 1fr;
  }

  .footer-base {
    flex-direction: column;

@media (max-width: 38rem) {
  .marketing-product {
    --header-height: 4.5rem;
  }
}
  }
}
  }
}
`;

function header(path: string): string {
  return `
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header marketing-header">
    <a class="brand" href="/" aria-label="Loki home">
      ${brandMarkHtml()}
      <span>LOKI</span>
    </a>
    <nav class="marketing-nav" aria-label="Primary navigation">
      <div class="nav-flyout">
        <button class="nav-flyout-toggle" type="button" aria-haspopup="true">Product</button>
        <div class="nav-menu" role="menu">
          ${productSections
            .map(
              (section) =>
                `<a href="${productSectionHref(section.id)}"${currentAttr(path, `/${section.id}`)}><strong>${section.label}</strong><span>${section.description}</span></a>`,
            )
            .join("")}
        </div>
      </div>
      <a href="/examples"${currentAttr(path, "/examples")}>Examples</a>
      <a href="/pricing"${currentAttr(path, "/pricing")}>Pricing</a>
      <a href="https://docs.lokiplay.cc/">Docs ↗</a>
    </nav>
    <details class="marketing-menu">
      <summary>Menu</summary>
      <div class="marketing-menu-panel">
        <details class="menu-product"${productMenuOpen(path)}>
          <summary>Product</summary>
          <div class="menu-product-list">
            ${productSections
              .map(
                (section) =>
                  `<a href="${productSectionHref(section.id)}"${currentAttr(path, `/${section.id}`)}>${section.label}</a>`,
              )
              .join("")}
          </div>
        </details>
        <a href="/examples"${currentAttr(path, "/examples")}>Examples</a>
        <a href="/pricing"${currentAttr(path, "/pricing")}>Pricing</a>
        <a href="/about"${currentAttr(path, "/about")}>About</a>
        <a href="/contact"${currentAttr(path, "/contact")}>Contact</a>
        <a href="https://docs.lokiplay.cc/">Docs ↗</a>
      </div>
    </details>
    <div class="marketing-actions">
      <a class="button button-quiet" href="https://app.lokiplay.cc/login">Creator Log in</a>
      <a class="button button-primary" href="https://app.lokiplay.cc/signup">Get Started</a>
    </div>
  </header>`;
}

function footer(path: string): string {
  return `
  <footer class="marketing-footer">
    <div class="marketing-section-inner">
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="brand" href="/" aria-label="Loki home">${brandMarkHtml()}<span>LOKI</span></a>
          <p>Everything your vibe-coded game needs to go from local prototype to a game people can play.</p>
        </div>
        <div class="footer-column"><h3>Product</h3><div class="footer-links">
          ${productSections
            .map(
              (section) =>
                `<a href="${productSectionHref(section.id)}"${currentAttr(path, `/${section.id}`)}>${section.label}</a>`,
            )
            .join("")}
          <a href="/examples"${currentAttr(path, "/examples")}>Examples</a>
          <a href="/pricing"${currentAttr(path, "/pricing")}>Pricing</a>
        </div></div>
        <div class="footer-column"><h3>Developers</h3><div class="footer-links">
          <a href="https://docs.lokiplay.cc/">Docs</a>
          <a href="https://docs.lokiplay.cc/quickstart">Quickstart</a>
          <a href="https://docs.lokiplay.cc/sdk">SDK docs</a>
          <a href="https://docs.lokiplay.cc/mcp">MCP</a>
        </div></div>
        <div class="footer-column"><h3>Company</h3><div class="footer-links">
          <a href="/about"${currentAttr(path, "/about")}>About</a>
          <a href="/contact"${currentAttr(path, "/contact")}>Contact</a>
        </div></div>
        <div class="footer-column"><h3>Legal</h3><div class="footer-links">
          <a href="/terms"${currentAttr(path, "/terms")}>Terms</a>
          <a href="/privacy"${currentAttr(path, "/privacy")}>Privacy</a>
          <a href="/aup"${currentAttr(path, "/aup")}>Acceptable Use</a>
        </div></div>
      </div>
      <div class="footer-base"><span>© 2026 Loki Play</span><span>docs.lokiplay.cc · app.lokiplay.cc · play.lokiplay.cc</span></div>
    </div>
  </footer>`;
}

export function productSubnav(path = "/product"): string {
  return `
    <nav class="product-subnav" aria-label="Product sections">
      ${productSections
        .map(
          (section) =>
            `<a href="${productSectionHref(section.id)}"${currentAttr(path, `/${section.id}`)}>${section.label}</a>`,
        )
        .join("")}
    </nav>`;
}

export function closingBand(): string {
  return `
    <section class="marketing-section final-section" aria-labelledby="close-title">
      <div class="marketing-section-inner final-layout">
        <div class="final-copy">
          <p class="eyebrow">One plugin. Zero infrastructure sprawl.</p>
          <h2 id="close-title">Ship your game today.</h2>
          <p>Start free with private hosting, add multiplayer when you need it, and go public only when you are ready.</p>
          <div class="final-actions">
            <a class="button final-button" href="https://app.lokiplay.cc/signup">Get started today for free</a>
            <a class="inline-link" href="/pricing">Compare plans →</a>
          </div>
        </div>
      </div>
    </section>`;
}

export function renderMarketingSite(input: {
  config: ProductPageConfig;
  path: MarketingRoute;
  title: string;
  description: string;
  main: string;
  moduleScript?: string;
}): string {
  return renderProductPage({
    config: input.config,
    title: input.title,
    description: input.description,
    body: `${header(input.path)}
  <main class="marketing-main" id="main-content">
${input.main}
  </main>
${footer(input.path)}`,
    styles: marketingStyles,
    moduleScript: input.moduleScript ?? "",
    bodyClass: "marketing-product",
  });
}
