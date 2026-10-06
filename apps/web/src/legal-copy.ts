export const termsMain = `
    <article class="legal-page">
      <h1>Terms of Service</h1>
      <p class="legal-updated">Last updated: 7 October 2026</p>
      <section class="legal-article">
        <h2 id="introduction">Introduction</h2>
        <p>Effective date: 1 September 2026</p>
        <p>Version: terms-2026-10-07</p>
        <p>These Terms of Service (“Terms”) are a legally binding agreement between you and Reveflo Technologies Limited, a company incorporated in Hong Kong (“Reveflo”, “we”, “us”, or “our”), for Loki.</p>
        <p>The Service is the websites and applications at lokiplay.cc, app.lokiplay.cc, play.lokiplay.cc, and docs.lokiplay.cc, the API at api.lokiplay.cc, per-game hosts, software development kits, command-line tools, agent integrations, hosting, multiplayer, chat, leaderboards, and related services we make available.</p>
        <p>By creating an account, accepting these Terms in the product, paying for a plan, deploying a game, or playing a game, you agree to these Terms, the Privacy Policy (version privacy-2026-10-07), and the Acceptable Use Policy (version aup-2026-10-07) (the “AUP”).</p>
        <p>Questions and legal notices: <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a></p>
      </section>
      <section class="legal-article">
        <h2 id="1-definitions">1. Definitions</h2>
        <p>“Account” means a Loki creator account authenticated through our identity provider.</p>
        <p>“Creator” means a person who uses an Account to create projects, upload builds, or operate games. If you act for an organisation, “you” includes that organisation.</p>
        <p>“Player” means a person who plays a game on the Service, including as a guest.</p>
        <p>“Content” means software, builds, step modules, assets, text, chat, display names, scores, metadata, and other material submitted to or sent through the Service.</p>
        <p>“Game Content” means Content a Creator submits for a project, including finished builds, manifests, step modules, and connected-repository materials.</p>
        <p>“User Content” means Content a Player submits, including chat, display names, scores, and reports.</p>
        <p>“SDK” means Loki’s JavaScript, Swift, Kotlin, and Unity libraries, the command-line tool, the MCP server, and agent instruction packages. In a hosted browser game, production loads the JavaScript SDK from the game host.</p>
        <p>“Plan” means Free, Loki, or Loki Pro, or a custom plan we agree in writing.</p>
        <p>“Business day” means a day other than a Saturday, a Sunday, or a public holiday in Hong Kong.</p>
      </section>
      <section class="legal-article">
        <h2 id="2-the-service">2. The Service</h2>
        <p>2.1 Loki hosts finished browser builds and provides rooms, invites, public rooms within a game, fill-N and team matchmaking, presence, lobby and match chat, and per-game leaderboards. Production multiplayer runs on a Loki-hosted build.</p>
        <p>2.2 Host authority is the default. One Player is elected simulation host. We check that the sender is the current host, sequence messages, and migrate the host if that Player leaves. A host can affect game state. This mode is for casual, cooperative, party, turn-based, and unranked play.</p>
        <p>2.3 Server authority is available on the Loki and Loki Pro plans when the Creator ships a pure step module. We run that module. No Player is host. The module must export one step function, import nothing, and compute the next state only from the previous state and that tick’s inputs. Drawing, sound, and asset loads stay in the browser. Server-authoritative rooms run in Singapore, are browser-only, and end if the step fails. They do not fall back to a Player host. Server authority is a fairness boundary for that match. It is not ranked anti-cheat, and it is not a Creator-operated backend.</p>
        <p>2.4 Each project has one authority at a time. Rooms already open keep the authority they started with. Changing authority requires a new ship.</p>
        <p>2.5 We store accepted browser releases as immutable artifacts and serve them from a sandboxed game origin. We do not run Creator-supplied backends, and we do not compile Creator source on Loki. Native iOS, Android, and Unity applications may use the SDK for synchronized rooms. Distribution of those binaries on Apple, Google, or another store stays with the Creator. Realtime rooms are a browser capability.</p>
        <p>2.6 Private play and, on the Loki and Loki Pro plans, unlisted play links are part of the current Service, within Plan limits. Public catalog publication is closed. A paid Plan does not put a game into a public catalog.</p>
        <p>2.7 Tips, platform advertising, creator payouts, friends, parties, and public leaderboards are not part of the current Service.</p>
        <p>2.8 For hosted browser games, we serve /loki/sdk.js from the game host. Within a compatibility version, that file may be newer than the @lokiplay/sdk package the Creator installed, so compatible networking fixes can reach Players on refresh. We may serve a candidate build to specific projects, promote it, or roll back to the previous stable file. Removing or renaming an SDK export requires a new compatibility version and a game rebuild. Native packages are not updated this way.</p>
        <p>2.9 We may change, throttle, suspend, or discontinue any part of the Service, including by quota enforcement or an emergency kill switch.</p>
      </section>
      <section class="legal-article">
        <h2 id="3-eligibility">3. Eligibility</h2>
        <p>3.1 You must be at least 13 years old.</p>
        <p>3.2 If you are under 18, a parent or legal guardian must accept these Terms for you and is responsible for your use.</p>
        <p>3.3 You must be able to use the Service under Hong Kong law and the law of your residence. You must not use the Service if sanctions or export controls prohibit you from receiving it.</p>
        <p>3.4 If you act for an organisation, you represent that you can bind it.</p>
      </section>
      <section class="legal-article">
        <h2 id="4-accounts-and-guests">4. Accounts and guests</h2>
        <p>4.1 A Creator Account requires an email address and password, or sign-in with Google or GitHub, and acceptance of the then-current Terms, Privacy Policy, and AUP. We store the accepted versions: terms-2026-10-07, privacy-2026-10-07, and aup-2026-10-07, until we publish later versions.</p>
        <p>4.2 You are responsible for your credentials, command-line device authorisations, deployment credentials, and play invites.</p>
        <p>4.3 Guest play does not require an Account. Guest use is still subject to these Terms, the Privacy Policy, and the AUP. We may set a guest cookie so the same guest can be recognised in that project for up to 30 days.</p>
        <p>4.4 Player sessions are short-lived and project-scoped. You must not share, sell, or forge them.</p>
        <p>4.5 We may refuse registration or limit guest sessions.</p>
      </section>
      <section class="legal-article">
        <h2 id="5-creators">5. Creators</h2>
        <p>5.1 You may create projects, upload finished builds, ship through the command-line tool, connect GitHub where offered, issue play invites, and operate play within your Plan.</p>
        <p>5.2 You retain ownership of your Game Content, subject to the licences in Section 8.</p>
        <p>5.3 You represent that you have the rights to upload and operate the Game Content, that it complies with the AUP and applicable law, and that it does not infringe other people’s rights. You will not embed third-party ad tags, miners, credential harvesters, remote scripts, or undeclared network endpoints. Long-lived Loki secrets do not belong in source or client builds. For native store games, you remain responsible for the store’s rules.</p>
        <p>5.4 Uploads are scanned. We may refuse, quarantine, disable, or delete a deployment that fails automated checks, assisted review, or human review. A scan that allows a ship is not an approval of the game’s content.</p>
        <p>5.5 If you connect GitHub, you authorise us to create or update only Loki-owned workflow files, receive webhooks, and ingest the configured finished-build artifact. The build runs in GitHub Actions. We do not run your build command on Loki.</p>
        <p>5.6 A step module is Game Content. You are responsible for its rules. We may reject a module that fails validation, fuel, memory, determinism, or safety limits.</p>
        <p>5.7 Quotas are hard caps. The action that would exceed a cap is denied.</p>
        <p>5.8 Current Plan limits, as stated for this version:</p>
        <div class="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Free</th>
                <th>Loki</th>
                <th>Loki Pro</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Price</td>
                <td>US$0</td>
                <td>US$12 per month, or US$8 per month billed annually</td>
                <td>US$20 per month, or US$15 per month billed annually</td>
              </tr>
              <tr>
                <td>Games</td>
                <td>1</td>
                <td>20</td>
                <td>No stated cap</td>
              </tr>
              <tr>
                <td>Play links</td>
                <td>1</td>
                <td>20</td>
                <td>No stated cap</td>
              </tr>
              <tr>
                <td>Simultaneous rooms</td>
                <td>2</td>
                <td>Up to the runtime ceiling of 100</td>
                <td>Up to the runtime ceiling of 100</td>
              </tr>
              <tr>
                <td>Players per room</td>
                <td>4</td>
                <td>8</td>
                <td>8</td>
              </tr>
              <tr>
                <td>Authority</td>
                <td>Host</td>
                <td>Host and server</td>
                <td>Host and server</td>
              </tr>
              <tr>
                <td>Unlisted play links</td>
                <td>No</td>
                <td>Yes</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Public catalog</td>
                <td>Closed</td>
                <td>Closed</td>
                <td>Closed</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>5.9 If the pricing page and the Service disagree, the Service enforces the Plan on the Account. We may change future limits under Section 17.</p>
        <p>5.10 You are responsible for support to your Players, except for platform and safety issues they raise with us.</p>
      </section>
      <section class="legal-article">
        <h2 id="6-players">6. Players</h2>
        <p>6.1 You may play games you are allowed to open, join rooms, use matchmaking where the game offers it, chat, submit a display name and score, and appear on that game’s leaderboard.</p>
        <p>6.2 Games are created by Creators, except first-party games we identify. Other Players, hosts, and game rules are outside our control. We are not responsible for Game Content. Leaderboard scores submitted by a client are not an anti-cheat boundary.</p>
        <p>6.3 Chat, display names, and scores must comply with the AUP.</p>
        <p>6.4 You must not escape the sandbox, reach another project, forge identity, or interfere with rooms you are not in.</p>
      </section>
      <section class="legal-article">
        <h2 id="7-sdks-apis-and-agents">7. SDKs, APIs, and agents</h2>
        <p>7.1 We grant you a limited, non-exclusive, non-transferable, revocable licence to use the SDKs to develop and operate games that connect to the Service in line with our documentation.</p>
        <p>7.2 Package licences apply to SDK code. These Terms govern use of the hosted Service.</p>
        <p>7.3 You must not use the SDKs or the hosted script to bypass authentication, quotas, sandboxing, or project isolation. You must not import the SDK from a game Web Worker or register a game service worker that caches or intercepts /loki/sdk.js.</p>
        <p>7.4 Agent instructions and command-line checks help integration. You remain responsible for what you or your agent ships.</p>
      </section>
      <section class="legal-article">
        <h2 id="8-intellectual-property">8. Intellectual property</h2>
        <p>8.1 The Service, protocol, documentation, trade marks, and our software, excluding your Content and third-party open-source components, belong to Reveflo or its licensors.</p>
        <p>8.2 Between you and Reveflo, you retain ownership of your Content.</p>
        <p>8.3 You grant Reveflo a worldwide, non-exclusive, royalty-free, transferable, sublicensable licence to host, store, reproduce, adapt, transmit, display, and run Game Content as needed to operate, secure, review, moderate, deliver, and update the Service. This includes running step modules and serving the hosted SDK into your build.</p>
        <p>8.4 You grant Reveflo a worldwide, non-exclusive, royalty-free licence to host, transmit, and display User Content as needed to operate rooms, chat, leaderboards, invites, reports, and safety.</p>
        <p>8.5 If you send suggestions, we may use them without restriction or payment.</p>
        <p>8.6 If you believe Content infringes your intellectual property rights, write to <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a> with your name and contact details, the work and the URL or project, a statement that you own the right or are authorised to act, a statement that the notice is true and in good faith, and your signature. We will acknowledge a complete notice within 5 business days. We may remove or disable the material and end access for repeat infringers. Hong Kong does not operate a United States-style DMCA safe harbour.</p>
      </section>
      <section class="legal-article">
        <h2 id="9-acceptable-use">9. Acceptable use</h2>
        <p>The AUP is part of these Terms. We may investigate, scan, quarantine, remove Content, revoke credentials and invites, disable a project, suspend an Account, and refer matters to law enforcement. You may ask for a review of a suspension at <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a>. We will consider it. We are not obliged to restore access.</p>
      </section>
      <section class="legal-article">
        <h2 id="10-plans-and-payment">10. Plans and payment</h2>
        <p>10.1 Paid Plans are subscriptions processed by Stripe. We do not store your card number. Stripe’s terms apply to the payment method.</p>
        <p>10.2 Prices are in United States dollars and are those shown at checkout. As of this revision they are: Free at US$0; Loki at US$12 per month, or US$8 per month billed annually; Loki Pro at US$20 per month, or US$15 per month billed annually. Taxes are extra unless checkout says otherwise.</p>
        <p>10.3 A subscription renews until you cancel it in the Stripe customer portal from the creator application. After cancellation, paid limits continue until the end of the period already paid. The Account then returns to Free limits. A past-due subscription keeps paid limits until the period end, and then returns to Free if payment is not restored.</p>
        <p>10.4 Fees are not refundable. Cancellation stops the next renewal. It does not refund the current period.</p>
        <p>10.5 We may change prices or Plan limits for future periods by publishing the change under Section 17. The current period keeps the price already paid.</p>
        <p>10.6 A custom Plan exists only when we confirm it in writing. Contacting us does not create a charge.</p>
        <p>10.7 Reveflo is the seller of Loki subscriptions. Creators must not embed their own payment or advertising scripts in games played on Loki.</p>
      </section>
      <section class="legal-article">
        <h2 id="11-privacy">11. Privacy</h2>
        <p>Personal data is handled as described in the Privacy Policy. You must not use a game to collect personal data from Players except a display name and score for that game’s leaderboard, unless you give your own lawful notice and the collection is allowed by the AUP and the Personal Data (Privacy) Ordinance (Cap. 486).</p>
      </section>
      <section class="legal-article">
        <h2 id="12-third-parties">12. Third parties</h2>
        <p>The Service depends on Stripe, Supabase, Railway, Cloudflare, GitHub, and Google, as described in the Privacy Policy. We are not responsible for their outages except to the extent Hong Kong law does not allow that exclusion.</p>
      </section>
      <section class="legal-article">
        <h2 id="13-hosted-content">13. Hosted content</h2>
        <p>13.1 Creators and Players are solely responsible for Content they upload, host, transmit, or play.</p>
        <p>13.2 We are not responsible for Game Content or User Content, including its legality, accuracy, quality, or safety. Hosting, scanning, or leaving Content online does not make us the publisher or author of that Content, and it is not an approval of that Content.</p>
        <p>13.3 We may remove Content. We have no duty to monitor all Content.</p>
      </section>
      <section class="legal-article">
        <h2 id="14-disclaimer-and-exclusion-of-liability">14. Disclaimer and exclusion of liability</h2>
        <p>14.1 The Service is provided “as is” and “as available”.</p>
        <p>14.2 To the fullest extent permitted by the Control of Exemption Clauses Ordinance (Cap. 71), the Supply of Services (Implied Terms) Ordinance (Cap. 457), the Unconscionable Contracts Ordinance (Cap. 458), and any other law of Hong Kong, we exclude all warranties, conditions, representations, and liability arising out of or in connection with the Service, any Content, or these Terms. The exclusion covers contract, tort (including negligence), statute, and any other basis, and covers direct, indirect, incidental, special, consequential, and punitive loss, including loss of profits, revenue, data, goodwill, and business, whether or not foreseeable.</p>
        <p>14.3 Nothing in these Terms excludes or limits liability for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, or for any other liability that the law of Hong Kong does not allow to be excluded.</p>
      </section>
      <section class="legal-article">
        <h2 id="15-indemnity">15. Indemnity</h2>
        <p>You will indemnify Reveflo and its officers, employees, and agents against losses, damages, liabilities, and reasonable legal costs arising out of your Content, your use of the Service, your breach of these Terms or the AUP, or your violation of law or third-party rights. This indemnity does not cover our fraud, or death or personal injury caused by our negligence.</p>
      </section>
      <section class="legal-article">
        <h2 id="16-suspension-and-termination">16. Suspension and termination</h2>
        <p>16.1 You may stop using the Service at any time. Cancel a paid Plan in the billing portal, and request Account deletion at <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a>.</p>
        <p>16.2 We may suspend or terminate access if you breach these Terms or the AUP, if the law requires it, if your use creates security, legal, or operational risk, or if we discontinue the Service.</p>
        <p>16.3 On termination, the licences you granted survive for backups, legal compliance, residual copies, and disputes. Sections 8, 13, 14, 15, 17, 18, 19, and 20 survive.</p>
      </section>
      <section class="legal-article">
        <h2 id="17-changes">17. Changes</h2>
        <p>We may amend these Terms by publishing an updated version on <a href="https://lokiplay.cc">https://lokiplay.cc</a>. The updated version is effective immediately on publication. If you object, you must email <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a> within 5 business days after publication. If you object, you must stop using the Service.</p>
      </section>
      <section class="legal-article">
        <h2 id="18-notices">18. Notices</h2>
        <p>Send legal notices to <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a> and, where formal service is required, to Reveflo Technologies Limited, The Chelsea, 69 Jervois Street, Sheung Wan, Hong Kong.</p>
      </section>
      <section class="legal-article">
        <h2 id="19-general">19. General</h2>
        <p>19.1 These Terms, the Privacy Policy, and the AUP are the entire agreement for the Service.</p>
        <p>19.2 If a provision is invalid, the rest remains in effect.</p>
        <p>19.3 A failure to enforce a provision is not a waiver.</p>
        <p>19.4 You may not assign these Terms without our consent. We may assign them to an affiliate or a successor.</p>
        <p>19.5 These Terms do not create a partnership, joint venture, or employment relationship. Creators are not our agents.</p>
        <p>19.6 A person who is not a party has no right under the Contracts (Rights of Third Parties) Ordinance (Cap. 623) to enforce these Terms.</p>
        <p>19.7 We are not liable for delay or failure caused by events beyond our reasonable control, including failures of Stripe, Cloudflare, Railway, Supabase, GitHub, or Google, or a change in law, except to the extent Section 14.3 requires.</p>
        <p>19.8 These Terms are published only in English.</p>
        <p>19.9 Electronic acceptance and stored version identifiers satisfy the Electronic Transactions Ordinance (Cap. 553) where that Ordinance applies.</p>
      </section>
      <section class="legal-article">
        <h2 id="20-governing-law">20. Governing law</h2>
        <p>20.1 These Terms are governed by the laws of the Hong Kong Special Administrative Region.</p>
        <p>20.2 The courts of Hong Kong have exclusive jurisdiction, except that we may seek injunctive relief anywhere to protect intellectual property or confidential information.</p>
        <p>Reveflo Technologies Limited</p>
        <p>Company number 74466581</p>
        <p>The Chelsea, 69 Jervois Street, Sheung Wan, Hong Kong</p>
        <p><a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a></p>
      </section>
    </article>
`;

