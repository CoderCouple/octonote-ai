// Five standalone example canvases, ordered simple → complex.
import { canvas } from "./build.mjs";

export const canvases = [
  // 1 — simple: four stickies and arrows
  {
    slugHint: "content-pipeline",
    level: "Simple",
    title: "My weekly content pipeline",
    canvas: canvas((c) => {
      c.text("title", 0, -90, 900, "Weekly content pipeline", { size: "l" });
      c.sticky("idea", 0, 0, "Mon\nPick one idea from the backlog", { color: "yellow" });
      c.sticky("draft", 260, 0, "Tue–Wed\nOutline + diagram in Octonote", { color: "light-blue" });
      c.sticky("record", 520, 0, "Thu\nRecord / write the post", { color: "light-violet" });
      c.sticky("ship", 780, 0, "Fri\nPublish + share the page link", { color: "light-green" });
      c.arrow("idea", "draft");
      c.arrow("draft", "record");
      c.arrow("record", "ship");
      c.text("hint", 0, 240, 980, "Simple canvas: sticky notes and arrows. Drag a sticky — the arrows follow.", { color: "grey" });
    }),
  },

  // 2 — mind map
  {
    slugHint: "system-design-mind-map",
    level: "Simple+",
    title: "Mind map: learning system design",
    canvas: canvas((c) => {
      c.box("core", 380, 230, 240, 110, "System design", { geo: "ellipse", fill: "solid", color: "light-blue", size: "m" });
      const branches = [
        ["fund", 0, 0, "Fundamentals\nlatency · throughput · CAP"],
        ["store", 760, 0, "Storage\nSQL · NoSQL · sharding"],
        ["cache", 0, 470, "Caching\nCDN · Redis · eviction"],
        ["async", 760, 470, "Async\nqueues · streams · retries"],
        ["scale", 380, -140, "Scaling\nLB · stateless · autoscale"],
        ["practice", 380, 600, "Practice\nURL shortener · chat · feed"],
      ];
      for (const [key, x, y, label] of branches) {
        c.box(key, x, y, 240, 90, label, { geo: "rectangle", fill: "none" });
        c.arrow("core", key, "", { color: "grey" });
      }
    }),
  },

  // 3 — layered reference diagram
  {
    slugHint: "osi-model",
    level: "Medium",
    title: "The OSI model, layer by layer",
    canvas: canvas((c) => {
      c.text("title", 0, -100, 900, "OSI model — what each layer adds", { size: "l" });
      const layers = [
        ["7 Application", "HTTP · DNS · SMTP", "light-violet"],
        ["6 Presentation", "TLS · encoding · compression", "light-violet"],
        ["5 Session", "sessions · RPC", "light-violet"],
        ["4 Transport", "TCP · UDP — ports, segments", "light-blue"],
        ["3 Network", "IP · ICMP — routing, packets", "light-blue"],
        ["2 Data link", "Ethernet · Wi-Fi — MAC, frames", "light-green"],
        ["1 Physical", "cables · radio — bits", "light-green"],
      ];
      layers.forEach(([name, what, color], i) => {
        c.box(`l${i}`, 0, i * 90, 260, 75, name, { fill: "solid", color });
        c.text(`d${i}`, 290, i * 90 + 22, 380, what);
      });
      c.box("send", 720, 0, 180, 600, "Sending\n\ndata is wrapped\nin a header at\neach layer\n\n↓", { fill: "none", dash: "dashed" });
      c.box("recv", 930, 0, 180, 600, "Receiving\n\neach layer\nunwraps its\nheader\n\n↑", { fill: "none", dash: "dashed" });
      c.text("tcpip", 0, 650, 1100, "TCP/IP folds 5–7 into one Application layer and 1–2 into Link.", { color: "grey" });
    }),
  },

  // 4 — pipeline with groups and a failure path
  {
    slugHint: "ci-cd-pipeline",
    level: "Medium+",
    title: "CI/CD pipeline with a safe rollout",
    canvas: canvas((c) => {
      c.text("title", 0, -110, 1300, "From git push to production", { size: "l" });
      c.box("push", 0, 120, 140, 70, "git push", { geo: "ellipse" });
      c.group("ci", 200, 0, 520, 320, "CI — every pull request");
      c.box("build", 240, 50, 200, 70, "Build + lint");
      c.box("test", 240, 150, 200, 70, "Unit tests");
      c.box("itest", 480, 150, 200, 70, "Integration tests");
      c.box("image", 480, 50, 200, 70, "Build image\n+ scan");
      c.group("cd", 790, 0, 520, 320, "CD — on merge to main");
      c.box("staging", 830, 50, 200, 70, "Deploy staging");
      c.box("smoke", 830, 150, 200, 70, "Smoke tests");
      c.box("canary", 1070, 50, 200, 70, "Canary 5%", { fill: "solid", color: "light-blue" });
      c.box("full", 1070, 150, 200, 70, "Roll out 100%", { fill: "solid", color: "light-green" });
      c.box("rollback", 1070, 390, 200, 70, "Auto rollback", { color: "red", labelColor: "red", fill: "none" });
      c.box("fail", 240, 390, 200, 70, "Fail PR\nnotify author", { color: "red", labelColor: "red", fill: "none" });
      c.arrow("push", "build");
      c.arrow("build", "test");
      c.arrow("test", "itest");
      c.arrow("itest", "image");
      c.arrow("image", "staging", "merge");
      c.arrow("staging", "smoke");
      c.arrow("smoke", "canary");
      c.arrow("canary", "full", "metrics OK");
      c.arrow("canary", "rollback", "errors ↑", { dash: "dashed", color: "red" });
      c.arrow("test", "fail", "red", { dash: "dashed", color: "red" });
    }),
  },

  // 5 — complex architecture
  {
    slugHint: "ecommerce-architecture",
    level: "Complex",
    title: "E-commerce microservices architecture",
    canvas: canvas((c) => {
      c.text("title", 0, -120, 1500, "E-commerce platform — microservices", { size: "xl" });
      c.box("web", 0, 60, 150, 70, "Web app", { geo: "ellipse" });
      c.box("mobile", 0, 200, 150, 70, "Mobile app", { geo: "ellipse" });
      c.box("cdn", 220, -10, 170, 60, "CDN\nstatic + images");
      c.box("gw", 220, 120, 170, 90, "API gateway\nauth · rate limit", { fill: "solid", color: "light-blue" });

      c.group("svc", 460, 0, 560, 470, "Services (Kubernetes)");
      c.box("user", 500, 50, 220, 70, "User service");
      c.box("catalog", 760, 50, 220, 70, "Catalog service");
      c.box("cart", 500, 160, 220, 70, "Cart service");
      c.box("order", 760, 160, 220, 70, "Order service", { fill: "solid", color: "light-violet" });
      c.box("payment", 500, 270, 220, 70, "Payment service");
      c.box("inventory", 760, 270, 220, 70, "Inventory service");
      c.box("search", 500, 380, 220, 70, "Search service");
      c.box("notify", 760, 380, 220, 70, "Notification service");

      c.box("bus", 1100, 180, 200, 110, "Event bus\n(Kafka)\norder.created\npayment.settled", { fill: "solid", color: "light-green" });

      c.group("data", 1100, 340, 420, 300, "Data stores");
      c.box("pg", 1130, 390, 170, 70, "Postgres\nusers · orders");
      c.box("redis", 1320, 390, 170, 70, "Redis\ncarts · sessions");
      c.box("es", 1130, 520, 170, 70, "Elasticsearch\nproducts");
      c.box("s3", 1320, 520, 170, 70, "Object storage\nimages");

      c.box("stripe", 1100, 20, 200, 70, "Stripe (external)", { dash: "dashed", fill: "none" });
      c.box("email", 1340, 180, 170, 70, "Email / push\nprovider", { dash: "dashed", fill: "none" });

      c.arrow("web", "gw");
      c.arrow("mobile", "gw");
      c.arrow("web", "cdn", "", { color: "grey" });
      c.arrow("gw", "user");
      c.arrow("gw", "cart");
      c.arrow("gw", "catalog", "", { bend: 30 });
      c.arrow("cart", "order", "checkout");
      c.arrow("order", "payment");
      c.arrow("payment", "stripe", "charge", { bend: -60 });
      c.arrow("order", "bus", "publish", { dash: "dashed" });
      c.arrow("bus", "inventory", "reserve stock", { dash: "dashed" });
      c.arrow("bus", "notify", "send receipt", { dash: "dashed" });
      c.arrow("notify", "email");
      c.arrow("catalog", "search", "index", { dash: "dashed", bend: 40 });
      c.arrow("search", "es", "", { color: "grey" });
      c.arrow("cart", "redis", "", { color: "grey", bend: -30 });
      c.text("legend", 0, 700, 1500, "Solid = synchronous HTTP/gRPC · dashed = asynchronous events · dashed boxes = third parties", { color: "grey" });
    }),
  },
];
