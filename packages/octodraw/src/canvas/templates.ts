import type { DiagramType } from '../dsl/detect';
import { lineBetween, newItemId, type CanvasItem, type FigureItem, type FrameItem, type StickyItem, type TextItem } from './model';

/** Starter code for new figures, one per diagram kind. */
export const FIGURE_TEMPLATES: { id: string; label: string; hint: string; type: DiagramType; source: string }[] = [
  {
    id: 'architecture',
    label: 'Architecture diagram',
    hint: 'Services, clouds and data flow',
    type: 'flow',
    source: `title Architecture
direction right

User [icon: user]
App [icon: aws-cloudfront] {
  API [icon: aws-lambda]
  Database [icon: aws-dynamodb]
}

User > API: HTTPS
API > Database
`,
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    hint: 'Steps and decisions',
    type: 'flow',
    source: `title Flowchart
direction down

Start [shape: oval]
Valid input? [shape: diamond]
Save [shape: rectangle]
Show error [shape: rectangle]
End [shape: oval]

Start > Valid input?
Valid input? > Save: yes
Valid input? > Show error: no
Save > End
Show error > Start
`,
  },
  {
    id: 'erd',
    label: 'Data model',
    hint: 'Entity relationship diagram',
    type: 'erd',
    source: `notation crows-feet
title Data model

users [icon: user, color: blue] {
  id string pk
  name string
}
posts [icon: file-text] {
  id string pk
  authorId string fk
  title string
}

posts.authorId > users.id
`,
  },
  {
    id: 'bpmn',
    label: 'Process (BPMN)',
    hint: 'Pools, lanes, tasks and decisions',
    type: 'bpmn',
    source: `title Order process

Customer [color: blue] {
  Order placed [type: event, event: message]
  Receive goods
  Done [type: event]
}
Shop {
  Sales {
    Check stock
    In stock? [type: gateway]
    Notify delay
    Wait for stock [type: event, event: timer]
    Inventory [type: store]
  }
  Warehouse {
    Pack [type: gateway, gateway: parallel]
    Ship order [type: subprocess]
    Lost in transit [type: event, event: error, attached: Ship order]
    Send invoice
    Packed [type: gateway, gateway: parallel]
  }
}

Order placed > Check stock > In stock?
In stock? > Pack: yes
In stock? > Notify delay: no
Notify delay > Wait for stock > Check stock
Check stock -- Inventory
Pack > Ship order, Send invoice
Ship order, Send invoice > Packed
Packed > Receive goods > Done
Lost in transit > Notify delay
`,
  },
  {
    id: 'sequence',
    label: 'Sequence diagram',
    hint: 'Messages between participants',
    type: 'sequence',
    source: `title Sequence

Client [icon: monitor] > Server [icon: server]: Request
activate Server
Server > Database [icon: database]: Query
Database --> Server: Rows
Server --> Client: Response
deactivate Server
`,
  },
  {
    id: 'cloud',
    label: 'Cloud (AWS)',
    hint: 'Network, compute, data on AWS',
    type: 'flow',
    source: `title AWS web app
direction right

Users [icon: users]
AWS [icon: aws] {
  Edge {
    CDN [icon: aws-cloudfront]
    WAF [icon: aws-waf]
  }
  VPC [icon: aws-vpc] {
    Public subnet {
      Load balancer [icon: aws-elastic-load-balancing]
    }
    Private subnet {
      App [icon: aws-ecs]
      Worker [icon: aws-lambda]
    }
    Data {
      Database [icon: aws-rds]
      Cache [icon: aws-elasticache]
    }
  }
  Queue [icon: aws-sqs]
  Files [icon: aws-simple-storage-service]
}

Users > CDN > WAF > Load balancer > App
App > Database, Cache
App > Queue > Worker > Files
`,
  },
  {
    id: 'cicd',
    label: 'CI/CD pipeline',
    hint: 'Build, test and deploy stages',
    type: 'flow',
    source: `title CI/CD pipeline
direction right

Developer [icon: user]
GitHub [icon: github]
CI [icon: github-actions] {
  Build [icon: package]
  Test [icon: check-circle]
  Scan [icon: shield]
}
Registry [icon: docker]
Staging [icon: server, color: orange]
Approve? [shape: diamond]
Production [icon: server, color: green]

Developer > GitHub: push
GitHub > Build > Test > Scan > Registry
Registry > Staging > Approve?
Approve? > Production: yes
Approve? > Developer: no
`,
  },
  {
    id: 'microservices',
    label: 'Microservices',
    hint: 'Services, gateway, events and data',
    type: 'flow',
    source: `title Microservices
direction down

Clients [icon: users] {
  Web [icon: monitor]
  Mobile [icon: mobile]
}
API gateway [icon: globe]
Services {
  Accounts [icon: user, team: identity]
  Orders [icon: cart, team: commerce]
  Payments [icon: credit-card, team: commerce]
  Notifications [icon: mail, team: platform]
}
Event bus [icon: kafka, color: orange]
Data {
  Accounts DB [icon: postgres, shape: cylinder]
  Orders DB [icon: postgres, shape: cylinder]
}

Web, Mobile > API gateway
API gateway > Accounts, Orders
Orders > Payments
Orders --> Event bus: OrderPlaced
Event bus --> Notifications
Accounts > Accounts DB
Orders > Orders DB
`,
  },
  {
    id: 'data-pipeline',
    label: 'Data pipeline',
    hint: 'Ingest, transform, serve',
    type: 'flow',
    source: `title Data pipeline
direction right

Sources {
  App DB [icon: postgres]
  Events [icon: kafka]
  SaaS [icon: cloud]
}
Ingest [icon: aws-kinesis]
Lake [icon: aws-simple-storage-service] {
  Raw
  Clean
  Curated
}
Transform [icon: dbt]
Warehouse [icon: snowflake]
Serve {
  Dashboards [icon: bar-chart]
  ML models [icon: cpu]
}

App DB, Events, SaaS > Ingest > Raw
Raw > Transform > Clean > Curated
Curated > Warehouse > Dashboards, ML models
`,
  },
  {
    id: 'network',
    label: 'Network topology',
    hint: 'Sites, firewalls, subnets',
    type: 'flow',
    source: `title Network
direction down

Internet [icon: globe]
Firewall [icon: shield, color: red]
Core switch [icon: server]
Office LAN [color: blue] {
  Workstations [icon: monitor]
  Printers [icon: printer]
  Wi-Fi [icon: wifi]
}
Server room [color: green] {
  File server [icon: hard-drive]
  Backup [icon: database]
}
VPN [icon: lock]
Remote staff [icon: users]

Internet > Firewall > Core switch
Core switch > Workstations, Printers, Wi-Fi
Core switch > File server > Backup
Remote staff > VPN > Firewall
`,
  },
  {
    id: 'org-chart',
    label: 'Org chart',
    hint: 'Teams and reporting lines',
    type: 'flow',
    source: `title Organisation
direction down

CEO [icon: user, color: purple]
CTO [icon: user, color: blue]
CPO [icon: user, color: green]
Platform team [icon: users]
Product team [icon: users]
Design [icon: pen-tool]
Research [icon: search]

CEO > CTO, CPO
CTO > Platform team, Product team
CPO > Design, Research
`,
  },
  {
    id: 'state-machine',
    label: 'State machine',
    hint: 'States and the events between them',
    type: 'flow',
    source: `title Order states
direction right

New [shape: oval]
Paid [shape: oval, color: blue]
Shipped [shape: oval, color: orange]
Delivered [shape: oval, color: green]
Cancelled [shape: oval, color: red]

New > Paid: payment received
Paid > Shipped: label printed
Shipped > Delivered: signed for
New > Cancelled: timeout
Paid > Cancelled: refund
`,
  },
];

