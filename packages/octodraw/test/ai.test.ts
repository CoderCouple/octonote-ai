import { describe, expect, it } from 'vitest';
import { buildUserMessage, diagramSystemPrompt, historyFromMessages, extractDiagramCode, generateDiagram, validateDiagram, type DiagramModel, type DiagramModelRequest } from '../src/index';

const fence = (code: string) => '```octodraw\n' + code + '\n```';

/** A fake model that replays canned replies, streaming them in small chunks. */
function scripted(...replies: string[]): DiagramModel & { requests: DiagramModelRequest[] } {
  const requests: DiagramModelRequest[] = [];
  const model = (request: DiagramModelRequest) => {
    requests.push({ ...request, messages: [...request.messages] });
    const reply = replies.shift() ?? '';
    return (async function* () {
      for (let i = 0; i < reply.length; i += 7) yield reply.slice(i, i + 7);
    })();
  };
  return Object.assign(model, { requests });
}

describe('extractDiagramCode', () => {
  it('splits code from prose', () => {
    expect(extractDiagramCode(`Here you go:\n${fence('A > B')}\nAdded B.`)).toEqual({ code: 'A > B', reply: 'Here you go:\nAdded B.' });
  });
  it('returns the partial code of an unterminated fence', () => {
    expect(extractDiagramCode('```\nA > B\nB > C').code).toBe('A > B\nB > C');
  });
  it('treats unfenced diagram text as code and plain prose as a reply', () => {
    expect(extractDiagramCode('A > B').code).toBe('A > B');
    expect(extractDiagramCode('Sorry, I can only draw diagrams.')).toEqual({ code: '', reply: 'Sorry, I can only draw diagrams.' });
  });
});

describe('validateDiagram', () => {
  it('detects the type and reports errors', () => {
    expect(validateDiagram('notation crows-feet\nusers {\n  id string pk\n}').type).toBe('erd');
    expect(validateDiagram('A > B: hi\nactivate B').type).toBe('sequence');
    expect(validateDiagram('G {\n  A\n').errors.map((e) => e.message)).toContain("Missing closing '}'");
    expect(validateDiagram('').errors.map((e) => e.message)).toContain('The diagram is empty');
  });
});

describe('diagramSystemPrompt', () => {
  it('covers every type, or just the one asked for', () => {
    const all = diagramSystemPrompt();
    expect(all).toContain('ENTITY RELATIONSHIP');
    expect(all).toContain('SEQUENCE');
    const erd = diagramSystemPrompt({ type: 'erd', instructions: 'Use snake_case.' });
    expect(erd).not.toContain('SEQUENCE DIAGRAMS');
    expect(erd).toContain('Use snake_case.');
  });
});

describe('buildUserMessage', () => {
  it('inlines the figure to edit and any references', () => {
    const text = buildUserMessage('add a cache', [
      { id: 'a', label: 'Backend', source: 'API > DB' },
      { id: 'b', label: 'Infra', source: 'LB > API' },
    ]);
    expect(text).toMatch(/Figure to edit: "Backend"\n```octodraw\nAPI > DB\n```/);
    expect(text).toContain('Reference figure: "Infra"');
    expect(text).toContain('Request: add a cache');
  });
});

describe('generateDiagram', () => {
  it('streams, extracts and validates the diagram', async () => {
    const model = scripted(`Sure.\n${fence('User > API > DB')}`);
    const seen: string[] = [];
    const result = await generateDiagram({ model, prompt: 'three tier app', onText: (_, code) => seen.push(code) });
    expect(result.source).toBe('User > API > DB');
    expect(result.type).toBe('flow');
    expect(result.repairs).toBe(0);
    expect(seen.length).toBeGreaterThan(1);
    expect(model.requests[0]!.system).toContain('octodraw');
  });

  it('sends parser errors back for one repair round', async () => {
    const model = scripted(fence('G {\n  A > B'), fence('G {\n  A > B\n}'));
    const result = await generateDiagram({ model, prompt: 'group' });
    expect(result.repairs).toBe(1);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const last = model.requests[1]!.messages.at(-1)!;
    expect(last.content).toContain("Missing closing '}'");
    expect(result.messages).toHaveLength(4);
  });

  it('accepts a model that resolves the whole reply', async () => {
    const result = await generateDiagram({ model: async () => fence('A > B'), prompt: 'x' });
    expect(result.source).toBe('A > B');
  });

  it('throws when the model answers without a diagram', async () => {
    await expect(generateDiagram({ model: async () => 'I cannot help with that.', prompt: 'x' })).rejects.toThrow('I cannot help with that.');
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    const model: DiagramModel = () =>
      (async function* () {
        yield '```\nA > B';
        controller.abort();
        yield '\n```';
      })();
    await expect(generateDiagram({ model, prompt: 'x', signal: controller.signal })).rejects.toThrow();
  });
});

describe('historyFromMessages', () => {
  it('keeps finished prompt/diagram pairs from a saved chat', () => {
    const history = historyFromMessages([
      { id: '1', role: 'user', text: 'three tier app' },
      { id: '2', role: 'assistant', text: '', status: 'done', code: 'User > API > DB' },
      { id: '3', role: 'user', text: 'never mind' },
      { id: '4', role: 'assistant', text: 'Stopped.', status: 'cancelled', code: 'User >' },
    ]);
    expect(history).toEqual([
      { role: 'user', content: 'three tier app' },
      { role: 'assistant', content: '```octodraw\nUser > API > DB\n```' },
    ]);
  });
});
