# @octonote/interactive

Interactive activities for React, rendered from validated JSON: **flashcards** (with spaced repetition), **practice questions**, **quizzes** (timed, scored, optionally graded on a server), **mind maps** and **matching**. Activities can be combined into a **session**.

```tsx
import { defaultComponents, InteractiveProvider, InteractiveRenderer, webStorageStore } from "@octonote/interactive";
import "@octonote/interactive/styles.css";

<InteractiveProvider components={defaultComponents} store={webStorageStore()} onEvent={track}>
  <InteractiveRenderer spec={specFromAnyModel} normalize />
</InteractiveProvider>;
```

- **Eight ways to answer a question:**
  - `single` and `multiple` choice, and `true_false`;
  - `fill_blank`: inputs in place of each `___`, forgiving about case, spaces and number formats;
  - `numeric`: with a tolerance and a unit, and typed numbers like "1,200 m" are understood;
  - `order`: drag, or use the arrow buttons. It starts shuffled and is never already right;
  - `categorize`: a chip per group for each item, which works by keyboard and touch;
  - `short_answer`: after checking, the model answer and rubric appear and the learner marks it. In a quiz review, marking re-scores the quiz.
  Every kind answers with a list of strings, so server grading works the same for all of them. `redactQuiz` strips every kind's answers, and shuffles order items. `checkResponse`, `expectedResponse` and `isAnswered` are exported. `normalizeSpec` fixes the usual slips (a bare number answer, blanks as strings, items as strings, groups named by text).
- **Specs are data, never code.** `defaultRegistry.validate(input)` checks versions, ids, answers, sizes and mind map structure, and never throws. Invalid specs render a safe message; a crashing activity can't take the page down.
- **AI-friendly.** `sessionToolDefinition()` gives a provider-neutral tool with a JSON Schema. `normalizeSpec()` fixes common model mistakes first (missing ids, answers as indexes or text, options as strings, nested mind map trees, Markdown outlines).
- **Secure assessments.** Send `redactQuiz(quiz)` to the browser, keep the full quiz on your server, and grade with `gradeQuiz` behind a `grader`.
- **State you own.** Every activity is controlled or uncontrolled (`state` / `defaultState` / `onStateChange`), has a headless hook (`useFlashcards`, `useQuiz`, …), and reports one event shape. Progress goes through a `ProgressStore` you can implement over any backend.
- **Custom activities.** `defaultRegistry.extend({ type, version, description, schema })` plus a component in `components`.
- **Theming.** Override `--ix-*` variables; `theme="light" | "dark" | "system"`.

Example: `examples/digestive-system.json`. Demo: `pnpm --filter @octonote/components-playground dev`.
