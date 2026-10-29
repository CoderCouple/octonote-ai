import { describe, expect, it } from 'vitest';
import { parseErd } from '../src/dsl/erd';
import { arrangeErd, layoutErd } from '../src/erd/erd';
import { lightTheme } from '../src/theme/tokens';

const src = `notation crows-feet
users {
  id string pk
  name string
  email string
}
posts {
  id string pk
  authorId string fk
  title string
}
posts.authorId > users.id
`;

describe('ERD collapse', () => {
  it('keeps key columns, shrinks the table, and keeps relationships on their rows', async () => {
    const erd = parseErd(src);
    const open = await layoutErd(erd, { theme: lightTheme });
    const closed = await layoutErd(erd, { theme: lightTheme, collapsed: new Set(['users', 'posts']) });
    const t = (l: typeof open, name: string) => l.tables.find((x) => x.entity.name === name)!;
    expect(t(closed, 'users').attributes.map((a) => a.name)).toEqual(['id']);
    expect(t(closed, 'users').hidden).toBe(2);
    expect(t(closed, 'posts').attributes.map((a) => a.name)).toEqual(['id', 'authorId']);
    expect(t(closed, 'users').height).toBeLessThan(t(open, 'users').height);
    expect(closed.links[0]).toMatchObject({ from: 'posts', to: 'users' });
  });

  it('hand placement moves a table and re-routes its relationships', async () => {
    const erd = parseErd(src);
    const auto = await layoutErd(erd, { theme: lightTheme });
    const moved = arrangeErd(erd, auto, { users: { x: 40, y: 500 } });
    const users = moved.tables.find((t) => t.entity.name === 'users')!;
    expect(users).toMatchObject({ x: 40, y: 500 });
    expect(moved.links[0]!.points).not.toEqual(auto.links[0]!.points);
    expect(moved.height).toBeGreaterThan(500);
    expect(arrangeErd(erd, auto, undefined)).toBe(auto);
  });
});
