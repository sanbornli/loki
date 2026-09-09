# Loki — Product Requirements Document

**Status:** Draft for review
**Last updated:** 31 August 2026
**Product:** Hosting, multiplayer, and distribution platform for vibe-coded games

---

## 1. Summary

Loki is a platform where creators publish vibe-coded games and players play them with friends.

It is not a generic hosting company and not a standalone multiplayer SDK. It is one product with two layers:

1. **Hosting + Multiplayer** — deploy a game, test it, play with friends.
2. **Distribution** — list the game in Loki’s public catalog so players can discover it.

Layer 1 is the entrance requirement for Layer 2. Creators can use Layer 1 while a game is unfinished. They opt into Layer 2 when they are ready.

Production multiplayer requires the game to run on Loki hosting. Local development remains supported. Creators cannot use Loki multiplayer on an external Vercel or similar URL.

---



## 2. Problem

Vibe-coded games are usually browser clients with no real backend. When creators ask an AI agent for multiplayer, the agent writes a disposable `server.js` and hardcodes `localhost`. Hosting, rooms, chat, leaderboards, discovery, and monetization remain unsolved.

Existing tools cover only part of the job:


| Tool                 | What it does               | What it does not do                                   |
| -------------------- | -------------------------- | ----------------------------------------------------- |
| Vercel               | Hosts frontend files       | Does not provide game rooms or a player catalog       |
| Colyseus Cloud       | Hosts a multiplayer server | Does not host the playable game                       |
| Playroom             | Multiplayer SDK            | Does not host or distribute games                     |
| itch.io / CrazyGames | Discovery                  | Do not give vibe-coders a drop-in multiplayer backend |


Loki’s job is the full path: connect the game, host it, add multiplayer, then optionally put it in front of players.

---



## 3. Product principles

1. **Layer 1 is open to work-in-progress.** Private deploy does not require a polished game.
2. **Layer 2 is optional and reviewed.** Public listing requires Layer 1 plus safety and compatibility review.
3. **Production multiplayer stays on Loki.** The playable production URL is a Loki URL, not the creator’s Vercel app.
4. **Loki is the backend.** Creators do not upload a Node/Python server for Loki to run.
5. **Agents integrate Loki.** Cursor, Claude Code, and similar tools install the SDK and follow Loki instructions.
6. **Loki owns monetization on the platform.** Creators do not embed their own ad networks.
7. **Technical fitness is Loki’s problem. Creative completeness is the creator’s.**
8. **Use managed infrastructure.** Do not build a CDN or global server fleet in the MVP.

---



## 4. Users



### Creator

Someone using an AI coding tool to build a game. They may have a client-only game, a leftover Socket.io server, or a Unity/iOS/Android project. They want a link friends can open, then later a place players can find the game.

### Player

Someone who wants to browse games, play in a browser, invite friends, and keep one account across games.

### Platform operator

Internal team for moderation, infrastructure, payouts, featured games, and creator support.

---



## 5. Two-layer product

```text
Local development
        ↓
Register on Loki
        ↓
Install SDK and activate project
        ↓
Layer 1 — Hosting + Multiplayer
Private / unlisted / invite-only
        ↓
Creator requests distribution
        ↓
Connect GitHub or repo for review
        ↓
AI-assisted + manual review
        ↓
Layer 2 — Public catalog
```



### Layer 1 — Hosting + Multiplayer

Available at any development stage.

Includes:

- Account and project
- Finished-build upload (web) or native SDK connection
- Private preview URL
- Invite-only and unlisted play
- Rooms, invitations, basic matchmaking
- Chat, presence, leaderboards
- Automated safety scan
- Agent CLI, docs, and validation

Does not include:

- Public catalog listing
- Platform advertising revenue
- Featured placement
- Public matchmaking pools



### Layer 2 — Distribution

Optional. Only for games already on Layer 1.

Adds:

- Public game page
- Search, categories, featured
- Player discovery
- Platform ads and creator revenue share
- Tips and later purchases
- Public leaderboards
- Reviews / ratings (later)

Requires:

- Technical compatibility
- Automated security scan
- AI-assisted content review
- Manual review before first public listing



### Why this split

Forcing every hosted game into the catalog would block unfinished games, fill the store with prototypes, and raise moderation cost. Allowing the SDK on any external host would turn Loki into Playroom and lose the catalog. Private deploy plus optional listing keeps the creator funnel wide and the public catalog controlled.