/** The `title` line of diagram code, if any. */
export function figureTitle(source: string): string | undefined {
  return /^\s*title\s+(.+?)\s*$/m.exec(source)?.[1];
}

// ---- whole-canvas templates ----

/** A starter board: several items laid out together (built fresh each time, at the origin). */
export interface CanvasTemplate {
  id: string;
  label: string;
  hint: string;
  build: () => CanvasItem[];
}

const source = (id: string) => FIGURE_TEMPLATES.find((t) => t.id === id)!.source;
const heading = (text: string, x: number, y: number, fontSize = 32): TextItem => ({ id: newItemId(), type: 'text', x, y, w: Math.ceil(text.length * fontSize * 0.56), h: Math.ceil(fontSize * 1.3), text, fontSize, bold: true });
const label = (text: string, x: number, y: number): TextItem => ({ id: newItemId(), type: 'text', x, y, w: Math.ceil(text.length * 20 * 0.56), h: 26, text, fontSize: 20, bold: true });
const sticky = (text: string, x: number, y: number, color?: string): StickyItem => ({ id: newItemId(), type: 'sticky', x, y, w: 180, h: 180, text, color });
const figure = (src: string, x: number, y: number, w = 520, h = 340): FigureItem => ({ id: newItemId(), type: 'figure', x, y, w, h, source: src, autoSize: false });

