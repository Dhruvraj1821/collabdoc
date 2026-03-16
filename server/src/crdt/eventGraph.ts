import { EventId, EgEvent } from './types.js';

export class EventGraph {
  private events: Map<EventId, EgEvent> = new Map();

  addEvent(event: EgEvent): void {
    if (this.events.has(event.id)) return;
    this.events.set(event.id, event);
  }

  getEvent(id: EventId): EgEvent | undefined {
    return this.events.get(id);
  }

  getFrontier(): EventId[] {
    const hasChildren = new Set<EventId>();
    for (const event of this.events.values()) {
      for (const parentId of event.parents) {
        hasChildren.add(parentId);
      }
    }

    const frontier: EventId[] = [];
    for (const id of this.events.keys()) {
      if (!hasChildren.has(id)) {
        frontier.push(id);
      }
    }
    return frontier;
  }

  getAncestors(eventIds: EventId[]): Set<EventId> {
    const visited = new Set<EventId>();
    const stack = [...eventIds];

    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const event = this.events.get(id);
      if (!event) continue;

      for (const parentId of event.parents) {
        if (!visited.has(parentId)) {
          stack.push(parentId);
        }
      }
    }

    return visited;
  }

  diff(
    currentPrepare: EventId[],
    targetParents: EventId[]
  ): { toRetreat: EventId[]; toAdvance: EventId[] } {
    const currentAncestors = this.getAncestors(currentPrepare);
    const targetAncestors = this.getAncestors(targetParents);

    const toRetreat: EventId[] = [];
    for (const id of currentAncestors) {
      if (!targetAncestors.has(id)) {
        toRetreat.push(id);
      }
    }

    const toAdvance: EventId[] = [];
    for (const id of targetAncestors) {
      if (!currentAncestors.has(id)) {
        toAdvance.push(id);
      }
    }

    return { toRetreat, toAdvance };
  }

  topologicalSort(eventIds: Set<EventId>): EventId[] {
    const inDegree = new Map<EventId, number>();
    for (const id of eventIds) {
      inDegree.set(id, 0);
    }

    for (const id of eventIds) {
      const event = this.events.get(id);
      if (!event) continue;
      for (const parentId of event.parents) {
        if (eventIds.has(parentId)) {
          inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
        }
      }
    }

    const queue: EventId[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const sorted: EventId[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      sorted.push(id);

      for (const otherId of eventIds) {
        const otherEvent = this.events.get(otherId);
        if (!otherEvent) continue;
        if (otherEvent.parents.includes(id)) {
          const newDegree = (inDegree.get(otherId) ?? 0) - 1;
          inDegree.set(otherId, newDegree);
          if (newDegree === 0) queue.push(otherId);
        }
      }
    }

    return sorted;
  }

  isCriticalVersion(frontier: EventId[]): boolean {
    if (this.events.size === 0) return false;

    const frontierAncestors = this.getAncestors(frontier);

    for (const event of this.events.values()) {
      if (frontierAncestors.has(event.id)) continue;

      const eventAncestors = this.getAncestors([event.id]);
      for (const fId of frontier) {
        if (!eventAncestors.has(fId)) {
          return false;
        }
      }
    }

    return true;
  }
}