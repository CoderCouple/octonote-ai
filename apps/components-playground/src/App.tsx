import { useState } from "react";
import { ComposeDemo } from "./ComposeDemo";
import { InteractiveDemo } from "./InteractiveDemo";
import { MotionDemo } from "./MotionDemo";
import { WidgetsDemo } from "./WidgetsDemo";

type Theme = "light" | "dark" | "system";
type Library = "compose" | "interactive" | "widgets" | "motion";

const LIBRARIES: { id: Library; name: string; pkg: string }[] = [
  { id: "compose", name: "Ask (agent)", pkg: "@octonote/compose" },
  { id: "interactive", name: "Interactive", pkg: "@octonote/interactive" },
  { id: "widgets", name: "Widgets", pkg: "@octonote/widgets" },
  { id: "motion", name: "Motion", pkg: "@octonote/motion" },
];

export function App() {
  const [library, setLibrary] = useState<Library>(() => (new URLSearchParams(location.search).get("lib") as Library) || "compose");
  const [theme, setTheme] = useState<Theme>("system");

  const choose = (id: Library) => {
    setLibrary(id);
    history.replaceState(null, "", `?lib=${id}`);
  };

  return (
    <div className="pg" data-theme={theme}>
      <header className="pg-header">
        <div>
          <h1>Components playground</h1>
          <p>An agent that composes answers from three standalone libraries. Everything renders from validated JSON; nothing runs code from it.</p>
        </div>
        <label className="pg-controls">
          Theme{" "}
          <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>

      <nav className="pg-libraries" aria-label="Libraries">
        {LIBRARIES.map((lib) => (
          <button key={lib.id} type="button" aria-current={library === lib.id ? "page" : undefined} onClick={() => choose(lib.id)}>
            <span className="pg-libraries__name">{lib.name}</span>
            <code>{lib.pkg}</code>
          </button>
        ))}
      </nav>

      {library === "compose" ? <ComposeDemo theme={theme} /> : null}
      {library === "interactive" ? <InteractiveDemo theme={theme} /> : null}
      {library === "widgets" ? <WidgetsDemo theme={theme} /> : null}
      {library === "motion" ? <MotionDemo theme={theme} /> : null}
    </div>
  );
}
