import { CanvasUi, docOf, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

const ERD = "users [icon: user] {\n  id string pk\n  teamId string\n}\nteams {\n  id string pk\n}\nusers.teamId > teams.id";
const SEQUENCE = "Client > Server: GET /data\nactivate Server\nServer --> Client: 200 OK\ndeactivate Server";
const BPMN = "Shop {\n  Sales {\n    Order placed [type: event]\n    Check stock\n  }\n}\nOrder placed > Check stock";

const figure = (id: string, x: number, source: string) => ({ id, type: "figure", x, y: 0, w: 640, h: 420, source, autoSize: false });
const sourceOf = (d: { items: unknown[] }, id: string) => (d.items.find((i) => (i as { id: string }).id === id) as { source: string }).source;

for (const [kind, id, source, pick, barName, expected] of [
  ["ERD", "erd", ERD, "users", "Table", /users \[icon: user, color: blue\]/],
  ["sequence", "seq", SEQUENCE, "Client", "Participant", /Client \[color: blue\]/],
  ["BPMN", "bpmn", BPMN, "Check stock", "Element", /Check stock \[color: blue\]/],
] as const) {
  test(`element toolbar on a ${kind} figure in a canvas: select, colour, saved in the code, undo`, async ({ page, api, enter }) => {
    const c = await api.createCanvas(e2eTitle(`${kind} toolbar`));
    await api.updateCanvas(c.id, { document: docOf([figure(id, 0, source)]) });
    await enter(`/c/${c.id}`);
    const ui = await new CanvasUi(page).ready({ items: 1 });

    await ui.item(id).dblclick();
    // Click the name itself (an ERD table's header; a column row would select the column).
    await ui.item(id).getByText(pick, { exact: true }).first().click();

    const bar = page.getByRole("toolbar", { name: barName });
    await expect(bar).toBeVisible();
    await bar.getByRole("button", { name: /^Colou?r/ }).first().click();
    await page.getByRole("menuitemradio", { name: "Blue", exact: true }).click();
    await waitForDoc(api, c.id, (d) => expected.test(sourceOf(d, id)), `${kind} colour saved`);

    // ⌘Z inside the opened figure undoes it.
    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+z");
    await waitForDoc(api, c.id, (d) => !sourceOf(d, id).includes("color: blue"), `${kind} undo saved`);
  });
}
