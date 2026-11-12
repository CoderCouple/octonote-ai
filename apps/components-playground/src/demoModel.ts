import { defaultCatalog, type ModelClient, type Plan } from "@octonote/compose";

/**
 * A scripted stand-in for a model, so the Ask tab works without an API key.
 * It runs through the real agent: planning, streamed JSON, validation and
 * rendering are all the same code a live model goes through.
 */
interface Script {
  plan: Plan;
  response: { title?: string; blocks: Record<string, unknown>[] };
}

const example = (kind: string) => defaultCatalog.get(kind)!.example;

const SCRIPTS: { match: RegExp; script: Script }[] = [
  {
    match: /compound|interest|invest/i,
    script: {
      plan: {
        strategy: "compose",
        reason: "Compound growth is a relationship between rate, time and money, so letting the learner vary the rate teaches more than a paragraph.",
        title: "How compound interest works",
        blocks: [
          { kind: "text", purpose: "Explain the idea in two sentences" },
          { kind: "widget", purpose: "Let the learner change the rate and watch the balance grow" },
          { kind: "callout", purpose: "Flag the rule of 72" },
          { kind: "mcq", purpose: "Check the key idea" },
        ],
      },
      response: {
        title: "How compound interest works",
        blocks: [
          {
            kind: "text",
            markdown:
              "With **compound interest**, you earn interest on your original money *and* on the interest it has already earned. Each year's gain is a little bigger than the last, so growth speeds up over time.\n\nTry changing the rate below and watch what happens to the final balance.",
          },
          example("widget"),
          { kind: "callout", variant: "tip", title: "The rule of 72", text: "Divide 72 by the yearly rate to estimate how many years it takes to double: at 8%, about **9 years**." },
          {
            kind: "mcq",
            questions: [
              {
                id: "q1",
                prompt: "Why does compound interest grow faster than simple interest?",
                options: [
                  { id: "a", text: "The rate goes up every year", rationale: "The rate stays the same; the amount it applies to grows." },
                  { id: "b", text: "Interest is earned on past interest too", rationale: "Exactly: each year's interest is added to the base." },
                  { id: "c", text: "Banks add a bonus", rationale: "No bonus is involved; it's just maths." },
                ],
                correct: ["b"],
              },
            ],
          },
        ],
      },
    },
  },
  {
    match: /memori[sz]e|flashcard|periodic|elements/i,
    script: {
      plan: {
        strategy: "compose",
        reason: "Memorising a list of facts is what spaced-repetition flashcards are for.",
        blocks: [
          { kind: "text", purpose: "Set up the deck" },
          { kind: "flashcards", purpose: "Practise symbol and name pairs" },
        ],
      },
      response: {
        title: "The first ten elements",
        blocks: [
          { kind: "text", markdown: "Here are the first ten elements. Flip each card, then mark whether you knew it; the ones you miss come back sooner." },
          {
            kind: "flashcards",
            spacedRepetition: true,
            cards: [
              ["H", "Hydrogen (1)"],
              ["He", "Helium (2)"],
              ["Li", "Lithium (3)"],
              ["Be", "Beryllium (4)"],
              ["B", "Boron (5)"],
              ["C", "Carbon (6)"],
              ["N", "Nitrogen (7)"],
              ["O", "Oxygen (8)"],
              ["F", "Fluorine (9)"],
              ["Ne", "Neon (10)"],
            ].map(([front, back], i) => ({ id: `c${i + 1}`, front, back })),
          },
        ],
      },
    },
  },
];

const HEART_GAME = '<style>\n:root{--ink:#191919;--muted:#6b6a66;--line:#e5e5e2;--ok:#1f9d6b;--bad:#d64541;--blue:#1f7ae0;--red:#d64541}\n@media (prefers-color-scheme:dark){:root{--ink:#f2f2ef;--muted:#a09f9b;--line:#2a2a2e}}\nbody{color:var(--ink)}\nh2{font-size:16px;margin:0 0 4px}\np{margin:0 0 12px;color:var(--muted);font-size:14px}\n#path{display:flex;flex-wrap:wrap;gap:6px;min-height:34px;margin-bottom:14px}\n.step{padding:6px 10px;border-radius:999px;font-size:13px;color:#fff;animation:pop .25s ease}\n.step.blue{background:var(--blue)}.step.red{background:var(--red)}\n#choices{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}\nbutton{font:inherit;font-size:14px;padding:10px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--ink);cursor:pointer}\nbutton:hover{border-color:var(--muted)}\nbutton.wrong{border-color:var(--bad);animation:shake .3s}\n#status{margin-top:12px;font-weight:600}\n@keyframes pop{from{transform:scale(.8);opacity:0}}\n@keyframes shake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}\n</style>\n<h2>Trace the blood</h2>\n<p>Blood has just returned from the body. Tap where it goes next, in order, until it leaves for the body again.</p>\n<div id="path" aria-live="polite"></div>\n<div id="choices"></div>\n<div id="status" role="status"></div>\n<script>\nvar order=[["Right atrium","blue"],["Tricuspid valve","blue"],["Right ventricle","blue"],["Pulmonary artery","blue"],["Lungs","blue"],["Pulmonary veins","red"],["Left atrium","red"],["Mitral valve","red"],["Left ventricle","red"],["Aorta","red"]];\nvar at=0,mistakes=0;\nvar names=order.map(function(o){return o[0]}).sort(function(){return Math.random()-.5});\nvar choices=document.getElementById("choices"),path=document.getElementById("path"),statusEl=document.getElementById("status");\nnames.forEach(function(name){var b=document.createElement("button");b.textContent=name;b.onclick=function(){pick(name,b)};choices.appendChild(b)});\nfunction pick(name,b){\n  if(at>=order.length)return;\n  if(name===order[at][0]){\n    var s=document.createElement("span");s.className="step "+order[at][1];s.textContent=name;path.appendChild(s);b.disabled=true;b.style.opacity=.35;at++;\n    host.event("step",{at:at,name:name});\n    if(at===order.length){var score=Math.max(0,100-mistakes*10);statusEl.textContent="Done! Oxygen-poor blood (blue) went to the lungs and came back oxygen-rich (red). Score: "+score+"%";host.complete(score)}\n    else statusEl.textContent="";\n  }else{mistakes++;b.classList.remove("wrong");void b.offsetWidth;b.classList.add("wrong");statusEl.textContent="Not yet. Where does blood go after "+(at?order[at-1][0]:"the body")+"?";host.event("mistake",{at:at,name:name})}\n}\n</script>';

