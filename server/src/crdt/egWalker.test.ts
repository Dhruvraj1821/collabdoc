import { EgWalker } from './egWalker.js';
import { EgEvent } from './types.js';

// ── Helper ────────────────────────────────────────────────────────────────────

// Builds an EgEvent cleanly — less boilerplate in each test
function makeInsert(
  id: string,
  parents: string[],
  index: number,
  char: string,
  clientId = 'client_A'
): EgEvent {
  return { id, clientId, parents, op: { type: 'insert', index, char } };
}

function makeDelete(
  id: string,
  parents: string[],
  index: number,
  clientId = 'client_A'
): EgEvent {
  return { id, clientId, parents, op: { type: 'delete', index } };
}

// ── Test 1 — sequential inserts ───────────────────────────────────────────────

test('sequential inserts produce correct content', () => {
  const walker = new EgWalker();

  // Each event's parent is the previous event — linear chain
  walker.applyEvent(makeInsert('e1', [], 0, 'H'));
  walker.applyEvent(makeInsert('e2', ['e1'], 1, 'e'));
  walker.applyEvent(makeInsert('e3', ['e2'], 2, 'l'));
  walker.applyEvent(makeInsert('e4', ['e3'], 3, 'l'));
  walker.applyEvent(makeInsert('e5', ['e4'], 4, 'o'));

  expect(walker.getContent()).toBe('Hello');
});

// ── Test 2 — sequential delete ────────────────────────────────────────────────

test('sequential delete removes correct character', () => {
  const walker = new EgWalker();

  walker.applyEvent(makeInsert('e1', [], 0, 'H'));
  walker.applyEvent(makeInsert('e2', ['e1'], 1, 'e'));
  walker.applyEvent(makeInsert('e3', ['e2'], 2, 'l'));
  walker.applyEvent(makeInsert('e4', ['e3'], 3, 'l'));
  walker.applyEvent(makeInsert('e5', ['e4'], 4, 'o'));

  // Delete position 1 (the 'e') — parents = [e5] means they saw the full word
  walker.applyEvent(makeDelete('e6', ['e5'], 1));

  expect(walker.getContent()).toBe('Hllo');
});

// ── Test 3 — CONVERGENCE (the hard gate) ─────────────────────────────────────

test('convergence: same concurrent ops in different order produce identical content', () => {
  // Client A inserts 'X' at position 0, seeing empty document (parents=[])
  // Client B inserts 'Y' at position 0, seeing empty document (parents=[])
  // These two events are concurrent — neither saw the other

  const eventA = makeInsert('eA', [], 0, 'X', 'client_A');
  const eventB = makeInsert('eB', [], 0, 'Y', 'client_B');

  // Instance 1: apply A then B
  const walker1 = new EgWalker();
  walker1.applyEvent(eventA);
  walker1.applyEvent(eventB);

  // Instance 2: apply B then A
  const walker2 = new EgWalker();
  walker2.applyEvent(eventB);
  walker2.applyEvent(eventA);

  // Both must produce IDENTICAL content — this is convergence
  expect(walker1.getContent()).toBe(walker2.getContent());

  // Also verify both contain both characters
  expect(walker1.getContent()).toHaveLength(2);
  expect(walker1.getContent()).toContain('X');
  expect(walker1.getContent()).toContain('Y');
});

// ── Test 4 — concurrent delete and insert ────────────────────────────────────

test('convergence: concurrent delete and insert converge', () => {
  // Start with 'AB'
  const e1 = makeInsert('e1', [], 0, 'A');
  const e2 = makeInsert('e2', ['e1'], 1, 'B');

  // Client A deletes 'A' at position 0, seeing 'AB' (parents=[e2])
  const delA = makeDelete('del', ['e2'], 0, 'client_A');

  // Client B inserts 'C' at position 1, seeing 'AB' (parents=[e2])
  const insC = makeInsert('ins', ['e2'], 1, 'C', 'client_B');

  // Instance 1: delete then insert
  const walker1 = new EgWalker();
  walker1.applyEvent(e1);
  walker1.applyEvent(e2);
  walker1.applyEvent(delA);
  walker1.applyEvent(insC);

  // Instance 2: insert then delete
  const walker2 = new EgWalker();
  walker2.applyEvent(e1);
  walker2.applyEvent(e2);
  walker2.applyEvent(insC);
  walker2.applyEvent(delA);

  expect(walker1.getContent()).toBe(walker2.getContent());
});

// ── Test 5 — Figure 4 replay ──────────────────────────────────────────────────

test('Figure 4 replay produces Hey!', () => {
  const walker = new EgWalker();

  // e1: insert 'H' at 0, empty document
  walker.applyEvent(makeInsert('e1', [], 0, 'H'));

  // e2: client A inserts 'i' at 1, saw 'H'
  walker.applyEvent(makeInsert('e2', ['e1'], 1, 'i', 'client_A'));

  // e3: client B inserts 'e' at 1, saw 'H' — concurrent with e2
  walker.applyEvent(makeInsert('e3', ['e1'], 1, 'e', 'client_B'));

  // e4: client B inserts 'y' at 2, saw 'He'
  walker.applyEvent(makeInsert('e4', ['e3'], 2, 'y', 'client_B'));

  // e5: client B deletes position 1 seeing 'Hey' — deletes 'e'? 
  // Actually client B saw 'Hey' and wants to keep it, so e5 deletes
  // the 'i' that client A inserted. Client B saw e4 so parents=[e4]
  // At e4, content from B's perspective is 'Hey' but 'i' is concurrent
  // so B deletes position 1 which in B's view is 'e' — wait, let's think differently

  // The correct Figure 4: result is 'Hey!' meaning 'i' got deleted
  // Client A: inserts 'i' (e2), then deletes their own 'i' (e7, parents=[e2])
  // Client B: inserts 'e','y','!' (e3,e4,e6), concurrent with A

  // e5 doesn't exist in this interpretation — let's use 6 events:
  walker.applyEvent(makeInsert('e5', ['e4'], 3, '!', 'client_B'));

  // e6: client A deletes 'i' at position 1, saw 'Hi' (parents=[e2])
  walker.applyEvent(makeDelete('e6', ['e2'], 1, 'client_A'));

  expect(walker.getContent()).toBe('Hey!');
});

// ── Test 6 — critical version discard + concurrent event ─────────────────────

test('critical version discard does not break subsequent concurrent events', () => {
  const walker = new EgWalker();

  walker.applyEvent(makeInsert('e1', [], 0, 'H'));
  walker.applyEvent(makeInsert('e2', ['e1'], 1, 'e'));
  walker.applyEvent(makeInsert('e3', ['e2'], 2, 'l'));
  walker.applyEvent(makeInsert('e4', ['e3'], 3, 'l'));
  walker.applyEvent(makeInsert('e5', ['e4'], 4, 'o'));

  // Concurrent event — saw document at e3, not e5
  walker.applyEvent(makeInsert('e6', ['e3'], 3, 'X', 'client_B'));

  const content = walker.getContent();

  expect(content).toContain('X');
  expect(content).toContain('H');
  expect(content).toContain('o');
  expect(content).toHaveLength(6);
});