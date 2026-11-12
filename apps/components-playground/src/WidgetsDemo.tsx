import { useMemo, useState } from "react";
import guide from "@octonote/widgets/examples/digestive-guide.json";
import explorables from "@octonote/widgets/examples/explorables.json";
import { Badge, Button, Card, Dialog, documentToolDefinition, IconButton, parseDocument, Switch, ToastProvider, Tooltip, useToast, WidgetRenderer, WidgetSpecRenderer, WidgetsProvider, type Theme } from "@octonote/widgets";

// Widgets Claude wrote in the last `pnpm --filter @octonote/widgets eval` run, if any.
const GENERATED = Object.values(import.meta.glob<{ id: string }>("../../../packages/widgets/scripts/out/*.json", { eager: true, import: "default" }));

type Source = "explorables" | "generated" | "example" | "controls" | "paste";

export function WidgetsDemo({ theme }: { theme: Theme }) {
  const [source, setSource] = useState<Source>("explorables");
  const [pasted, setPasted] = useState(() => JSON.stringify({ ...guide, blocks: guide.blocks.slice(0, 3) }, null, 2));
  const parsed = useMemo(() => parseDocument(pasted), [pasted]);

  return (
    <WidgetsProvider theme={theme}>
      <ToastProvider>
        <div className="pg-bar">
          <p className="pg-hint">Content blocks rendered from validated JSON, plus the basic controls they're built from.</p>
          <div className="pg-subtabs" role="tablist" aria-label="Widgets demo">
            {(
              [
                ["explorables", "Explorables"],
                ...(GENERATED.length ? ([["generated", "Written by Claude"]] as const) : []),
                ["example", "Content document"],
                ["controls", "Controls"],
                ["paste", "Paste JSON"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={source === value} onClick={() => setSource(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {source === "explorables" ? (
          <div className="pg-gallery">
            {explorables.map((spec) => (
              <WidgetSpecRenderer key={spec.id} spec={spec} />
            ))}
          </div>
        ) : null}
        {source === "generated" ? (
          <div className="pg-gallery">
            {GENERATED.map((spec) => (
              <WidgetSpecRenderer key={spec.id} spec={spec} />
            ))}
          </div>
        ) : null}
        {source === "example" ? <WidgetRenderer spec={guide} /> : null}
        {source === "controls" ? <Controls /> : null}
        {source === "paste" ? (
          <div className="pg-split">
            <div className="pg-panel">
              <label htmlFor="pg-widgets-json">A content document. Try breaking it to see the safe fallback.</label>
              <textarea id="pg-widgets-json" value={pasted} onChange={(e) => setPasted(e.target.value)} spellCheck={false} rows={20} />
              <details>
                <summary>The tool definition for models</summary>
                <pre>{JSON.stringify(documentToolDefinition(), null, 2)}</pre>
              </details>
            </div>
            <WidgetRenderer spec={parsed.ok ? parsed.spec : pasted} />
          </div>
        ) : null}
      </ToastProvider>
    </WidgetsProvider>
  );
}

function Controls() {
  const toast = useToast();
  const [dialog, setDialog] = useState(false);
  const [on, setOn] = useState(true);
  const [loading, setLoading] = useState(false);
  return (
    <div className="pg-grid">
      <Card>
        <h3 className="pg-card-title">Buttons</h3>
        <div className="pg-row-wrap">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          >
            Save
          </Button>
          <IconButton label="Settings" icon="⚙" variant="secondary" />
        </div>
      </Card>
      <Card>
        <h3 className="pg-card-title">Badges, switch and tooltip</h3>
        <div className="pg-row-wrap">
          <Badge>Draft</Badge>
          <Badge tone="accent">New</Badge>
          <Badge tone="success">Passed</Badge>
          <Badge tone="warning">Review</Badge>
          <Badge tone="danger">Failed</Badge>
        </div>
        <div className="pg-row-wrap">
          <Switch checked={on} onChange={setOn} label="Show hints" />
          <Tooltip content="Tiny folds lining the small intestine">
            <Button size="sm">Hover or focus me</Button>
          </Tooltip>
        </div>
      </Card>
      <Card>
        <h3 className="pg-card-title">Dialog and toasts</h3>
        <div className="pg-row-wrap">
          <Button onClick={() => setDialog(true)}>Open dialog</Button>
          <Button onClick={() => toast({ title: "Progress saved", description: "You can pick up where you left off.", tone: "success" })}>Show toast</Button>
          <Button onClick={() => toast({ title: "Couldn't sync", description: "Check your connection.", tone: "danger" })}>Error toast</Button>
        </div>
      </Card>
      <Card interactive>
        <h3 className="pg-card-title">Interactive card</h3>
        <p className="pg-muted">Cards lift on hover. Use them for lists of lessons or decks.</p>
      </Card>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Reset this deck?"
        footer={
          <>
            <Button onClick={() => setDialog(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => setDialog(false)}>
              Reset
            </Button>
          </>
        }
      >
        <p>Your marks for all 6 cards will be cleared. This can't be undone.</p>
      </Dialog>
    </div>
  );
}