---



## 6. MVP scope



### In MVP

- Creator accounts and project activation
- Player accounts
- Player web catalog and game pages
- Creator dashboard
- Finished web-build hosting (no source-build pipeline)
- Game runtime sandbox
- JavaScript/TypeScript SDK (`@loki/game-sdk`)
- Swift SDK (Swift Package Manager)
- Kotlin/Android SDK (Maven/Gradle)
- Unity SDK (Unity Package Manager)
- CLI: login, init, validate, deploy
- Agent instructions and MCP
- Realtime rooms and invitations
- Basic matchmaking (fill N players / team sizes)
- Overlay chat and friends/invite links
- Leaderboards
- Automated upload scanning
- Background AI security agent for admins
- Report, disable, and suspend enforcement
- Acceptable Use Policy
- Free tier with hard caps
- Distribution review queue
- Tips (platform checkout)



### Out of MVP

- Building creator source repositories (module 4)
- Running arbitrary creator backends
- Creator-authored server rules; MVP multiplayer uses host-authoritative shared state
- Open-world / MMO sessions
- Voice chat
- Creator-owned ad tags
- Platform currency
- Automatic “make any game multiplayer”
- Native app store submission on behalf of creators
- Ranked competitive integrity / anti-cheat beyond anti-spoof
- Godot-first-class SDK (later if demand appears)

---



## 7. Creator flow

```text
1. Creator registers on Loki
2. Creator creates a game project and receives a project ID
3. Anytime during development:
     npm install @loki/game-sdk
     npx loki init
4. CLI opens the browser to authenticate
5. Local project is linked to the Loki project
6. Agent reads Loki instructions and integrates the SDK
7. Agent runs: npx loki validate
8. Agent uploads a finished browser build
     (native games connect via their language SDK instead)
9. Layer 1 hosting + multiplayer activate
10. When ready, creator requests Layer 2
11. Creator connects GitHub / repo for review (inspection, not build)
12. Review → publish to public catalog
```

The SDK package is public. An account is required to **activate, host, or use multiplayer**, not to download the package.

### Credentials

Do not put long-lived secrets in game source.


| Item                     | Where it lives                   |
| ------------------------ | -------------------------------- |
| Creator login credential | CLI / dashboard only             |
| Project ID               | Safe in `game.json`              |
| Player/session token     | Short-lived, issued at play time |


---



## 8. Route maps



### Creator connect

```text
Creator
   │
   ▼
Loki website — register / create project
   │
   ▼
AI agent or human
   ├── npm install @loki/game-sdk
   ├── npx loki init
   └── npx loki validate / deploy
   │
   ▼
Loki CLI + MCP
   ├── Identity
   ├── Game registry (project ID, draft)
   ├── Compatibility analyzer
   └── Upload service → object storage + CDN
   │
   ▼
Private Layer 1 URL
   ├── Identity
   ├── Rooms / matchmaking
   ├── Chat
   └── Leaderboards
   │
   ▼
Optional Layer 2 request
   ├── GitHub / repo connect
   ├── AI + manual review
   └── Public catalog
```

If a leftover `backend/` or `server.js` is found: do not run it. Report what will break and require SDK migration for those features.

### Player play (web game)

```text
Player
   │
   ▼
Loki web app
   ├── Identity
   ├── Discovery (Layer 2 only)
   └── Game page + overlay (friends, chat, leaderboards, tips/ads)
   │
   ▼
Sandboxed game iframe
   ├── Assets from CDN
   └── Loki SDK
         ├── Session coordinator
         ├── Matchmaker (if configured)
         ├── Realtime rooms
         ├── Chat
         ├── Leaderboards
         └── Monetization (Layer 2 / enabled games)
```



### Player play (native game)

```text
Player finds game on Loki
   │
   ▼
Opens App Store / Google Play
   │
   ▼
Installed app uses Loki native SDK
   └── same rooms, identity, chat, leaderboards
```

---



## 9. Hosting



### What Loki hosts

Loki hosts **finished browser artifacts**, not source builds, in the MVP.

- Creator or agent runs the production build locally.
- They upload `index.html` plus assets.
- Loki stores files (Cloudflare R2 or equivalent) and serves them via CDN.
- Each game runs on an isolated origin inside a sandboxed iframe.

This is similar to Vercel’s static hosting, specialized for games, without Vercel’s source-build pipeline or arbitrary serverless functions.