export const privacyMain = `
    <article class="legal-page">
      <h1>Privacy Policy</h1>
      <p class="legal-updated">Last updated: 7 October 2026</p>
      <section class="legal-article">
        <h2 id="introduction">Introduction</h2>
        <p>Loki</p>
        <p>Reveflo Technologies Limited</p>
        <p>Company number: 74466581</p>
        <p>Registered office: The Chelsea, 69 Jervois Street, Sheung Wan, Hong Kong</p>
        <p>Effective date: 1 September 2026</p>
        <p>Version: privacy-2026-10-07</p>
        <p>This policy explains how Reveflo Technologies Limited, a company incorporated in Hong Kong, handles personal data for Loki. We are a data user under the Personal Data (Privacy) Ordinance (Cap. 486) (“PDPO”).</p>
        <p>This policy covers lokiplay.cc, app.lokiplay.cc, play.lokiplay.cc, docs.lokiplay.cc, api.lokiplay.cc, and per-game hosts.</p>
        <p>Privacy requests: <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a></p>
      </section>
      <section class="legal-article">
        <h2 id="1-what-we-collect">1. What we collect</h2>
        <h3>Data you give us</h3>
        <div class="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Examples</th>
                <th>Who</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Account</td>
                <td>Email address, password held by our authentication provider, authentication subject</td>
                <td>Creators</td>
              </tr>
              <tr>
                <td>Sign-in providers</td>
                <td>If you choose Google or GitHub, the identity details that provider shares for sign-in, typically an email address and a provider subject</td>
                <td>Creators</td>
              </tr>
              <tr>
                <td>Workspace</td>
                <td>Organisation name, project name, slug, role</td>
                <td>Creators</td>
              </tr>
              <tr>
                <td>Legal acceptance</td>
                <td>Document, version, time accepted</td>
                <td>Creators</td>
              </tr>
              <tr>
                <td>Billing</td>
                <td>Plan, status, period end, Stripe customer id, Stripe subscription id. Card numbers stay with Stripe</td>
                <td>Creators who subscribe</td>
              </tr>
              <tr>
                <td>GitHub, if connected for deploy</td>
                <td>Repository owner and name, installation and repository ids, branch, workflow path, webhook metadata</td>
                <td>Creators</td>
              </tr>
              <tr>
                <td>Leaderboards</td>
                <td>Display name (up to 32 characters) and score</td>
                <td>Players</td>
              </tr>
              <tr>
                <td>Reports and support</td>
                <td>Category, summary, messages you send to <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a></td>
                <td>Anyone who writes to us</td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3>Data created by use</h3>
        <div class="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Examples</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Sessions</td>
                <td>Project-scoped player or guest id, expiry, guest flag</td>
              </tr>
              <tr>
                <td>Guest cookie</td>
                <td>loki_guest_{projectId}, HttpOnly, up to 30 days, used to recognise a returning guest in that project</td>
              </tr>
              <tr>
                <td>Play</td>
                <td>Room membership, presence, matchmaking, host election, reconnects, public-room listing inside that game</td>
              </tr>
              <tr>
                <td>Server authority</td>
                <td>Prior state, tick inputs, and next state processed by the step module in Singapore</td>
              </tr>
              <tr>
                <td>Chat</td>
                <td>Lobby or match messages and room ids</td>
              </tr>
              <tr>
                <td>Invites</td>
                <td>Hashed invite tokens, expiry, issuing Creator</td>
              </tr>
              <tr>
                <td>Deployments</td>
                <td>Content hash, file list, scan findings, quarantine state, step-module hash</td>
              </tr>
              <tr>
                <td>Command-line login</td>
                <td>Hashed device and user codes, approval time, encrypted short-lived tokens</td>
              </tr>
              <tr>
                <td>Usage</td>
                <td>Game, link, room, session, and rate-limit counters</td>
              </tr>
              <tr>
                <td>Runtime reports</td>
                <td>Project id, failure kind, SDK compatibility and version. These are written to hosting logs and are not stored as account records</td>
              </tr>
              <tr>
                <td>Audit</td>
                <td>Actor, organisation, action, limited detail</td>
              </tr>
              <tr>
                <td>Technical logs</td>
                <td>Request id, IP address, user agent, timestamps, kept in hosting logs. We aim to keep tokens, chat bodies, secrets, and archives out of application logs</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>A verified email address and acceptance of the current legal versions are required for a Creator Account. You can sign in with email and password, Google, or GitHub. Guest play does not require an email address. A GitHub repository connection and a paid Plan are optional.</p>
      </section>
      <section class="legal-article">
        <h2 id="2-why-we-use-it">2. Why we use it</h2>
        <p>We use personal data to:</p>
        <p>1. Create and run Accounts, organisations, and projects.</p>
        <p>2. Authenticate users and issue or revoke sessions, invites, cookies, and credentials.</p>
        <p>3. Host, scan, sandbox, and deliver games, including the hosted SDK file.</p>
        <p>4. Run rooms, matchmaking, presence, chat, leaderboards, and step modules.</p>
        <p>5. Bill subscriptions and prevent payment fraud.</p>
        <p>6. Enforce Plan limits, rate limits, and the Acceptable Use Policy.</p>
        <p>7. Handle reports, quarantine, suspensions, and appeals.</p>
        <p>8. Operate the command-line tool, API, and GitHub connection.</p>
        <p>9. Send service, security, billing, and legal messages that you initiate or that the Service requires for the Account.</p>
        <p>10. Measure aggregate capacity and reliability.</p>
        <p>11. Comply with law and respond to the Privacy Commissioner for Personal Data.</p>
        <p>12. Establish or defend legal claims.</p>
        <p>We do not sell personal data. We do not use personal data for direct marketing. We do not use personal data for a new, unrelated purpose without your prescribed consent, unless a PDPO exemption applies.</p>
      </section>
      <section class="legal-article">
        <h2 id="3-who-receives-it">3. Who receives it</h2>
        <div class="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Role</th>
                <th>Typical location</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Supabase, platform project</td>
                <td>Authentication, including email-and-password, Google, and GitHub sign-in, and the control-plane database</td>
                <td>Singapore</td>
              </tr>
              <tr>
                <td>Supabase, multiplayer project</td>
                <td>Multiplayer persistence</td>
                <td>Singapore</td>
              </tr>
              <tr>
                <td>Railway</td>
                <td>API, web, workers, step-module compute, multiplayer compute, and service logs</td>
                <td>Singapore</td>
              </tr>
              <tr>
                <td>Cloudflare</td>
                <td>DNS, CDN, object storage, marketing site, and edge proxy</td>
                <td>Global edge</td>
              </tr>
              <tr>
                <td>Stripe</td>
                <td>Subscription checkout, customer portal, card processing, and webhooks</td>
                <td>United States and Stripe’s other locations</td>
              </tr>
              <tr>
                <td>Google</td>
                <td>Sign-in, if you choose Google</td>
                <td>Google’s operating locations</td>
              </tr>
              <tr>
                <td>GitHub</td>
                <td>Sign-in, if you choose GitHub, and optional repository connection</td>
                <td>United States and GitHub’s other locations</td>
              </tr>
              <tr>
                <td>Advisers</td>
                <td>Legal, accounting, and insurance</td>
                <td>Hong Kong and where engaged</td>
              </tr>
              <tr>
                <td>Authorities</td>
                <td>Where the law requires or allows disclosure</td>
                <td>Hong Kong and other competent jurisdictions</td>
              </tr>
              <tr>
                <td>A successor</td>
                <td>Merger, sale, or reorganisation</td>
                <td>As applicable, under this policy</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>Other Players in the same game can see presence, chat, display names, scores, and public-room listings for that game. An invite link lets the holder open that project.</p>
        <p>We do not use Cloudflare Turnstile or Sentry on the Service as of this version.</p>
      </section>
      <section class="legal-article">
        <h2 id="4-transfers-outside-hong-kong">4. Transfers outside Hong Kong</h2>
        <p>Account and multiplayer data is stored in Singapore. Cloudflare, Stripe, Google, and GitHub may process personal data in other countries. Section 33 of the PDPO is not in operation. We use contracts and access controls with these providers. Overseas law can differ from Hong Kong’s.</p>
      </section>
      <section class="legal-article">
        <h2 id="5-how-long-we-keep-it">5. How long we keep it</h2>
        <div class="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Period</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Account, membership, legal acceptance, billing ids</td>
                <td>Life of the Account, then up to 7 years</td>
              </tr>
              <tr>
                <td>Game artifacts and step modules</td>
                <td>Until the project or Account is deleted, plus backups up to 90 days, unless quarantined or under a legal hold</td>
              </tr>
              <tr>
                <td>Chat</td>
                <td>90 days, or longer while a safety case is open</td>
              </tr>
              <tr>
                <td>Guest cookie</td>
                <td>Up to 30 days</td>
              </tr>
              <tr>
                <td>Player session tokens</td>
                <td>Until they expire, within 15 minutes</td>
              </tr>
              <tr>
                <td>Usage and rate-limit counters</td>
                <td>Current period plus 13 months</td>
              </tr>
              <tr>
                <td>Reports and security findings</td>
                <td>Until resolved, then up to 3 years</td>
              </tr>
              <tr>
                <td>Audit records</td>
                <td>Up to 7 years</td>
              </tr>
              <tr>
                <td>GitHub connection metadata</td>
                <td>Life of the connection, then up to 1 year</td>
              </tr>
              <tr>
                <td>Support mail</td>
                <td>Up to 3 years after the thread closes</td>
              </tr>
              <tr>
                <td>Runtime reports and HTTP request logs</td>
                <td>Only in Railway service logs for the production project, for the retention period Railway applies to those logs, and not in the Loki account database</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="legal-article">
        <h2 id="6-direct-marketing">6. Direct marketing</h2>
        <p>We do not use your personal data for direct marketing, and we do not provide it to other businesses for their direct marketing. Service, security, and billing messages are not direct marketing. If we later want to send direct marketing, we will ask for the consent required by Part VIA of the PDPO before we do so.</p>
      </section>
      <section class="legal-article">
        <h2 id="7-security">7. Security</h2>
        <p>We use TLS on public endpoints, hashed secrets and invites, short-lived sessions, separate platform and multiplayer databases, sandboxed game origins, and operator access control. Passwords are held by Supabase Auth, not in the Loki application database. No method of storage or transmission is completely secure.</p>
        <p>Hong Kong law does not currently impose a general statutory duty to notify personal-data breaches. We will tell affected people and the Privacy Commissioner where we consider it appropriate or where the law requires it.</p>
      </section>
      <section class="legal-article">
        <h2 id="8-access-and-correction">8. Access and correction</h2>
        <p>You may ask to access or correct personal data we hold about you. Write to <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a>. We will respond within 40 days, or explain a refusal or extension the PDPO allows. We may charge a fee that is not excessive.</p>
        <p>You may complain to the Privacy Commissioner for Personal Data, Hong Kong: <a href="https://www.pcpd.org.hk">https://www.pcpd.org.hk</a></p>
      </section>
      <section class="legal-article">
        <h2 id="9-children">9. Children</h2>
        <p>You must be at least 13 years old to use the Service. We do not knowingly collect personal data from children under 13. If you are under 18, a parent or legal guardian must accept the Terms for you. If you are a parent and believe we hold data from a child under 13, contact <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a>.</p>
      </section>
      <section class="legal-article">
        <h2 id="10-automated-review">10. Automated review</h2>
        <p>Uploads and step modules are scanned, and some are reviewed with automated tools, for malware, phishing, credential theft, mining, prohibited advertising, and unsafe code. A high-confidence finding can quarantine a deployment. Uncertain findings can wait for a person. This is security processing.</p>
      </section>
      <section class="legal-article">
        <h2 id="11-creators-who-collect-data">11. Creators who collect data</h2>
        <p>HTML forms in uploaded builds are rejected. If you collect personal data from Players through game code, you are the data user for that collection and must give your own PDPO notice. A leaderboard display name and score for that game is the collection this Service provides.</p>
      </section>
      <section class="legal-article">
        <h2 id="12-cookies">12. Cookies</h2>
        <p>We use a strictly necessary guest cookie, loki_guest_{projectId}, and similar storage for sign-in, security, and load balancing. We do not use advertising cookies. If a cookie is personal data, the PDPO applies. Blocking strictly necessary cookies can stop play or sign-in.</p>
      </section>
      <section class="legal-article">
        <h2 id="13-changes">13. Changes</h2>
        <p>We may amend this policy by publishing an updated version on <a href="https://lokiplay.cc">https://lokiplay.cc</a>. The updated version is effective immediately on publication. If you object, you must email <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a> within 5 business days after publication. If you object, you must stop using the Service.</p>
        <p>This policy is published only in English. It describes our PDPO practices. It does not limit a right the PDPO gives you. Contractual disputes about the Service follow the Terms of Service, which are governed by Hong Kong law and the exclusive jurisdiction of the Hong Kong courts.</p>
        <p>Reveflo Technologies Limited</p>
        <p>Company number 74466581</p>
        <p>The Chelsea, 69 Jervois Street, Sheung Wan, Hong Kong</p>
        <p><a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a></p>
      </section>
    </article>
`;

