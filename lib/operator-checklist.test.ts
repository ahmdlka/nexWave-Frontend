import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { getActiveStep, isChecklistComplete, updateActiveStepStatus, updateStepStatusById } from './operator-checklist';

const route = [
  { step: 1, location_id: 'A-01', status: 'pending' as const },
  { step: 2, location_id: 'B-02', status: 'pending' as const },
];

test('marks only the current actionable step in the local checklist', () => {
  const updated = updateActiveStepStatus(route, 'picked');

  assert.deepEqual(updated.map(({ location_id, status }) => [location_id, status]), [
    ['A-01', 'picked'],
    ['B-02', 'pending'],
  ]);
  assert.equal(getActiveStep(updated)?.location_id, 'B-02');
});

test('treats picked and problem steps as locally complete', () => {
  assert.equal(isChecklistComplete([{ ...route[0], status: 'picked' }, { ...route[1], status: 'problem' }]), true);
  assert.equal(isChecklistComplete(route), false);
});

test('updates only the confirmed item when duplicate rack locations exist', () => {
  const duplicateLocationRoute = [
    { id: 11, step: 1, location_id: 'A-01', status: 'pending' as const },
    { id: 12, step: 2, location_id: 'A-01', status: 'pending' as const },
    { id: 13, step: 3, location_id: 'B-02', status: 'pending' as const },
  ];

  const updated = updateStepStatusById(duplicateLocationRoute, 11, 'picked');

  assert.deepEqual(updated.map(({ id, location_id, status }) => [id, location_id, status]), [
    [11, 'A-01', 'picked'],
    [12, 'A-01', 'pending'],
    [13, 'B-02', 'pending'],
  ]);
  assert.equal(getActiveStep(updated)?.id, 12);
});

test('operator page does not reference deprecated checklist endpoints', async () => {
  const page = await readFile(new URL('../app/operator/page.tsx', import.meta.url), 'utf8');

  assert.equal(page.includes("'/api/pick/confirm'"), false);
  assert.equal(page.includes("'/api/wave/problem'"), false);
  assert.equal(page.includes("'/api/wave/done'"), true);
});

test('manager page uses direct Supabase query helpers instead of removed Modal routes', async () => {
  const page = await readFile(new URL('../app/manager/page.tsx', import.meta.url), 'utf8');

  assert.equal(page.includes('/api/dev/generate-orders'), false);
  assert.equal(page.includes('/api/wave/active'), false);
  assert.equal(page.includes('/api/shift/summary'), false);
  assert.equal(page.includes("from '@/lib/supabase-queries'"), true);
});

test('finish control is in the left panel and invokes only wave done through submit', async () => {
  const page = await readFile(new URL('../app/operator/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /async function finishWave\(\)[\s\S]*submit\('\/api\/wave\/done', \{ wave_id: wave\.wave_id \}\)/);
  assert.equal(page.includes('confirmPickDirect'), false);
  assert.equal(page.includes('reportProblemDirect'), false);
});

test('test script discovers every TypeScript test file in lib', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: { test?: string } };

  assert.equal(packageJson.scripts.test, 'tsx --test lib/*.test.ts');
});

test('operator renders checklist only in the active rack card', async () => {
  const page = await readFile(new URL('../app/operator/page.tsx', import.meta.url), 'utf8');

  assert.equal(page.includes('Checklist</Button>'), true);
  assert.equal(page.includes('Konfirmasi pick'), false);
  assert.equal(page.includes('Laporkan masalah'), false);
});

test('map viewer renders active blue and future orange route states', async () => {
  const viewer = await readFile(new URL('../components/MapViewer.tsx', import.meta.url), 'utf8');

  assert.equal(viewer.includes("stroke={routeState === 'active' ? '#0056d6' : '#ff6600'}"), true);
  assert.equal(viewer.includes("if (routeState === 'completed') return null;"), true);
  assert.equal(viewer.includes("transition: 'stroke 240ms ease, opacity 240ms ease'"), true);
});

test('operator route query exposes the persisted wave-location identity for card keys', async () => {
  const page = await readFile(new URL('../app/operator/page.tsx', import.meta.url), 'utf8');
  const queries = await readFile(new URL('../lib/supabase-queries.ts', import.meta.url), 'utf8');

  assert.equal(page.includes('step.route_item_id ?? step.location_id'), true);
  assert.equal(queries.includes("select('id, visit_order, location_id, status, orders(product_ref, qty), locations(x,y,z)')"), true);
});

test('operator cards and map pins use an index fallback for duplicate route locations', async () => {
  const page = await readFile(new URL('../app/operator/page.tsx', import.meta.url), 'utf8');
  const viewer = await readFile(new URL('../components/MapViewer.tsx', import.meta.url), 'utf8');

  assert.equal(page.includes('wave.route.map((step, index)'), true);
  assert.equal(page.includes('key={`${step.route_item_id ?? step.location_id}-${index}`}'), true);
  assert.equal(viewer.includes('route.map((step, index)'), true);
  assert.equal(viewer.includes('key={`${step.route_item_id ?? step.location_id}-${index}`}'), true);
});