Loki runs one shared Nakama cluster for the **multiplayer process**, separate from the game website. Managed PostgreSQL stores platform and persistent multiplayer data. Creators do not deploy or access Nakama directly; Loki combines the playable host and multiplayer service behind its own protocol.

### Incomplete uploads

Judge technical playability and safety, not whether the game is “finished.”

Outcomes:

- **Ready** — can activate Layer 1
- **Ready with warnings** — playable, non-blocking issues
- **Needs changes** — broken assets, runtime errors, missing SDK where required
- **Unsupported** — no web/native target Loki can run
- **Blocked** — malware, prohibited, or unsafe

Publication stages: draft, private test, unlisted, early access, released.

---



## 10. Multiplayer

One Loki multiplayer service. Language SDKs are adapters, not separate products.

### MVP authority model

MVP uses **host-authoritative shared state**. One player is elected as the
simulation host and supplies game-state updates. Nakama remains authoritative
for identity, game separation, room admission, membership, matchmaking,
sequencing, snapshots, host election, and migration. If the host leaves, Loki
elects a replacement and restores the latest accepted state.

This model is suitable for casual, cooperative, party, and unranked games. A
host can potentially manipulate game state, so ranked competitive integrity
and strong anti-cheat remain outside MVP scope.

Creator-authored server rules are a post-MVP capability. They will ship only
after a separate rules runner proves production-grade isolation, deterministic
recovery, less than 10 ms p95 warm processing overhead, and viable operating
cost. WebAssembly remains a possible later execution format, not an MVP
dependency.

### Prototype decision

A live Nakama/PostgreSQL prototype kept two games isolated, rejected forged
game identity and cross-game room access, migrated the host, rejected stale
updates, kept matchmaking game-specific, and supported an eight-player room at
approximately nine updates per second. This is a conditional approval for the
MVP architecture. Sustained 8-player rooms across 20 concurrent games, fail-closed
Nakama restart (old rooms die; new rooms work), database restore, regional
latency, and production cost must still pass before public launch.

Session types in MVP:


| Type        | Join                    | Lifetime                    |
| ----------- | ----------------------- | --------------------------- |
| Friend room | Code / invite           | Until empty                 |
| Quick match | Queue until N players   | Match start → end → destroy |
| Team match  | Queue into T teams of S | Same as match               |
| Turn-based  | Persist state           | Long-lived                  |


Open world is deferred.

The game declares a manifest (`game.json`). Loki owns identity, rooms, teams, connect/disconnect, snapshots, and score submission plumbing. The game owns moves, win conditions, and rendering.

Do not run each creator’s custom server. Shared cluster, isolated by `gameId` + `roomId`.

---



## 11. Languages and clients

The wire protocol is language-agnostic. Packages are not.

MVP SDKs:


| Target                  | Package system        | Play model                         |
| ----------------------- | --------------------- | ---------------------------------- |
| JavaScript / TypeScript | npm `@loki/game-sdk`  | Hosted and played on Loki          |
| Unity                   | Unity Package Manager | WebGL on Loki, or native via store |
| Swift / iOS             | Swift Package Manager | Store download + Loki services     |
| Kotlin / Android        | Maven / Gradle        | Store download + Loki services     |


Web and WebGL builds can be hosted and played on Loki. Native iOS/Android/Unity apps cannot run in the browser unless a web build exists. For those, Loki provides multiplayer/identity/social plus a listing; Apple and Google still distribute the binary.

All SDKs implement the same contract:

`initialize → authenticate → join room → send input → receive state`

Ship the JS SDK and shared protocol first, then Swift, Kotlin, and Unity against the same conformance tests.

---



## 12. Agent integration

Installing the SDK does not mean an agent will follow Loki rules. `npx loki init` must install instructions.

Commands are the same across IDEs for the JS path:

```bash
npm install @loki/game-sdk
npx loki init
npx loki validate
npx loki deploy
```

One canonical specification, many adapters:


| Adapter                     | Who uses it           | Role                                             |
| --------------------------- | --------------------- | ------------------------------------------------ |
| SDK docs                    | Everyone              | Runtime API                                      |
| CLI                         | Everyone              | Login, init, validate, deploy                    |
| `AGENTS.md`                 | Any agent in the repo | Project rules                                    |
| Cursor Skill                | Cursor                | Discover Loki when asked for multiplayer/hosting |
| Claude / Codex instructions | Those agents          | Same rules, their format                         |
| MCP server                  | Capable agents        | Live docs, upload, status                        |
| `llms.txt`                  | Web-browsing agents   | Public summary                                   |


