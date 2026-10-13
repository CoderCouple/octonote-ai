// The five outreach demo projects (Phase 1 plan): one per creator segment.
// Each is a project = one note + one canvas, opened in split view.
import { n, canvas } from "./build.mjs";

export const projects = [
  // ---------------------------------------------------------------- system design
  {
    slugHint: "url-shortener",
    name: "How a URL shortener works",
    icon: "🔗",
    description: "System design walkthrough: requirements, ID generation, caching and the redirect path.",
    blocks: [
      n.p("A URL shortener turns `https://example.com/a/very/long/path?ref=newsletter` into `sho.rt/aZ3kQ9x` and redirects anyone who opens it. Simple to describe, and a great tour of **read-heavy system design**."),
      n.h(2, "Requirements"),
      n.bullet("**Functional:** create a short link, redirect to the original, optional custom alias and expiry."),
      n.bullet("**Non-functional:** redirects in under 50 ms at p99, highly available, links never collide."),
      n.bullet("**Traffic:** 100M new links a month, read:write ratio about **100:1**."),
      n.h(2, "Back-of-the-envelope"),
      n.p("Writes per second, averaged over a month:"),
      n.math(String.raw`\frac{100 \times 10^{6}}{30 \times 24 \times 3600} \approx 40 \ \text{writes/s} \quad\Rightarrow\quad \approx 4{,}000 \ \text{reads/s}`),
      n.p("How long must the code be? With the 62 characters `[a-zA-Z0-9]` and length $k$ we get $62^k$ codes:"),
      n.math(String.raw`62^{7} \approx 3.5 \times 10^{12} \gg 100\text{M} \times 12 \times 10 \ \text{years} = 1.2 \times 10^{10}`),
      n.p("So **7 characters** last for centuries."),
      n.h(2, "Generating the code"),
      n.p("Hashing the long URL invites collisions. Instead, take a unique 64-bit ID from a counter service (or Snowflake-style IDs) and **base62-encode** it:"),
      n.code("python", `
ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

def base62(n: int) -> str:
    if n == 0:
        return ALPHABET[0]
    out = []
    while n:
        n, r = divmod(n, 62)
        out.append(ALPHABET[r])
    return "".join(reversed(out))
`),
      n.h(2, "The redirect path"),
      n.p("The hot path is a cache lookup. Only misses touch the database:"),
      n.mermaid(`
sequenceDiagram
  participant U as Browser
  participant A as App server
  participant C as Redis
  participant D as Database
  U->>A: GET /aZ3kQ9x
  A->>C: GET aZ3kQ9x
  alt cache hit
    C-->>A: long URL
  else miss
    A->>D: SELECT long_url
    D-->>A: long URL
    A->>C: SET aZ3kQ9x (TTL 24h)
  end
  A-->>U: 301 / 302 Location
`),
      n.h(2, "Trade-offs worth discussing"),
      n.bullet("**301 vs 302:** 301 is cached by browsers (less load), 302 lets you count every click."),
      n.bullet("**Counter as a single point of failure:** hand out ID ranges in blocks of 1,000 per app server."),
      n.bullet("**Hot links:** a viral link is one cache key. Replicate it or keep it in an in-process LRU."),
      n.quote("The canvas on the right is the whole architecture on one page. Drag it, zoom it, or open it full screen."),
    ],
    canvas: canvas((c) => {
      c.text("title", 0, -110, 900, "URL shortener — high-level architecture", { size: "l" });
      c.box("user", 0, 120, 160, 80, "Browser", { geo: "ellipse" });
      c.box("lb", 240, 120, 160, 80, "Load balancer");
      c.group("apps", 470, 0, 260, 320, "App servers (stateless)");
      c.box("app1", 510, 50, 180, 70, "App server 1");
      c.box("app2", 510, 140, 180, 70, "App server 2");
      c.box("app3", 510, 230, 180, 70, "App server N");
      c.box("cache", 840, 20, 200, 90, "Redis cache\nshort → long", { fill: "solid", color: "light-blue" });
      c.box("db", 840, 200, 200, 90, "Database\nlinks table", { geo: "rectangle", fill: "semi" });
      c.box("ids", 510, 400, 180, 80, "ID service\n(ranges of 1,000)");
      c.box("analytics", 840, 400, 200, 80, "Click analytics\n(async queue)", { dash: "dashed" });
      c.arrow("user", "lb", "GET /aZ3kQ9x");
      c.arrow("lb", "app2");
      c.arrow("app2", "cache", "1. lookup");
      c.arrow("app2", "db", "2. on miss");
      c.arrow("app1", "ids", "new link", { bend: -40 });
      c.arrow("app3", "analytics", "click event", { dash: "dashed" });
      c.text("note", 0, 330, 420, "Reads: ~4,000/s · Writes: ~40/s\n7-char base62 code → 3.5 × 10¹² links", { color: "grey" });
    }),
  },

  // ---------------------------------------------------------------- algorithms
  {
    slugHint: "dijkstra",
    name: "Dijkstra's shortest path, visually",
    icon: "🧭",
    description: "Dijkstra's algorithm on a small weighted graph: intuition, code, complexity and a worked trace.",
    blocks: [
      n.p("Dijkstra's algorithm finds the cheapest path from one source to every other node in a graph with **non-negative** edge weights. The canvas shows the example graph; the note walks through it step by step."),
      n.h(2, "The idea in one sentence"),
      n.quote("Always settle the closest unsettled node next. Its distance can never improve later, because every other route is already at least as long."),
      n.h(2, "Relaxation"),
      n.p("For an edge $u \\to v$ with weight $w(u,v)$, relaxing it means:"),
      n.math(String.raw`d[v] \leftarrow \min\big(d[v],\; d[u] + w(u,v)\big)`),
      n.h(2, "Code"),
      n.code("python", `
import heapq

def dijkstra(graph, source):
    dist = {node: float("inf") for node in graph}
    dist[source] = 0
    heap = [(0, source)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue  # stale entry
        for v, w in graph[u]:
            if d + w < dist[v]:
                dist[v] = d + w
                heapq.heappush(heap, (dist[v], v))
    return dist
`),
      n.h(2, "Worked trace from A"),
      n.num("Settle **A** (0). Relax: B = 4, C = 2."),
      n.num("Settle **C** (2). Relax: B = min(4, 2+1) = **3**, D = 2+8 = 10, E = 2+10 = 12."),
      n.num("Settle **B** (3). Relax: D = min(10, 3+5) = **8**."),
      n.num("Settle **D** (8). Relax: E = min(12, 8+2) = **10**."),
      n.num("Settle **E** (10). Done."),
      n.p("Final distances: A 0 · B 3 · C 2 · D 8 · E 10."),
      n.mermaid(`
flowchart LR
  A((A)) -- 4 --> B((B))
  A -- 2 --> C((C))
  C -- 1 --> B
  B -- 5 --> D((D))
  C -- 8 --> D
  C -- 10 --> E((E))
  D -- 2 --> E
`),
      n.h(2, "Complexity"),
      n.p("With a binary heap each edge can push once and each pop costs $\\log V$:"),
      n.math(String.raw`O\big((V + E)\log V\big)`),
      n.h(2, "Common mistakes"),
      n.bullet("Using it with **negative weights**. Use Bellman–Ford instead."),
      n.bullet("Forgetting the **stale entry** check, which makes it slow on dense graphs."),
      n.bullet("Marking a node visited when it is **pushed** instead of when it is **popped**."),
    ],
    canvas: canvas((c) => {
      c.text("title", 0, -120, 800, "Example graph — shortest paths from A", { size: "l" });
      c.box("A", 0, 160, 90, 90, "A\nd=0", { geo: "ellipse", fill: "solid", color: "light-green" });
      c.box("C", 260, 300, 90, 90, "C\nd=2", { geo: "ellipse" });
      c.box("B", 260, 20, 90, 90, "B\nd=3", { geo: "ellipse" });
      c.box("D", 560, 20, 90, 90, "D\nd=8", { geo: "ellipse" });
      c.box("E", 560, 300, 90, 90, "E\nd=10", { geo: "ellipse" });
      c.arrow("A", "B", "4", { dash: "dotted", color: "grey" });
      c.arrow("A", "C", "2");
      c.arrow("C", "B", "1");
      c.arrow("B", "D", "5");
      c.arrow("C", "D", "8", { dash: "dotted", color: "grey" });
      c.arrow("C", "E", "10", { dash: "dotted", color: "grey" });
      c.arrow("D", "E", "2");
      c.box("pq", 760, 60, 260, 290,
        "Priority queue (min-heap)\n\n(0, A)\n(2, C)\n(3, B)\n(8, D)\n(10, E)\n\npop order = settle order",
        { align: "start", verticalAlign: "start" });
      c.text("legend", 0, 450, 700, "Solid arrows = shortest-path tree · dotted = relaxed but not used", { color: "grey" });
    }),
  },

  // ---------------------------------------------------------------- math
  {
    slugHint: "gradient-descent",
    name: "Gradient descent, from intuition to update rule",
    icon: "📉",
    description: "Why stepping against the gradient works, how the learning rate changes everything, and a 10-line implementation.",
    blocks: [
      n.p("Gradient descent is how almost every model learns. You stand somewhere on a loss surface and repeatedly take a step **downhill**. The canvas sketches the loop; the note derives the rule."),
      n.h(2, "The setup"),
      n.p("We have parameters $\\theta$ and a loss $L(\\theta)$ that measures how wrong the model is. We want:"),
      n.math(String.raw`\theta^{*} = \arg\min_{\theta} L(\theta)`),
      n.h(2, "Why the negative gradient?"),
      n.p("A first-order Taylor expansion around $\\theta$ for a small step $\\Delta$:"),
      n.math(String.raw`L(\theta + \Delta) \approx L(\theta) + \nabla L(\theta)^{\top}\Delta`),
      n.p("Among all steps of a fixed length, $\\nabla L^{\\top}\\Delta$ is most negative when $\\Delta$ points exactly opposite the gradient. That gives the update rule:"),
      n.math(String.raw`\theta_{t+1} = \theta_{t} - \eta \, \nabla L(\theta_{t})`),
      n.p("Here $\\eta$ is the **learning rate**, the size of each step."),
      n.h(2, "A worked example"),
      n.p("Take $L(\\theta) = \\theta^2$, so $\\nabla L = 2\\theta$. Start at $\\theta_0 = 4$ with $\\eta = 0.25$:"),
      n.math(String.raw`\theta_{t+1} = \theta_t - 0.25 \cdot 2\theta_t = 0.5\,\theta_t \;\Rightarrow\; 4,\ 2,\ 1,\ 0.5,\ \dots \to 0`),
      n.h(2, "The learning rate decides everything"),
      n.bullet("$\\eta = 0.25$: halves the distance every step. Smooth convergence."),
      n.bullet("$\\eta = 1$: $\\theta_{t+1} = -\\theta_t$. Bounces between 4 and −4 forever."),
      n.bullet("$\\eta > 1$: every step overshoots further. **Diverges.**"),
      n.p("For this loss, convergence needs $0 < \\eta < 1$. In general the bound depends on the curvature: $\\eta < 2 / \\lambda_{\\max}$ of the Hessian."),
      n.h(2, "The training loop"),
      n.mermaid(`
flowchart LR
  A[Initialise θ] --> B[Compute loss L θ]
  B --> C[Compute gradient ∇L]
  C --> D[θ ← θ − η∇L]
  D --> E{Converged?}
  E -- no --> B
  E -- yes --> F[Done]
`),
      n.h(2, "Ten lines of code"),
      n.code("python", `
def gradient_descent(grad, theta, lr=0.1, steps=100, tol=1e-8):
    for _ in range(steps):
        step = lr * grad(theta)
        theta = theta - step
        if abs(step) < tol:
            break
    return theta

gradient_descent(lambda t: 2 * t, theta=4.0, lr=0.25)  # → ~0.0
`),
    ],
    canvas: canvas((c) => {
      c.text("title", 0, -120, 900, "Gradient descent on L(θ) = θ²", { size: "l" });
      c.box("t0", 0, 0, 130, 70, "θ₀ = 4\nL = 16");
      c.box("t1", 200, 120, 130, 70, "θ₁ = 2\nL = 4");
      c.box("t2", 400, 220, 130, 70, "θ₂ = 1\nL = 1");
      c.box("t3", 600, 290, 130, 70, "θ₃ = 0.5\nL = 0.25");
      c.box("min", 800, 330, 130, 70, "θ* = 0\nminimum", { fill: "solid", color: "light-green" });
      c.arrow("t0", "t1", "−η∇L");
      c.arrow("t1", "t2", "−η∇L");
      c.arrow("t2", "t3", "−η∇L");
      c.arrow("t3", "min", "…", { dash: "dotted" });
      c.group("lr", 0, 470, 930, 190, "What the learning rate does");
      c.box("small", 30, 520, 270, 110, "η = 0.25\nsmooth, halves each step", { fill: "none" });
      c.box("one", 330, 520, 270, 110, "η = 1\nbounces 4 → −4 → 4", { fill: "none", dash: "dashed" });
      c.box("big", 630, 520, 270, 110, "η > 1\ndiverges", { fill: "none", color: "red", labelColor: "red" });
    }),
  },

  // ---------------------------------------------------------------- devops
  {
    slugHint: "kubectl-apply",
    name: "What happens when you run kubectl apply",
    icon: "☸️",
    description: "From a YAML file to running containers: the API server, etcd, controllers, the scheduler and the kubelet.",
    blocks: [
      n.p("You type `kubectl apply -f deployment.yaml` and, seconds later, pods are running. In between, **six components** cooperate without ever calling each other directly. They all just watch the API server."),
      n.h(2, "The manifest"),
      n.code("yaml", `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels: { app: web }
  template:
    metadata:
      labels: { app: web }
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports: [{ containerPort: 80 }]
`),
      n.h(2, "Step by step"),
      n.num("**kubectl** validates the file, computes a diff and sends it to the **API server**."),
      n.num("The API server authenticates you, runs admission controllers and writes the Deployment to **etcd**."),
      n.num("The **Deployment controller** notices it and creates a **ReplicaSet**."),
      n.num("The **ReplicaSet controller** creates 3 **Pod** objects with no node assigned."),
      n.num("The **scheduler** picks a node for each pod (resources, affinity, taints) and writes the binding."),
      n.num("The **kubelet** on that node sees a pod bound to it, pulls the image and starts the container via the runtime."),
      n.mermaid(`
sequenceDiagram
  participant K as kubectl
  participant A as API server
  participant E as etcd
  participant C as Controllers
  participant S as Scheduler
  participant L as Kubelet
  K->>A: apply Deployment
  A->>E: persist
  C-->>A: watch: new Deployment
  C->>A: create ReplicaSet + 3 Pods
  S-->>A: watch: unscheduled Pods
  S->>A: bind Pod → node-2
  L-->>A: watch: Pod on node-2
  L->>L: pull image, start container
  L->>A: status: Running
`),
      n.h(2, "The key idea: reconciliation"),
      n.p("Every controller runs the same loop: compare **desired state** (in etcd) with **actual state**, then act to close the gap. That is why deleting a pod just makes a new one appear."),
      n.quote("Nothing in Kubernetes calls anything else. Everything watches the API server and reconciles."),
      n.h(2, "Check it yourself"),
      n.code("bash", `
kubectl apply -f deployment.yaml
kubectl get events --sort-by=.metadata.creationTimestamp
kubectl get pods -o wide -w
`),
    ],
    canvas: canvas((c) => {
      c.text("title", 0, -110, 1000, "kubectl apply → running pods", { size: "l" });
      c.box("kubectl", 0, 170, 150, 80, "kubectl", { geo: "ellipse" });
      c.group("cp", 230, 0, 560, 420, "Control plane");
      c.box("api", 270, 160, 180, 100, "API server", { fill: "solid", color: "light-blue" });
      c.box("etcd", 560, 50, 190, 80, "etcd\n(desired state)");
      c.box("ctrl", 560, 180, 190, 80, "Controllers\nDeployment · ReplicaSet");
      c.box("sched", 560, 310, 190, 80, "Scheduler");
      c.group("node", 870, 90, 280, 330, "Worker node-2");
      c.box("kubelet", 910, 140, 200, 80, "kubelet");
      c.box("pods", 910, 290, 200, 90, "Pods ×3\nnginx:1.27", { fill: "solid", color: "light-green" });
      c.arrow("kubectl", "api", "apply");
      c.arrow("api", "etcd", "persist");
      c.arrow("ctrl", "api", "watch / create", { dash: "dashed" });
      c.arrow("sched", "api", "bind pod", { dash: "dashed" });
      c.arrow("kubelet", "api", "watch", { dash: "dashed", bend: 40 });
      c.arrow("kubelet", "pods", "start");
      c.text("legend", 0, 470, 900, "Dashed = components watch the API server; nothing calls each other directly.", { color: "grey" });
    }),
  },

  // ---------------------------------------------------------------- ml
  {
    slugHint: "self-attention",
    name: "Self-attention in one page",
    icon: "🧠",
    description: "Queries, keys and values, scaled dot-product attention, and why the √d scaling matters — with NumPy code.",
    blocks: [
      n.p("Self-attention lets every token in a sequence look at every other token and decide **how much each one matters** for its own new representation. It is the core of every Transformer."),
      n.h(2, "Queries, keys and values"),
      n.p("Each token embedding $x_i$ is projected three ways with learned matrices:"),
      n.math(String.raw`q_i = x_i W_Q, \qquad k_i = x_i W_K, \qquad v_i = x_i W_V`),
      n.bullet("**Query:** what this token is looking for."),
      n.bullet("**Key:** what this token offers."),
      n.bullet("**Value:** what this token passes on if it is chosen."),
      n.h(2, "Scaled dot-product attention"),
      n.p("Stacking all tokens into matrices $Q, K, V$:"),
      n.math(String.raw`\operatorname{Attention}(Q, K, V) = \operatorname{softmax}\!\left(\frac{QK^{\top}}{\sqrt{d_k}}\right) V`),
      n.p("Row $i$ of the softmax is a probability distribution over all tokens: how much token $i$ attends to each one."),
      n.h(2, "Why divide by √dₖ?"),
      n.p("If the entries of $q$ and $k$ have unit variance, their dot product has variance $d_k$. Large scores push softmax into regions with near-zero gradients. Dividing by $\\sqrt{d_k}$ keeps the variance at 1."),
      n.math(String.raw`\operatorname{Var}(q \cdot k) = \sum_{j=1}^{d_k} \operatorname{Var}(q_j k_j) = d_k`),
      n.h(2, "The data flow"),
      n.mermaid(`
flowchart LR
  X[Token embeddings X] --> Q[Q = XW_Q]
  X --> K[K = XW_K]
  X --> V[V = XW_V]
  Q --> S[Scores QKᵀ / √dₖ]
  K --> S
  S --> P[softmax]
  P --> O[Output = PV]
  V --> O
`),
      n.h(2, "In NumPy"),
      n.code("python", `
import numpy as np

def softmax(x, axis=-1):
    x = x - x.max(axis=axis, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=axis, keepdims=True)

def self_attention(X, Wq, Wk, Wv):
    Q, K, V = X @ Wq, X @ Wk, X @ Wv
    scores = Q @ K.T / np.sqrt(K.shape[-1])
    weights = softmax(scores)          # (tokens, tokens)
    return weights @ V, weights
`),
      n.h(2, "Going further"),
      n.bullet("**Multi-head:** run $h$ attentions in parallel on smaller projections and concatenate."),
      n.bullet("**Causal mask:** set future positions to $-\\infty$ before the softmax for decoder models."),
      n.bullet("**Cost:** $O(n^2 d)$ in sequence length $n$, which is why long contexts are expensive."),
    ],
    canvas: canvas((c) => {
      c.text("title", 0, -110, 1000, "Scaled dot-product self-attention", { size: "l" });
      c.box("x", 0, 170, 150, 90, "Tokens X\n“the cat sat”");
      c.box("q", 240, 30, 150, 70, "Q = XW_Q", { fill: "solid", color: "light-blue" });
      c.box("k", 240, 180, 150, 70, "K = XW_K", { fill: "solid", color: "light-violet" });
      c.box("v", 240, 330, 150, 70, "V = XW_V", { fill: "solid", color: "light-green" });
      c.box("scores", 480, 90, 180, 90, "Scores\nQKᵀ / √dₖ");
      c.box("soft", 740, 90, 150, 90, "softmax\n(row-wise)");
      c.box("out", 740, 300, 150, 90, "Output\nweights · V", { fill: "solid", color: "light-green" });
      c.arrow("x", "q");
      c.arrow("x", "k");
      c.arrow("x", "v");
      c.arrow("q", "scores");
      c.arrow("k", "scores");
      c.arrow("scores", "soft");
      c.arrow("soft", "out", "weights");
      c.arrow("v", "out");
      c.box("heat", 980, 60, 230, 200,
        "Attention weights\n\n         the   cat   sat\nthe   .70   .20   .10\ncat   .15   .60   .25\nsat   .05   .45   .50",
        { align: "start", verticalAlign: "start", fill: "none" });
      c.text("note", 0, 460, 900, "Each row of the weights sums to 1 — how much a token listens to every other token.", { color: "grey" });
    }),
  },
];