export const aupMain = `
    <article class="legal-page">
      <h1>Acceptable Use Policy</h1>
      <p class="legal-updated">Last updated: 7 October 2026</p>
      <section class="legal-article">
        <h2 id="introduction">Introduction</h2>
        <p>Loki</p>
        <p>Reveflo Technologies Limited</p>
        <p>Company number: 74466581</p>
        <p>Registered office: The Chelsea, 69 Jervois Street, Sheung Wan, Hong Kong</p>
        <p>Effective date: 1 September 2026</p>
        <p>Version: aup-2026-10-07</p>
        <p>This Acceptable Use Policy is part of the Terms of Service. It applies to uploads, play, chat, leaderboards, SDKs, APIs, the command-line tool, GitHub connections, step modules, and guest access.</p>
        <p>“Business day” means a day other than a Saturday, a Sunday, or a public holiday in Hong Kong.</p>
        <p>Report violations in the product or at <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a>.</p>
      </section>
      <section class="legal-article">
        <h2 id="1-purpose">1. Purpose</h2>
        <p>Loki hosts games and runs shared multiplayer infrastructure. This policy protects Players, Creators, and the public, and supports compliance with Hong Kong law, including the Crimes Ordinance (Cap. 200), the Control of Obscene and Indecent Articles Ordinance (Cap. 390), the Prevention of Child Pornography Ordinance (Cap. 405), the Copyright Ordinance (Cap. 528), and the Personal Data (Privacy) Ordinance (Cap. 486).</p>
      </section>
      <section class="legal-article">
        <h2 id="2-prohibited-content">2. Prohibited content</h2>
        <p>You must not upload, host, link, or transmit Content that:</p>
        <p>1. Contains pornography.</p>
        <p>2. Depicts or promotes violence.</p>
        <p>3. Depicts, promotes, or assists criminal activity.</p>
        <p>4. Depicts or promotes alcohol.</p>
        <p>5. Involves real-money gambling, betting, or a betting intermediary.</p>
        <p>6. Depicts or requests the sexual exploitation of anyone under 18, including generated images. We will preserve what the law requires and report to the Hong Kong Police Force.</p>
        <p>7. Is obscene under Cap. 390.</p>
        <p>8. Infringes copyright, trade marks, or other intellectual property rights. AI-assisted assets still require rights you actually have.</p>
        <p>9. Unlawfully discloses another person’s personal data, or is unlawful defamation.</p>
        <p>10. Impersonates Reveflo, Loki, another user, or a public authority.</p>
        <p>11. Contains malware, exploits, phishing, credential theft, ransomware, or cryptocurrency mining.</p>
        <p>12. Contains third-party advertising, tracking, or payment scripts.</p>
        <p>13. Exists to spam, scrape, or deceptively redirect Players.</p>
      </section>
      <section class="legal-article">
        <h2 id="3-prohibited-conduct">3. Prohibited conduct</h2>
        <p>You must not:</p>
        <p>1. Attack, overload, or probe the Service or other users, including session minting and matchmaking abuse.</p>
        <p>2. Bypass authentication, sandboxing, content security policy, quotas, rate limits, or a disabled project. Do not forge project ids, player ids, or session tokens.</p>
        <p>3. Enter another organisation’s projects, rooms, leaderboards, or storage.</p>
        <p>4. Use Loki multiplayer from an external production host.</p>
        <p>5. Publish private invites, deployment credentials, or access tokens.</p>
        <p>6. Open new Accounts or flood guest sessions to evade a suspension or a Plan cap.</p>
        <p>7. Cache, intercept, or replace /loki/sdk.js with a game service worker, or import the SDK from a game Web Worker.</p>
        <p>8. Ship remote scripts, inline scripts, a Creator backend, or a step module that imports modules, reaches the network, reads the DOM, or depends on anything other than the previous state and that tick’s inputs.</p>
        <p>9. Submit false reports, or interfere with a quarantine or investigation.</p>
        <p>10. Use chat to harass, stalk, or sexually solicit anyone.</p>
        <p>11. Collect personal data from Players beyond a leaderboard display name and score, unless you provide your own lawful notice.</p>
        <p>12. Connect a GitHub repository you are not allowed to connect.</p>
        <p>13. Abuse Stripe, use a stolen payment method, or misrepresent a chargeback.</p>
        <p>14. Break the law of Hong Kong or of the place you use the Service from.</p>
      </section>
      <section class="legal-article">
        <h2 id="4-rooms-hosts-and-scores">4. Rooms, hosts, and scores</h2>
        <p>Using a host, a public room, a score submission, or a step module to deliver malware, crash other people’s sessions, spoof another project, or move prohibited content is a breach of this policy. Client-submitted scores are not treated as verified results.</p>
      </section>
      <section class="legal-article">
        <h2 id="5-age">5. Age</h2>
        <p>You must be at least 13 years old. Sexual content involving anyone under 18 is prohibited. Do not require a Player under 18 to hand over personal data beyond a leaderboard display name as a condition of play.</p>
      </section>
      <section class="legal-article">
        <h2 id="6-enforcement">6. Enforcement</h2>
        <p>We may scan every upload and step module. High-confidence malware, credential theft, phishing, mining, and prohibited advertising can be quarantined automatically. We may disable a deployment, revoke credentials, suspend an Account, and stop play for one project or for the Service.</p>
        <p>We are not responsible for Content users host. We may still remove it.</p>
        <p>We may keep and disclose data to the Hong Kong Police Force or under compulsory Hong Kong process where we believe a crime has occurred or the law requires it.</p>
      </section>
      <section class="legal-article">
        <h2 id="7-reports-and-infringement-notices">7. Reports and infringement notices</h2>
        <p>Include the project or URL, the time, the category, and what you saw. We will acknowledge a complete intellectual-property notice within 5 business days. We may not tell you the outcome of a player report.</p>
        <p>Do not send illegal images of children to <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a>. Contact the Hong Kong Police Force and tell us the report number.</p>
      </section>
      <section class="legal-article">
        <h2 id="8-changes">8. Changes</h2>
        <p>We may amend this policy by publishing an updated version on <a href="https://lokiplay.cc">https://lokiplay.cc</a>. The updated version is effective immediately on publication. If you object, you must email <a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a> within 5 business days after publication. If you object, you must stop using the Service.</p>
        <p>This policy is published only in English.</p>
        <p>Reveflo Technologies Limited</p>
        <p>Company number 74466581</p>
        <p>The Chelsea, 69 Jervois Street, Sheung Wan, Hong Kong</p>
        <p><a href="mailto:contact@lokiplay.cc">contact@lokiplay.cc</a></p>
      </section>
    </article>
`;