Keep runtime SDK, CLI, MCP, and IDE skills as separate packages under one org. `loki init` asks which agent files to write. Do not hide IDE files inside the game SDK.

Instructions require technical fitness for Loki (browser build, no localhost backend, no secrets, no third-party ads, SDK for rooms/scores). They do not judge game quality.

---



## 13. Monetization

If a game is played **on** Loki, creators cannot run their own AdSense or ad tags. Loki is the publisher.


| Model                        | When                  |
| ---------------------------- | --------------------- |
| Tips                         | MVP                   |
| Platform ads + revenue share | Layer 2               |
| Rewarded ads via SDK         | After ads integration |
| Paid games / IAP             | Later                 |


Payouts go creator ← Loki (e.g. Stripe Connect). No third-party ad scripts in uploads.

Native store games follow Apple/Google payment rules for IAP; Loki can still run tips/discovery on the Loki listing.

---



## 14. Security and moderation

Infrastructure providers (Cloudflare and managed database/authentication providers) hold **Loki** accountable. Loki operates Nakama and holds **creators** accountable. Providers will not moderate the catalog.

### Every Layer 1 upload

- Isolated game origin and sandboxed iframe
- Restricted outbound network
- Deterministic scan: malware signatures, file types, secrets, dangerous URLs, size limits
- Report button on every reachable game
- Ability to disable a deployment and suspend keys/accounts immediately



### Background AI security agent

Runs separately from the happy path so it does not block adoption:

- After fast checks pass, deploy privately
- AI agent reviews scripts, behavior, network, phishing/miner patterns
- Writes a risk report to the admin queue
- High-confidence threats (malware, credential theft, phishing, mining) quarantine immediately
- Borderline cases wait for a human



### Layer 2

Fast scan + AI review + **manual review** before first public listing. Material updates may require re-review.

### Native games

Loki does not hold the App Store binary the same way. Require store listing, app id, review build or connected repo, and privacy/network declarations. Monitor SDK abuse on Loki’s servers.

Acceptable Use Policy is required at launch.

---



## 15. Economics

A free tier is required to compete for vibe-coders. It cannot be unlimited, and it is not free for Loki to operate.

Nakama is open source, but its compute, managed PostgreSQL, bandwidth, monitoring, and operations are paid infrastructure. Vercel’s free tier is a capped acquisition cost, not costless infrastructure.

### Free development (Layer 1)

- Limited private games
- Storage and bandwidth caps
- Small rooms (e.g. 8 players)
- Monthly multiplayer cap
- Rooms stop when empty
- Inactive drafts expire
- Hard stop at the cap, no silent overage
- Community support only



### Public Layer 2 games

- Larger or subsidized allowances
- Funded by ads, tips, and later purchases
- High-usage games must earn or pay enough to cover infra



### Paid creator plan

Higher limits, teams, analytics, longer logs, overages.

Compete on the full outcome (host + multiplayer + optional catalog), not on beating Vercel’s raw bandwidth.

---



## 16. Modules to build (MVP)


| #   | Module                | MVP         | Notes                                                       |
| --- | --------------------- | ----------- | ----------------------------------------------------------- |
| 1   | Player web platform   | Yes         | Catalog, pages, player                                      |
| 2   | Creator dashboard     | Yes         | Projects, upload, publish request                           |
| 3   | Accounts and identity | Yes         | Managed auth provider                                       |
| 4   | Source-build pipeline | **No**      | Upload finished web builds only                             |
| 5   | Static hosting + CDN  | Yes         | R2 / Cloudflare or equivalent                               |
| 6   | Game sandbox          | Yes         | Prototype + security review before public                   |
| 7   | Game SDKs             | Yes         | JS, Swift, Kotlin, Unity                                    |
| 8   | Realtime multiplayer  | Yes         | Self-hosted Nakama OSS + managed PostgreSQL; host-authoritative state |
| 9   | Advanced matchmaking  | Partial     | Basic queues only                                           |
| 10  | Chat and social       | Yes         | Friends, invites, lobby chat                                |
| 11  | Leaderboards          | Yes         | Anti-spoof, not full anti-cheat                             |
| 12  | Recommendations       | Later       | Featured + new is enough                                    |
| 13  | Ads                   | Layer 2     | After private beta                                          |
| 14  | Payments / payouts    | Tips in MVP | Stripe Connect; legal review                                |
| 15  | Creator analytics     | Basic       | Plays, sessions                                             |
| 16  | Moderation / admin    | Yes         | Reports, disable, suspend                                   |
| 17  | Compatibility scanner | Yes         | Backend, localhost, secrets                                 |
| 18  | Agent layer           | Yes         | CLI, MCP, docs, skills                                      |
| 19  | Monitoring            | Yes         | Managed logs/alerts                                         |
| 20  | Legal / AUP           | Yes         | Human legal review, not generated policy as source of truth |
| 21  | AI security agent     | Yes         | Admin-side, mostly async                                    |
| 22  | Creator server rules  | Later       | Separate sandboxed runner after post-MVP safety/performance gates |


