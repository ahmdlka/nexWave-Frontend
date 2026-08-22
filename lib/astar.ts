import mapData from '@/data/master_map_data.json';

type Graph = typeof mapData.graph;

export function findShortestPath(startNodeId: string, endNodeId: string): string[] {
  const graph: Graph = mapData.graph;

  if (!graph[startNodeId as keyof Graph] || !graph[endNodeId as keyof Graph]) return [];

  const openSet = new Set<string>([startNodeId]);
  const cameFrom: Record<string, string> = {};

  const gScore: Record<string, number> = {};
  const fScore: Record<string, number> = {};

  Object.keys(graph).forEach((nodeId) => {
    gScore[nodeId] = Infinity;
    fScore[nodeId] = Infinity;
  });

  gScore[startNodeId] = 0;
  fScore[startNodeId] = calculateHeuristic(startNodeId, endNodeId, graph);

  while (openSet.size > 0) {
    let current = Array.from(openSet).reduce((minNode, nodeId) =>
      fScore[nodeId] < fScore[minNode] ? nodeId : minNode
    );

    if (current === endNodeId) {
      const path: string[] = [current];
      while (current in cameFrom) {
        current = cameFrom[current];
        path.unshift(current);
      }
      return path;
    }

    openSet.delete(current);

    const neighbors = graph[current as keyof Graph]?.edges || {};
    for (const [neighbor, weight] of Object.entries(neighbors)) {
      const tentativeGScore = gScore[current] + (weight as number);

      if (tentativeGScore < gScore[neighbor]) {
        cameFrom[neighbor] = current;
        gScore[neighbor] = tentativeGScore;
        fScore[neighbor] = gScore[neighbor] + calculateHeuristic(neighbor, endNodeId, graph);

        if (!openSet.has(neighbor)) {
          openSet.add(neighbor);
        }
      }
    }
  }

  return [];
}

function calculateHeuristic(nodeA: string, nodeB: string, graph: Graph): number {
  const a = graph[nodeA as keyof Graph];
  const b = graph[nodeB as keyof Graph];
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y);
}