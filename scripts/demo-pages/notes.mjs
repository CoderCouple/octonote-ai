// Five standalone example notes, ordered simple → complex.
import { n } from "./build.mjs";

export const notes = [
  // 1 — simple: headings, bullets, a checklist
  {
    slugHint: "tcp-vs-udp",
    level: "Simple",
    title: "TCP vs UDP — cheat sheet",
    blocks: [
      n.p("A one-screen cheat sheet. Just headings, lists and a checklist — the simplest kind of note."),
      n.h(2, "TCP"),
      n.bullet("**Connection-oriented:** three-way handshake before any data."),
      n.bullet("**Reliable:** retransmits lost packets, delivers in order."),
      n.bullet("**Flow and congestion control** so it doesn't flood the network."),
      n.bullet("Used by: HTTP/1.1 and HTTP/2, SSH, email, databases."),
      n.h(2, "UDP"),
      n.bullet("**Connectionless:** just send datagrams."),
      n.bullet("**No delivery or ordering guarantees** — the app handles loss if it cares."),
      n.bullet("**Low overhead and latency.**"),
      n.bullet("Used by: DNS, video calls, online games, QUIC (HTTP/3)."),
      n.h(2, "Pick UDP when…"),
      n.todo("Late data is worse than lost data (voice, video, games)", true),
      n.todo("Messages are tiny and fit in one packet (DNS)", true),
      n.todo("You need reliable, ordered bytes (file transfer)", false),
      n.quote("Rule of thumb: TCP for correctness, UDP for timeliness."),
    ],
  },

  // 2 — light: inline code + inline math
  {
    slugHint: "big-o",
    level: "Simple+",
    title: "Big-O for everyday data structures",
    blocks: [
      n.p("Inline math and code mixed into plain text — e.g. a hash map lookup is $O(1)$ on average and you call it with `map.get(key)`."),
      n.h(2, "Arrays and lists"),
      n.bullet("Index access `a[i]`: $O(1)$"),
      n.bullet("Search unsorted: $O(n)$ · search sorted (binary search): $O(\\log n)$"),
      n.bullet("Insert at end (dynamic array): amortised $O(1)$ · insert at front: $O(n)$"),
      n.h(2, "Hash maps"),
      n.bullet("Get / put / delete: $O(1)$ average, $O(n)$ worst case when everything collides."),
      n.h(2, "Trees and heaps"),
      n.bullet("Balanced BST search / insert / delete: $O(\\log n)$"),
      n.bullet("Heap push / pop: $O(\\log n)$ · peek: $O(1)$"),
      n.h(2, "Sorting"),
      n.bullet("Merge sort, heap sort: $O(n \\log n)$ always."),
      n.bullet("Quick sort: $O(n \\log n)$ average, $O(n^2)$ worst."),
      n.bullet("Counting sort: $O(n + k)$ when keys are small integers."),
      n.h(2, "Growth at a glance"),
      n.p("For $n = 10^6$: $\\log n \\approx 20$, $n \\log n \\approx 2 \\times 10^7$, $n^2 = 10^{12}$ — the difference between milliseconds and days."),
    ],
  },

  // 3 — math-heavy: block equations + worked numbers
  {
    slugHint: "bayes",
    level: "Medium",
    title: "Bayes' theorem and the 99%-accurate test",
    blocks: [
      n.p("A medical test is 99% accurate. You test positive. What's the chance you actually have the disease? Most people say 99%. The real answer is usually far lower."),
      n.h(2, "The theorem"),
      n.math(String.raw`P(D \mid +) = \frac{P(+ \mid D)\, P(D)}{P(+)}`),
      n.p("where the denominator sums over both ways to test positive:"),
      n.math(String.raw`P(+) = P(+ \mid D)\,P(D) + P(+ \mid \neg D)\,P(\neg D)`),
      n.h(2, "Plug in numbers"),
      n.bullet("Prevalence $P(D) = 0.001$ (1 in 1,000)"),
      n.bullet("Sensitivity $P(+ \\mid D) = 0.99$"),
      n.bullet("False-positive rate $P(+ \\mid \\neg D) = 0.01$"),
      n.math(String.raw`P(D \mid +) = \frac{0.99 \times 0.001}{0.99 \times 0.001 + 0.01 \times 0.999} = \frac{0.00099}{0.01098} \approx 9\%`),
      n.h(2, "Why so low?"),
      n.p("Picture 100,000 people. **100** are sick and 99 of them test positive. Of the **99,900** healthy people, 1% — about **999** — also test positive. So only 99 of 1,098 positives are real."),
      n.quote("When a condition is rare, false positives outnumber true positives — even with an accurate test."),
      n.h(2, "Test twice"),
      n.p("Use the posterior as the new prior. After a second independent positive:"),
      n.math(String.raw`P(D \mid ++) = \frac{0.99 \times 0.09}{0.99 \times 0.09 + 0.01 \times 0.91} \approx 91\%`),
    ],
  },

  // 4 — diagrams + code
  {
    slugHint: "git-workflow",
    level: "Medium+",
    title: "A Git branching workflow that scales",
    blocks: [
      n.p("Diagram-as-code next to real commands: the Mermaid block renders the branch history, the code blocks are copy-pasteable."),
      n.h(2, "The shape of history"),
      n.mermaid(`
gitGraph
  commit id: "init"
  branch feature/login
  checkout feature/login
  commit id: "form"
  commit id: "validation"
  checkout main
  branch fix/typo
  commit id: "typo"
  checkout main
  merge fix/typo
  merge feature/login
  commit id: "release 1.2" tag: "v1.2.0"
`),
      n.h(2, "Daily loop"),
      n.code("bash", `
git switch main && git pull --rebase
git switch -c feature/login
# …work, small commits…
git push -u origin feature/login
gh pr create --fill
`),
      n.h(2, "Keep the branch fresh"),
      n.code("bash", `
git fetch origin
git rebase origin/main      # replay your commits on top
git push --force-with-lease # safe force-push
`),
      n.h(2, "Rules that keep main green"),
      n.num("Branches live **less than two days**."),
      n.num("Every merge goes through a **pull request** with CI passing."),
      n.num("**Squash-merge** features, so `main` reads like a changelog."),
      n.num("Release by **tagging** `main` — no long-lived release branches."),
    ],
  },

  // 5 — complex: everything together
  {
    slugHint: "rate-limiter",
    level: "Complex",
    title: "Designing a distributed rate limiter",
    blocks: [
      n.p("A full system-design note: requirements, algorithm comparison, the maths of the token bucket, two diagrams, production code and a launch checklist."),
      n.h(2, "Requirements"),
      n.bullet("Limit each API key to **100 requests per minute**, across **20 app servers**."),
      n.bullet("Decision in **under 2 ms**; when the limiter is down, **fail open**."),
      n.bullet("Return `429 Too Many Requests` with a `Retry-After` header."),
      n.h(2, "Choosing an algorithm"),
      n.bullet("**Fixed window:** simple, but allows 2× bursts at window edges."),
      n.bullet("**Sliding log:** exact, but stores every timestamp — $O(n)$ memory per key."),
      n.bullet("**Sliding window counter:** weighted mix of two windows; cheap and close enough."),
      n.bullet("**Token bucket:** allows controlled bursts, $O(1)$ state. ✅ Our pick."),
      n.h(2, "Token bucket maths"),
      n.p("A bucket holds at most $b$ tokens and refills at rate $r$ tokens per second. At time $t$, after the last update at $t_0$:"),
      n.math(String.raw`\text{tokens}(t) = \min\!\big(b,\; \text{tokens}(t_0) + r\,(t - t_0)\big)`),
      n.p("A request is allowed if $\\text{tokens}(t) \\ge 1$, then one token is removed. Over any interval of length $T$ at most $b + rT$ requests pass. For 100/min with bursts of 20: $r = \\tfrac{100}{60} \\approx 1.67$, $b = 20$."),
      n.h(2, "Architecture"),
      n.mermaid(`
flowchart LR
  C[Clients] --> G[API gateway]
  G --> L{Rate limiter}
  L -- allowed --> S[App servers]
  L -- 429 --> C
  L <--> R[(Redis cluster)]
  S --> DB[(Database)]
`),
      n.h(2, "One request, atomically"),
      n.mermaid(`
sequenceDiagram
  participant G as Gateway
  participant R as Redis
  G->>R: EVALSHA token_bucket key, now, rate, burst
  R-->>G: allowed=1, tokens=13
  Note over G,R: read + refill + decrement in one Lua script — no race
  G->>R: EVALSHA token_bucket key, now, rate, burst
  R-->>G: allowed=0, retry_after=0.6s
`),
      n.h(2, "The Lua script"),
      n.code("lua", `
-- KEYS[1] = bucket key; ARGV = now, rate, burst
local now, rate, burst = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local b = redis.call("HMGET", KEYS[1], "tokens", "ts")
local tokens = tonumber(b[1]) or burst
local ts = tonumber(b[2]) or now
tokens = math.min(burst, tokens + (now - ts) * rate)
local allowed = tokens >= 1
if allowed then tokens = tokens - 1 end
redis.call("HSET", KEYS[1], "tokens", tokens, "ts", now)
redis.call("PEXPIRE", KEYS[1], math.ceil(burst / rate * 1000))
if allowed then return {1, tokens} end
return {0, (1 - tokens) / rate}
`),
      n.h(2, "Failure modes"),
      n.bullet("**Redis down:** fail open with a local in-memory bucket per server ($\\tfrac{1}{20}$ of the limit)."),
      n.bullet("**Hot key:** one abusive key hammers one shard — add a local pre-check cache."),
      n.bullet("**Clock skew:** use Redis `TIME`, not the app server clock."),
      n.h(2, "Launch checklist"),
      n.todo("Shadow mode: log decisions for a week without blocking", true),
      n.todo("Dashboards: allowed vs blocked per key, p99 latency", true),
      n.todo("Per-plan limits loaded from config, not code", false),
      n.todo("Alert when more than 5% of traffic is blocked", false),
      n.quote("Start in shadow mode. A rate limiter that blocks real customers on day one is worse than none."),
    ],
  },
];
