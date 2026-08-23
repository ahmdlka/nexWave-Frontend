import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRouteLegs } from './route-legs';

const racks = {
  'A-01': { access_node: 'A_NODE' },
  'B-02': { access_node: 'B_NODE' },
  'C-03': { access_node: 'C_NODE' },
};

const route = [
  { location_id: 'A-01' },
  { location_id: 'B-02' },
  { location_id: 'C-03' },
];

const findPath = (fromNode: string, toNode: string) => [fromNode, toNode];

test('builds consecutive route legs from I/O through every pick location', () => {
  const legs = buildRouteLegs(route, racks, false, findPath);

  assert.deepEqual(
    legs.map(({ fromNode, toNode }) => [fromNode, toNode]),
    [
      ['DEPOT', 'A_NODE'],
      ['A_NODE', 'B_NODE'],
      ['B_NODE', 'C_NODE'],
    ],
  );
});

test('adds the return leg only after every pick has been completed', () => {
  const incompleteLegs = buildRouteLegs(route, racks, false, findPath);
  const completeLegs = buildRouteLegs(route, racks, true, findPath);
  const returnLeg = completeLegs.at(-1);

  assert.equal(incompleteLegs.at(-1)?.toNode, 'C_NODE');
  assert.ok(returnLeg);
  assert.deepEqual([returnLeg.fromNode, returnLeg.toNode], ['C_NODE', 'DEPOT']);
});

test('keeps rack codes available for route labels instead of graph node IDs', () => {
  const completeLegs = buildRouteLegs(route, racks, true, findPath);

  assert.equal(completeLegs[1].fromLocationId, 'A-01');
  assert.equal(completeLegs.at(-1)?.fromLocationId, 'C-03');
});