Achievable as a private MVP with vibe coding plus managed services. Public paid launch needs security, legal, and load-test review. Four production SDKs increase test surface; JS + protocol first, then the other three against shared tests.

---



## 17. Suggested platform stack (MVP)


| Need                   | Use                                                        |
| ---------------------- | ---------------------------------------------------------- |
| Identity               | Supabase Auth                                              |
| Platform database      | Supabase PostgreSQL project dedicated to Loki control data |
| Multiplayer database   | Separate Supabase PostgreSQL project dedicated to Nakama   |
| App/API/multiplayer    | Railway in Singapore                                       |
| Game files             | Cloudflare R2                                               |
| Delivery and DNS       | Cloudflare CDN and DNS                                      |
| Infrastructure health  | Railway logs, metrics, deployment events, and alerts       |
| Application monitoring | Sentry errors, traces, logs, uptime, and release tracking  |
| Multiplayer            | Self-hosted Nakama OSS                                     |
| Tips                   | Stripe Connect, after legal review                         |


Creators never see these infrastructure components or providers.

The two Supabase projects remain operationally separate: Nakama never shares
the authentication/control-plane database. Neon is not required for MVP.
Cloudflare R2 remains separate from Supabase Storage because game delivery is
bandwidth-heavy and benefits from R2's egress model, global cache, DNS, WAF, and
wildcard-origin controls. Grafana Cloud is deferred because Railway covers
infrastructure health and Sentry covers application-level debugging at MVP
scale.

---



## 18. Success metrics

**Creators:** time from account → playable private URL; % of installs that activate; % of Layer 1 games that request Layer 2; agent-completed integrations.

**Players:** MAU; session completion; invite accept rate; retention.

**Marketplace:** listed games with repeat play; non-featured play share; creator earnings.

**Reliability:** asset load success; connect success; match wait time; disconnect rate.

**Trust:** time to action on reports; false-deploy rate of malware; appeal outcomes.

---



## 19. Phased delivery



### Phase 1 — Private foundation

JS SDK, CLI, auth, finished-build hosting, sandbox, rooms, invites, chat, leaderboards, automated scan, admin enforcement, MCP + agent docs. Seed ~20–30 games by hand.

### Phase 2 — Open Layer 1

Self-serve upload, Swift/Kotlin/Unity SDKs, basic matchmaking, AI security queue, free-tier limits, tips.

### Phase 3 — Layer 2 marketplace

Public catalog, review workflow, ads + revenue share, discovery, GitHub-connected review.

### Later

Creator-authored server rules, possible WebAssembly execution, source-build
pipeline, voice, ranked, world shards, Godot SDK, and store IAP helpers.

---



## 20. Open decisions

1. Unlisted-but-deployed vs. every production URL must be public after review.
2. Allowed age ratings and content categories.
3. Creator revenue split on ads, tips, and later IAP.
4. Who is merchant of record.
5. External API allowlist vs. deny-by-default in the sandbox.
6. Max build size, players per room, and tick rate on free vs. paid.
7. Whether native games may appear in the same catalog as instantly playable web games.
8. Brand/legal name (working name: Loki).

Resolved architecture decisions:

- MVP multiplayer uses host-authoritative shared state; creator-authored authoritative rules are post-MVP.
- V1 rooms use one self-hosted Nakama OSS cluster with managed PostgreSQL rather than Colyseus Cloud or Durable Objects.

The product bet is:

> Loki hosts the game and the session. Creators can stay private while they build. When they want players, they list on Loki — and only then does the catalog become the moat.