/** Columns of sticky notes under headings (brainstorms, retros). */
function board(title: string, columns: { title: string; color: string; notes: string[] }[]): CanvasItem[] {
  const items: CanvasItem[] = [heading(title, 0, 0)];
  columns.forEach((col, i) => {
    const x = i * 440;
    items.push({ id: newItemId(), type: 'shape', shape: 'rectangle', x, y: 72, w: 400, h: 520, color: col.color }, label(col.title, x + 20, 92));
    col.notes.forEach((note, j) => items.push(sticky(note, x + 10 + (j % 2) * 195, 140 + Math.floor(j / 2) * 215, col.color)));
  });
  return items;
}

export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  {
    id: 'system-design',
    label: 'System design review',
    hint: 'Architecture, data model and open questions',
    build: () => [
      heading('System design review', 0, 0),
      { id: newItemId(), type: 'text', x: 0, y: 52, w: 520, h: 26, text: 'Goal: one sentence on what this system does and for whom.', fontSize: 18 },
      label('Architecture', 0, 112),
      figure(source('architecture'), 0, 148),
      label('Data model', 580, 112),
      figure(source('erd'), 580, 148, 420, 340),
      label('Open questions', 1060, 112),
      sticky('How do we scale writes?', 1060, 148),
      sticky('What happens when the database is down?', 1260, 148, 'orange'),
      sticky('Who owns on-call?', 1060, 348, 'blue'),
    ],
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    hint: 'Ideas, questions and next steps on stickies',
    build: () =>
      board('Brainstorm', [
        { title: 'Ideas', color: 'yellow', notes: ['Idea', 'Another idea'] },
        { title: 'Questions', color: 'blue', notes: ['What do users need?'] },
        { title: 'Next steps', color: 'green', notes: ['Try it with 5 users'] },
      ]),
  },
  {
    id: 'retro',
    label: 'Retrospective',
    hint: 'Went well, to improve, actions',
    build: () =>
      board('Sprint retrospective', [
        { title: 'Went well', color: 'green', notes: ['Shipped on time'] },
        { title: 'To improve', color: 'red', notes: ['Too many meetings'] },
        { title: 'Actions', color: 'purple', notes: ['Owner: action by date'] },
      ]),
  },
  {
    id: 'user-flow',
    label: 'User flow',
    hint: 'Phone screens joined by arrows',
    build: () => {
      const screens = ['Sign up', 'Verify email', 'Welcome'].map((title, i): FrameItem => ({ id: newItemId(), type: 'frame', device: 'phone', x: i * 380, y: 72, w: 240, h: 480, title }));
      const items: CanvasItem[] = [heading('User flow', 0, 0), ...screens];
      screens.forEach((s, i) => items.push(label(s.title!, s.x + 20, s.y + 500)));
      for (let i = 1; i < screens.length; i++) {
        const a = screens[i - 1]!;
        const b = screens[i]!;
        items.push(lineBetween({ x: a.x + a.w, y: a.y + a.h / 2, item: a.id }, { x: b.x, y: b.y + b.h / 2, item: b.id }));
      }
      return items;
    },
  },
  {
    id: 'feature-spec',
    label: 'Feature spec',
    hint: 'Flowchart, sequence and an API sketch',
    build: () => [
      heading('Feature spec', 0, 0),
      { id: newItemId(), type: 'text', x: 0, y: 52, w: 560, h: 26, text: 'Problem, proposal and how it works.', fontSize: 18 },
      label('Flow', 0, 112),
      figure(source('flowchart'), 0, 148, 360, 460),
      label('Sequence', 420, 112),
      figure(source('sequence'), 420, 148, 480, 340),
      label('API', 960, 112),
      { id: newItemId(), type: 'code', x: 960, y: 148, w: 380, h: 170, language: 'typescript', text: 'POST /api/items\n{\n  "title": string\n}\n→ 201 { "id": string }\n' },
    ],
  },
  {
    id: 'kanban',
    label: 'Kanban board',
    hint: 'To do, doing, done',
    build: () =>
      board('Kanban', [
        { title: 'To do', color: 'gray', notes: ['Write the spec', 'Design review'] },
        { title: 'Doing', color: 'blue', notes: ['Build the API'] },
        { title: 'Done', color: 'green', notes: ['Kick-off'] },
      ]),
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    hint: 'Now, next, later',
    build: () =>
      board('Roadmap', [
        { title: 'Now', color: 'green', notes: ['Ship sign-up', 'Fix onboarding'] },
        { title: 'Next', color: 'yellow', notes: ['Teams', 'Billing'] },
        { title: 'Later', color: 'purple', notes: ['Mobile app'] },
      ]),
  },
  {
    id: 'postmortem',
    label: 'Incident postmortem',
    hint: 'Timeline, causes and follow-ups',
    build: () => [
      heading('Incident postmortem', 0, 0),
      { id: newItemId(), type: 'text', x: 0, y: 52, w: 560, h: 26, text: 'Impact: who was affected, for how long.', fontSize: 18 },
      label('What happened', 0, 112),
      figure(`title Timeline\ndirection right\n\nDeploy [icon: upload]\nErrors spike [icon: alert-triangle, color: red]\nAlert fired [icon: bell]\nRollback [icon: rotate-ccw]\nRecovered [icon: check-circle, color: green]\n\nDeploy > Errors spike: 10:02\nErrors spike > Alert fired: 10:07\nAlert fired > Rollback: 10:15\nRollback > Recovered: 10:21\n`, 0, 148, 760, 240),
      label('Root causes', 0, 430),
      sticky('Missing test for the migration', 0, 466, 'red'),
      sticky('Alert threshold too high', 200, 466, 'orange'),
      label('Follow-ups', 440, 430),
      sticky('Add migration test — owner, date', 440, 466, 'green'),
      sticky('Lower the alert threshold', 640, 466, 'green'),
    ],
  },
  {
    id: 'decision',
    label: 'Architecture decision',
    hint: 'Context, options, decision',
    build: () => [
      heading('Architecture decision', 0, 0),
      label('Context', 0, 72),
      { id: newItemId(), type: 'text', x: 0, y: 106, w: 520, h: 26, text: 'What forces the decision, and what matters most.', fontSize: 16 },
      label('Options', 0, 160),
      sticky('Option A\n+ fast to build\n− harder to scale', 0, 196, 'blue'),
      sticky('Option B\n+ scales\n− more moving parts', 200, 196, 'purple'),
      label('Decision', 440, 160),
      sticky('We choose A because …', 440, 196, 'green'),
      label('Consequences', 0, 410),
      { id: newItemId(), type: 'text', x: 0, y: 444, w: 520, h: 26, text: 'What gets easier, what gets harder.', fontSize: 16 },
    ],
  },
  {
    id: 'journey',
    label: 'User journey map',
    hint: 'Stages, actions, feelings, ideas',
    build: () =>
      board('User journey', [
        { title: 'Discover', color: 'blue', notes: ['Sees an ad', 'Reads reviews'] },
        { title: 'Sign up', color: 'purple', notes: ['Long form 😕'] },
        { title: 'First use', color: 'green', notes: ['Finds the template'] },
        { title: 'Ideas', color: 'yellow', notes: ['Sign up with Google', 'Guided tour'] },
      ]),
  },
  {
    id: 'swot',
    label: 'SWOT analysis',
    hint: 'Strengths, weaknesses, opportunities, threats',
    build: () => {
      const items: CanvasItem[] = [heading('SWOT analysis', 0, 0)];
      const cells = [
        { title: 'Strengths', color: 'green', x: 0, y: 72, note: 'Fast, simple' },
        { title: 'Weaknesses', color: 'red', x: 440, y: 72, note: 'Small team' },
        { title: 'Opportunities', color: 'blue', x: 0, y: 392, note: 'New market' },
        { title: 'Threats', color: 'orange', x: 440, y: 392, note: 'Big competitor' },
      ];
      for (const c of cells) items.push({ id: newItemId(), type: 'shape', shape: 'rectangle', x: c.x, y: c.y, w: 400, h: 300, color: c.color }, label(c.title, c.x + 20, c.y + 20), sticky(c.note, c.x + 20, c.y + 70, c.color));
      return items;
    },
  },
  {
    id: 'meeting',
    label: 'Meeting notes',
    hint: 'Agenda, notes, decisions, actions',
    build: () =>
      board('Meeting notes', [
        { title: 'Agenda', color: 'gray', notes: ['Status', 'Risks'] },
        { title: 'Decisions', color: 'green', notes: ['Ship on Friday'] },
        { title: 'Actions', color: 'blue', notes: ['Ada: update the plan'] },
      ]),
  },
  {
    id: 'onboarding-flow',
    label: 'Onboarding flow',
    hint: 'Screens and the flow between them',
    build: () => {
      const screens = ['Welcome', 'Pick a template', 'Invite your team', 'Done'].map((title, i): FrameItem => ({ id: newItemId(), type: 'frame', device: 'browser', x: i * 560, y: 72, w: 480, h: 320, title }));
      const items: CanvasItem[] = [heading('Onboarding flow', 0, 0), ...screens];
      for (let i = 1; i < screens.length; i++) items.push(lineBetween({ x: 0, y: 0, item: screens[i - 1]!.id }, { x: 0, y: 0, item: screens[i]!.id }));
      return items;
    },
  },
];
