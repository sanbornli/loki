import {
  renderProductPage,
  type ProductPageConfig,
} from "./product-theme.js";

export const marketingRoutes = [
  "/",
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
}

.marketing-header {
  position: relative;
  z-index: 10;
  grid-template-columns: auto 1fr auto;
  gap: 2rem;
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
  right: var(--space);
  left: var(--space);
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
  overflow: hidden;
}

.marketing-section {
  padding: clamp(2.25rem, 5vw, 4.25rem) var(--space);
  border-top: 1px solid var(--line);
}

.marketing-section-inner {
  width: min(100%, 106rem);
  margin: 0 auto;
}

.marketing-hero {
  display: grid;
  grid-template-columns: minmax(22rem, 32rem) minmax(0, 1fr);
  gap: clamp(2rem, 4vw, 4.5rem);
  align-items: center;
  width: 100%;
  min-height: calc(100vh - 5.25rem);
  padding: clamp(1.5rem, 4vh, 2.75rem) 0 clamp(1.5rem, 4vh, 2.75rem) max(var(--space), calc((100vw - 106rem) / 2));
}

.marketing-hero-copy {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.marketing-hero .display {
  max-width: 100%;
  font-size: var(--hero-title-size);
}

.hero-keep {
  white-space: nowrap;
}

.marketing-hero .lede {
  max-width: 42rem;
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
  border: 1px solid var(--line-strong);
  border-right: 0;
  background: #0a0a08;
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
  padding: clamp(3.2rem, 7vw, 5.8rem) var(--space) clamp(2.5rem, 5vw, 3.8rem);
}

.page-hero-inner {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(16rem, 0.75fr);
  gap: clamp(2rem, 6vw, 6rem);
  align-items: end;
  width: min(100%, 106rem);
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
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
  width: min(100%, 106rem);
  margin: 0 auto;
  padding: 0.95rem var(--space);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
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
#workflow-title {
  max-width: none;
  margin: 0;
  font-size: var(--section-title-size);
  font-weight: 560;
  letter-spacing: -0.065em;
  line-height: 0.98;
  grid-column: 1 / -1;
  max-width: none;
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
.editorial-stack {
  grid-template-columns: 1fr;
}

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
.agent-layout {
  min-height: 46.25rem;
  align-items: stretch;
}

.agent-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

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
.agent-logos {
  display: flex;
  flex-wrap: wrap;
  gap: 1.15rem 1.45rem;
  margin: 2.25rem 0 0;
  padding: 0;
  list-style: none;
}

.agent-logo {
  display: grid;
  justify-items: center;
  gap: 0.4rem;
  color: var(--quiet);
  font-family: var(--mono);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agent-logo img {
  display: block;
  width: 1.7rem;
  height: 1.7rem;
  object-fit: contain;
}

.ide-stage {
  position: relative;
  display: grid;
  place-items: center;
  align-self: center;
  min-width: 0;
  height: auto;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  background: var(--ink);
}

.ide-zoom {
  position: relative;
  width: 100%;
  transform-origin: 46.55% 95.46%;
  animation: ide-zoom 12s ease-in-out infinite;
}

.ide-screen {
  display: block;
  width: 100%;
  height: auto;
}

.ide-screen-prompt {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  animation: ide-paste 12s linear infinite;
}

.ide-pointer {
  position: absolute;
  left: 46.55%;
  top: 95.46%;
  z-index: 3;
  width: 1.05rem;
  height: 1.45rem;
  margin: -0.1rem 0 0 0.15rem;
  clip-path: polygon(0 0, 100% 68%, 54% 68%, 72% 100%, 48% 100%, 32% 68%, 0 82%);
  background: #f4f1ea;
  filter: drop-shadow(0 1px 2px #000);
  animation: ide-pointer 12s linear infinite;
}

@keyframes ide-zoom {
  0%, 22% { transform: scale(1); }
  40%, 78% { transform: scale(1.72); }
  92%, 100% { transform: scale(1); }
}

@keyframes ide-paste {
  0%, 16% { opacity: 0; filter: none; }
  18% { opacity: 1; filter: brightness(1.08); }
  24%, 100% { opacity: 1; filter: none; }
}

@keyframes ide-pointer {
  0%, 38% {
    opacity: 0;
    transform: translate(-4.6rem, -3.2rem);
  }
  46% {
    opacity: 1;
    transform: translate(-2.4rem, -1.4rem);
  }
  58%, 62% {
    opacity: 1;
    transform: translate(0, 0);
  }
  64% {
    opacity: 1;
    transform: translate(0, 0.12rem) scale(0.92);
  }
  70%, 80% {
    opacity: 1;
    transform: translate(0, 0);
  }
  88%, 100% {
    opacity: 0;
    transform: translate(0, 0);
  }
}

}

.docs-panel,
.release-panel,
.lobby-panel {
  border: 1px solid var(--line-strong);
}
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;

.docs-panel {
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
.feature-stack {
  display: grid;
  gap: clamp(1.75rem, 4vw, 3rem);
}

.feature-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: clamp(2rem, 6vw, 5rem);
  align-items: center;
}

.feature-row-flip {
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
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
  border: 1px solid var(--line-strong);
  background: #0c0b09;
}

.scene-pipeline,
.scene-lobby,
.scene-catalog {
  padding: 1.15rem 1.2rem 1.2rem;
  gap: 0.75rem;
}

.pipe-bar,
.scene-lobby .lobby-head,
.catalog-rail,
.pipe-status,
.catalog-meta {
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

.pipe-bar em,
.scene-lobby .lobby-head em {
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

.scene-lobby {
  grid-template-rows: auto repeat(4, minmax(0, 1fr)) auto;
}

.lobby-seat {
  display: grid;
  grid-template-columns: 1.35rem 1fr auto;
  gap: 0.7rem;
  align-items: center;
  min-height: 3.15rem;
  padding: 0 0.85rem;
  border: 1px solid #2c2b25;
  background: #10100d;
  color: #e8e0d0;
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lobby-seat i {
  display: grid;
  place-items: center;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  font-style: normal;
  font-size: 0.5rem;
  color: #14110c;
  background: #8d8878;
}

.lobby-seat-1 i { background: var(--amber-bright); box-shadow: 0 0 10px color-mix(in srgb, var(--amber) 50%, transparent); }
.lobby-seat-2 i { background: #8ec8ff; box-shadow: 0 0 10px #5aa7e6; color: #102033; }
.lobby-seat-3 i { background: #f0a72e; color: #14110c; }
.lobby-seat-4 {
  opacity: 0.46;
  color: #8d8878;
}

.lobby-seat b {
  color: var(--amber-bright);
  font-weight: 700;
}

.lobby-seat-4 b { color: #8d8878; }

.lobby-chat {
  padding: 0.7rem 0.85rem;
  border: 1px solid #2c2b25;
  background: color-mix(in srgb, var(--amber) 8%, #10100d);
  color: #d8d0c0;
  font-size: 0.78rem;
}

.lobby-chat span {
  margin-right: 0.55rem;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lobby-seat-2 { animation: seat-in 8s linear infinite; }
.lobby-seat-3 { animation: seat-join 8s linear infinite; }
.lobby-chat { animation: chat-pulse 8s linear infinite; }

.catalog-rail {
  gap: 0.45rem;
  justify-content: flex-start;
}

.catalog-pill {
  padding: 0.35rem 0.55rem;
  border: 1px solid #2c2b25;
  background: #10100d;
  color: #8d8878;
}

.catalog-card {
  display: grid;
  align-content: end;
  min-height: 14rem;
  padding: 1rem;
  border: 1px solid #2c2b25;
  background: #10100d;
}

.catalog-thumb {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.35rem;
  min-height: 7.5rem;
  margin-bottom: 1rem;
  padding: 0.55rem;
  border: 1px solid #2c2b25;
  background: #161612;
}

.catalog-thumb span {
  border: 1px solid #2c2b25;
  background: #1a5a78;
}

.catalog-thumb span:nth-child(3),
.catalog-thumb span:nth-child(6) {
  background: #c43b28;
}

.catalog-thumb span:nth-child(8) {
  background: #f0a72e;
}

.catalog-card p {
  margin: 0;
  color: var(--paper);
  font-size: 1.35rem;
  letter-spacing: -0.04em;
}

.catalog-card small {
  margin-top: 0.35rem;
  color: #8d8878;
  font-family: var(--mono);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.catalog-meta {
  margin-top: auto;
  color: #8d8878;
}

.catalog-pill:nth-child(1) { animation: pill-on 9s linear infinite; }
.catalog-pill:nth-child(2) { animation: pill-on 9s linear infinite 3s; }
.catalog-pill:nth-child(3) { animation: pill-on 9s linear infinite 6s; }
.catalog-card { animation: catalog-card 9s linear infinite; }

@keyframes pipe-lit {
  0%, 18% {
    opacity: 1;
    border-color: color-mix(in srgb, var(--amber) 55%, #2c2b25);
    background: color-mix(in srgb, var(--amber) 10%, #10100d);
  }
  28%, 100% { opacity: 0.42; border-color: #2c2b25; background: #10100d; }
}

@keyframes seat-in {
  0%, 12% { opacity: 0; }
  20%, 100% { opacity: 1; }
}

@keyframes seat-join {
  0%, 28% { opacity: 0.28; }
  38%, 100% {
    opacity: 1;
    border-color: color-mix(in srgb, var(--amber) 45%, #2c2b25);
  }
}

@keyframes chat-pulse {
  0%, 48% { opacity: 0.42; }
  58%, 100% { opacity: 1; }
}

@keyframes pill-on {
  0%, 28% {
    color: var(--ink);
    border-color: var(--amber);
    background: var(--amber);
  }
  36%, 100% {
    color: #8d8878;
    border-color: #2c2b25;
    background: #10100d;
  }
}

@keyframes catalog-card {
  0%, 62% { opacity: 0.72; }
  72%, 100% { opacity: 1; }
}

}

.final-section {
  background: var(--amber);
  color: var(--ink);
}

  grid-template-columns: minmax(0, 40rem);
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

.legal-page {
  width: min(100% - 2rem, 46rem);
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
  border-top: 1px solid var(--line);
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
    grid-template-columns: 1fr;
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

  .feature-row-flip .feature-copy {
    text-align: left;
  }

  .feature-row-flip .feature-copy h2,
  .feature-row-flip .feature-copy h3,
  .feature-row-flip .feature-copy > p:not(.card-index),
  .feature-row-flip .feature-copy .feature-list {
    margin-left: 0;
  }

  .agent-layout {
    min-height: 0;
  }

  .feature-stage {
    min-height: 22rem;
  }

  .marketing-hero {
    min-height: auto;
    padding: clamp(2rem, 5vh, 3.5rem) var(--space);
  }

  .game-stage {
    min-height: 28rem;
    border-right: 1px solid var(--line-strong);
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

  .marketing-product {
    --hero-title-size: clamp(3.2rem, 15vw, 5.5rem);
  }

  .hero-actions {
    width: 100%;
  }

  .game-stage {
    min-height: 22rem;
  }

  .split-heading,
  .editorial-grid,
  .capability-grid,
  .sdk-grid,
  .plan-grid {
    grid-template-columns: 1fr;
  }

  .split-heading {
    gap: 0.85rem;
    text-align: left;
  }

  .split-heading > .eyebrow,
  .split-heading > h2,
  .split-heading > div {
    grid-column: 1;
    justify-self: start;
  }

  .split-heading h2,
  .split-heading .lede {
    margin-left: 0;
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
  }
}
`;

function header(path: string): string {
  return `
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header marketing-header">
    <a class="brand" href="/" aria-label="Loki home">
      <span class="brand-mark" aria-hidden="true"></span>
      <span>LOKI</span>
    </a>
    <nav class="marketing-nav" aria-label="Primary navigation">
      <div class="nav-flyout">
        <button class="nav-flyout-toggle" type="button" aria-haspopup="true">Product</button>
        <div class="nav-menu" role="menu">
          <a href="/hosting"${currentAttr(path, "/hosting")}><strong>Hosting</strong><span>A scanned, isolated home for every build.</span></a>
          <a href="/multiplayer"${currentAttr(path, "/multiplayer")}><strong>Multiplayer</strong><span>Rooms, invites, and shared state without a server project.</span></a>
          <a href="/distribution"${currentAttr(path, "/distribution")}><strong>Distribution</strong><span>Private while you build. Public when you are ready.</span></a>
          <a href="/agents"${currentAttr(path, "/agents")}><strong>Agents</strong><span>One source of truth for coding agents.</span></a>
          <a href="/sdk"${currentAttr(path, "/sdk")}><strong>SDK</strong><span>JavaScript now. Unity, Swift, and Kotlin next.</span></a>
        </div>
      </div>
      <a href="/examples"${currentAttr(path, "/examples")}>Examples</a>
      <a href="/pricing"${currentAttr(path, "/pricing")}>Pricing</a>
      <a href="https://docs.lokiplay.cc/">Docs ↗</a>
      <a href="https://play.lokiplay.cc/">Play ↗</a>
    </nav>
    <details class="marketing-menu">
      <summary>Menu</summary>
      <div class="marketing-menu-panel">
        <details class="menu-product"${productMenuOpen(path)}>
          <summary>Product</summary>
          <div class="menu-product-list">
            <a href="/hosting"${currentAttr(path, "/hosting")}>Hosting</a>
            <a href="/multiplayer"${currentAttr(path, "/multiplayer")}>Multiplayer</a>
            <a href="/distribution"${currentAttr(path, "/distribution")}>Distribution</a>
            <a href="/agents"${currentAttr(path, "/agents")}>Agents</a>
            <a href="/sdk"${currentAttr(path, "/sdk")}>SDK</a>
          </div>
        </details>
        <a href="/examples"${currentAttr(path, "/examples")}>Examples</a>
        <a href="/pricing"${currentAttr(path, "/pricing")}>Pricing</a>
        <a href="/about"${currentAttr(path, "/about")}>About</a>
        <a href="/contact"${currentAttr(path, "/contact")}>Contact</a>
        <a href="https://docs.lokiplay.cc/">Docs ↗</a>
        <a href="https://play.lokiplay.cc/">Play ↗</a>
      </div>
    </details>
    <div class="marketing-actions">
      <a class="button button-quiet" href="https://app.lokiplay.cc/login">Log in</a>
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
          <a class="brand" href="/" aria-label="Loki home"><span class="brand-mark" aria-hidden="true"></span><span>LOKI</span></a>
          <p>Everything your vibe-coded game needs to go from local prototype to a game people can play.</p>
          <a class="card-link" href="https://play.lokiplay.cc/">Play games ↗</a>
        </div>
        <div class="footer-column"><h3>Product</h3><div class="footer-links">
          <a href="/hosting"${currentAttr(path, "/hosting")}>Hosting</a>
          <a href="/multiplayer"${currentAttr(path, "/multiplayer")}>Multiplayer</a>
          <a href="/distribution"${currentAttr(path, "/distribution")}>Distribution</a>
          <a href="/agents"${currentAttr(path, "/agents")}>Agents</a>
          <a href="/sdk"${currentAttr(path, "/sdk")}>SDK</a>
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

export function productSubnav(path: string): string {
  return `
    <nav class="product-subnav" aria-label="Product pages">
      <a href="/hosting"${currentAttr(path, "/hosting")}>Hosting</a>
      <a href="/multiplayer"${currentAttr(path, "/multiplayer")}>Multiplayer</a>
      <a href="/distribution"${currentAttr(path, "/distribution")}>Distribution</a>
      <a href="/agents"${currentAttr(path, "/agents")}>Agents</a>
      <a href="/sdk"${currentAttr(path, "/sdk")}>SDK</a>
    </nav>`;
}

export function closingBand(copy = "Give your game somewhere to go."): string {
  return `
    <section class="marketing-section final-section" aria-labelledby="close-title">
      <div class="marketing-section-inner final-layout">
        <div class="final-copy">
          <p class="eyebrow">One plugin. Zero infrastructure sprawl.</p>
          <h2 id="close-title">${copy}</h2>
          <p>Start free with private hosting, add multiplayer when you need it, and go public only when you are ready.</p>
          <div class="final-actions">
            <a class="button final-button" href="https://app.lokiplay.cc/signup">Create free project ↗</a>
            <a class="inline-link" href="/pricing">Compare plans →</a>
          </ul>
        </aside>
          </ul>
        </aside>
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
