import { findShortestPath } from './astar';

export const IO_NODE = 'DEPOT';

export type RouteStop = {
  location_id: string;
};

export type RackAccess = Record<string, { access_node: string }>;

export type PathFinder = (fromNode: string, toNode: string) => string[];

export type RouteLeg = {
  id: string;
  fromNode: string;
  toNode: string;
  fromLocationId?: string;
  toLocationId?: string;
  kind: 'pick' | 'return';
  waypoints: string[];
};

export function getRouteLegState(legIndex: number, activeLegIndex: number) {
  if (legIndex < activeLegIndex) return 'completed' as const;
  if (legIndex === activeLegIndex) return 'active' as const;
  return 'future' as const;
}

export function buildRouteLegs(
  route: RouteStop[],
  racks: RackAccess,
  isComplete: boolean,
  pathFinder: PathFinder = findShortestPath,
): RouteLeg[] {
  const legs: RouteLeg[] = [];
  let fromNode = IO_NODE;
  let fromLocationId: string | undefined;

  route.forEach((stop) => {
    const toNode = racks[stop.location_id]?.access_node;
    if (!toNode) return;

    const waypoints = pathFinder(fromNode, toNode);
    if (waypoints.length >= 2) {
      legs.push({
        id: `pick-${stop.location_id}`,
        fromNode,
        toNode,
        fromLocationId,
        toLocationId: stop.location_id,
        kind: 'pick',
        waypoints,
      });
    }

    fromNode = toNode;
    fromLocationId = stop.location_id;
  });

  if (isComplete && legs.length > 0) {
    const waypoints = pathFinder(fromNode, IO_NODE);
    if (waypoints.length >= 2) {
      legs.push({
        id: 'return-to-io',
        fromNode,
        toNode: IO_NODE,
        fromLocationId,
        kind: 'return',
        waypoints,
      });
    }
  }

  return legs;
}
