import { EventGraph } from './eventGraph.js';
import { EgEvent } from './types.js';

// Helper to make a simple insert event
function makeEvent(id: string, parents: string[]): EgEvent {
  return {
    id,
    clientId: 'client_A',
    parents,
    op: { type: 'insert', index: 0, char: 'x' },
  };
}

describe('EventGraph', () => {

  test('getFrontier returns only the last event in a linear chain', () => {
    const graph = new EventGraph();
    graph.addEvent(makeEvent('e1', []));
    graph.addEvent(makeEvent('e2', ['e1']));
    graph.addEvent(makeEvent('e3', ['e2']));

    const frontier = graph.getFrontier();
    expect(frontier).toEqual(['e3']);
  });

  test('getFrontier returns both tips when two events are concurrent', () => {
    const graph = new EventGraph();
    graph.addEvent(makeEvent('e1', []));
    graph.addEvent(makeEvent('e2', ['e1'])); // concurrent with e3
    graph.addEvent(makeEvent('e3', ['e1'])); // concurrent with e2

    const frontier = graph.getFrontier().sort();
    expect(frontier).toEqual(['e2', 'e3']);
  });

  test('diff: concurrent events each appear in the others only-in set', () => {
    const graph = new EventGraph();
    graph.addEvent(makeEvent('e1', []));
    graph.addEvent(makeEvent('e2', ['e1']));
    graph.addEvent(makeEvent('e3', ['e1'])); // concurrent with e2

    // From e2's perspective, looking at e3's parents [e1]
    const { toRetreat, toAdvance } = graph.diff(['e2'], ['e1']);

    // e2 is in current but not in target → retreat
    expect(toRetreat).toContain('e2');
    // nothing to advance — e1 is already an ancestor of e2
    expect(toAdvance).toHaveLength(0);
  });

  test('topologicalSort: parents always come before children', () => {
    const graph = new EventGraph();
    graph.addEvent(makeEvent('e1', []));
    graph.addEvent(makeEvent('e2', ['e1']));
    graph.addEvent(makeEvent('e3', ['e2']));

    const sorted = graph.topologicalSort(new Set(['e1', 'e2', 'e3']));

    // e1 must come before e2, e2 before e3
    expect(sorted.indexOf('e1')).toBeLessThan(sorted.indexOf('e2'));
    expect(sorted.indexOf('e2')).toBeLessThan(sorted.indexOf('e3'));
  });

});