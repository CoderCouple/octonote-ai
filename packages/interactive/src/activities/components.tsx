import type { ActivitySpecBase, FlashcardsSpec, MatchingSpec, McqSpec, MindmapSpec, QuizSpec } from "../core/index.js";
import type { ActivityComponents, ActivityRenderProps } from "../react/index.js";
import { Flashcards } from "./flashcards.js";
import { Matching } from "./matching.js";
import { Mcq } from "./mcq.js";
import { Mindmap } from "./mindmap.js";
import { Quiz } from "./quiz.js";

/** Renderer props → component props. The spec's own fields become props. */
const fromSpec = <S extends ActivitySpecBase>({ spec, ...rest }: ActivityRenderProps<S>) => {
  const { schemaVersion: _v, type: _t, ...fields } = spec;
  return { ...fields, ...rest };
};

/** Components for the built-in activity types, for `InteractiveProvider`'s `components`. */
export const defaultComponents: ActivityComponents = {
  flashcards: (props: ActivityRenderProps<FlashcardsSpec>) => <Flashcards {...fromSpec(props)} />,
  mcq: (props: ActivityRenderProps<McqSpec>) => <Mcq {...fromSpec(props)} />,
  quiz: (props: ActivityRenderProps<QuizSpec>) => <Quiz {...fromSpec(props)} />,
  mindmap: (props: ActivityRenderProps<MindmapSpec>) => <Mindmap {...fromSpec(props)} />,
  matching: (props: ActivityRenderProps<MatchingSpec>) => <Matching {...fromSpec(props)} />,
};