SCRIPTS.push({
  match: /heart|blood|game/i,
  script: {
    plan: {
      strategy: "custom",
      reason: "Tracing a path through the heart by choosing each next step is a bespoke game; no block in the catalog does that.",
      customIdea: "A click-the-next-step game through the heart's chambers, valves and vessels.",
      blocks: [
        { kind: "text", purpose: "Set up the idea of two loops" },
        { kind: "custom", purpose: "The blood-flow game" },
        { kind: "takeaway", purpose: "Sum up the double loop" },
      ],
    },
    response: {
      title: "Follow the blood through your heart",
      blocks: [
        { kind: "text", markdown: "Your heart is really **two pumps side by side**: the right side sends blood to the lungs, the left side sends it to the rest of the body." },
        { kind: "custom", title: "Blood-flow game", description: "Tap each chamber, valve and vessel in the order blood passes through them.", html: HEART_GAME, height: 380 },
        { kind: "takeaway", points: ["Right side: body → lungs (oxygen-poor).", "Left side: lungs → body (oxygen-rich)."] },
      ],
    },
  },
});

const FALLBACK: Script = {
  plan: { strategy: "text", reason: "A quick factual question is best answered in a sentence.", blocks: [{ kind: "text", purpose: "Answer directly" }] },
  response: { blocks: [{ kind: "text", markdown: "**Paris** is the capital of France." }] },
};

export const DEMO_QUESTIONS = ["Explain how compound interest works.", "Help me memorise the first 10 elements.", "What is the capital of France?", "Make a game to learn how blood flows through the heart."];
export const DEMO_FOLLOW_UP = "Make the question harder.";

const HARDER_MCQ = {
  kind: "mcq",
  questions: [
    {
      id: "q1",
      prompt: "$1,000 grows at 6% a year, compounded yearly. Roughly how long until it doubles?",
      options: [
        { id: "a", text: "About 6 years", rationale: "That would need about 12% a year." },
        { id: "b", text: "About 12 years", rationale: "Right: by the rule of 72, 72 ÷ 6 = 12." },
        { id: "c", text: "About 17 years", rationale: "That's how long simple interest would take (100 ÷ 6)." },
      ],
      correct: ["b"],
      hint: "Use the rule of 72.",
    },
  ],
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function demoModel(): ModelClient {
  let script = FALLBACK;
  return {
    async callTool({ tool, messages, onPartial, signal }) {
      const last = messages[messages.length - 1]!.content;
      if (tool.name === "route_message") {
        await sleep(300);
        return { action: /harder|easier|change|instead|another|more|less/i.test(last) ? "edit" : "new" };
      }
      if (tool.name === "edit_response") {
        await sleep(900);
        // Find the practice question block in the current answer and swap it.
        const id = /"id":"(b\d+)","kind":"mcq"/.exec(last)?.[1];
        return id ? { summary: "Made the question harder.", ops: [{ op: "replace", id, block: HARDER_MCQ }] } : { ops: [] };
      }
      if (tool.name === "plan_response") {
        const question = messages[messages.length - 1]!.content;
        script = SCRIPTS.find((s) => s.match.test(question))?.script ?? FALLBACK;
        await sleep(700);
        return script.plan;
      }
      // Stream the response JSON like a model writing it.
      const json = JSON.stringify(script.response);
      for (let i = 0; i < json.length; i += 24) {
        if (signal?.aborted) throw new Error("Cancelled");
        onPartial?.(json.slice(0, i));
        await sleep(12);
      }
      onPartial?.(json);
      return script.response;
    },
  };
}
