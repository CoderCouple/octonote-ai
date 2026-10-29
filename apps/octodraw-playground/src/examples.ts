export const EXAMPLES: Record<string, string> = {
  'Food delivery (drill-down)': `title Food delivery
direction down

// Hover a group: Collapse folds it, Open drills in (Esc goes back up). Click a box for its details.
Diner [icon: user, description: Person]
Courier [icon: bike, description: Person]
Restaurant staff [icon: users, description: Person]

Forkway [icon: truck, color: blue, description: software system] {
  Apps [icon: mobile, description: React Native] {
    Diner app [icon: mobile, description: React Native, team: Consumer, tech: React Native]
    Courier app [icon: mobile, description: React Native, team: Logistics, tech: React Native]
    Restaurant app [icon: tablet, description: "React Native, tablet", team: Merchant, tech: React Native]
  }
  API gateway [icon: envoy, description: Envoy, team: Platform, tech: Envoy]
  Services [icon: k8s-namespace, description: Kubernetes] {
    Order service [icon: kotlin, description: "Kotlin, Spring Boot"] {
      Order API [icon: server, description: REST, team: Orders, tech: Kotlin, tags: core]
      Order worker [icon: worker, description: Consumer, team: Orders, tech: Kotlin]
      Orders DB [icon: postgres, shape: cylinder, description: PostgreSQL, team: Orders, tech: PostgreSQL, tags: "core, pii"]
    }
    Payments service [icon: kotlin, description: Kotlin, team: Payments, tech: Kotlin, tags: "core, pci"]
    Dispatch service [icon: go, description: Go, team: Logistics, tech: Go]
  }
  Event bus [icon: kafka, color: orange, description: Kafka, team: Platform, tech: Kafka]
}
Payment gateway [icon: stripe, description: External system]
Maps and routing [icon: map, description: External system]

Diner > Diner app: orders food
Courier > Courier app: delivers
Restaurant staff > Restaurant app: prepares
Diner app, Courier app, Restaurant app > API gateway
API gateway > Order API, Payments service, Dispatch service
Order API > Orders DB
Order API --> Event bus: OrderPlaced
Order worker < Event bus
Event bus --> Dispatch service
Payments service > Payment gateway: charges [color: green]
Dispatch service > Maps and routing: ETAs

// Click "Play flow" at the bottom, or use Filter (top right) to highlight a team or technology.
flow Place an order {
  Diner > Diner app: opens the app and checks out
  Diner app > API gateway: POST /orders
  API gateway > Order API: routes the request
  Order API > Orders DB: stores the order
  Order API --> Event bus: publishes OrderPlaced
  Event bus --> Dispatch service: assigns a courier
  Dispatch service > Maps and routing: computes the ETA
}

flow Take a payment {
  API gateway > Payments service: charge the card
  Payments service > Payment gateway: authorize
}
`,
  'Cloud architecture': `direction right
colorMode pastel

User [icon: user]
VPC Subnet [icon: aws-vpc, color: teal, description: 10.0.0.0/16] {
  Main Server [icon: aws-ec2, color: purple] {
    Server [icon: aws-ec2, description: EC2]
    Data [icon: aws-rds, description: RDS Postgres]
  }
  Cache [icon: redis, color: red, description: ElastiCache]
}
Queue [icon: aws-sqs, description: SQS]
Worker1, Worker2, Worker3 [icon: aws-lambda]

User > Server: HTTPS
Server > Data
Server <> Cache: read-through
Server --> Queue: async
Queue > Worker1, Worker2, Worker3
`,
  Flowchart: `direction down

Start [shape: oval, color: green]
Valid? [shape: diamond, color: orange]
Process order
Notify user
Reject [color: red]
End [shape: oval]

Start > Valid?
Valid? > Process order: yes
Valid? > Reject: no
Process order > Notify user > End
Reject > End
`,
  'ERD: e-commerce': `title E-commerce schema
notation crows-feet

users [icon: user, color: blue] {
  id uuid pk
  email varchar unique
  name varchar
  created_at timestamp
}

orders [icon: cart, color: green] {
  id uuid pk
  user_id uuid fk
  status varchar
  total "decimal(10,2)"
  placed_at timestamp
}

order_items {
  id uuid pk
  order_id uuid fk
  product_id uuid fk
  quantity int
}

products [icon: package, color: orange] {
  id uuid pk
  name varchar
  price "decimal(10,2)"
}

payments [icon: credit-card] {
  id uuid pk
  order_id uuid fk
  provider varchar
}

users.id < orders.user_id
orders.id < order_items.order_id
products.id < order_items.product_id
orders.id - payments.order_id
`,
  'Sequence: checkout': `title Checkout
autoNumber on

Shopper [icon: user] > Web app [icon: browser, color: blue]: Click "Pay"
Web app > API [icon: server]: POST /checkout
activate API
API > Payments [icon: stripe, color: purple]: Authorize card
alt [label: approved] {
  Payments > API: Authorization OK [color: green]
  API > Orders DB [icon: postgres]: Save order
}
else [label: declined] {
  Payments --> API: Declined [color: red]
  API > Web app: Show error
}
loop [label: every 5s until shipped] {
  Web app > API: GET /orders/:id
  API > API: Check status
}
deactivate API
API --> Shopper: Receipt email
`,
};
