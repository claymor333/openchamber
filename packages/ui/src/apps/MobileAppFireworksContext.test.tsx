import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { FireworksProvider, useFireworksCelebration } from '@/contexts/FireworksContext';

const mobileAppSource = readFileSync(new URL('./MobileApp.tsx', import.meta.url), 'utf8');

test('MobileApp provides fireworks to shared tablet panel consumers', () => {
  const runtimeStart = mobileAppSource.indexOf('<RuntimeAPIProvider apis={apis}>');
  const runtimeEnd = mobileAppSource.indexOf('</RuntimeAPIProvider>', runtimeStart);
  expect(runtimeStart).toBeGreaterThanOrEqual(0);
  expect(runtimeEnd).toBeGreaterThan(runtimeStart);
  const runtimeTree = mobileAppSource.slice(runtimeStart, runtimeEnd);

  const fireworksStart = runtimeTree.indexOf('<FireworksProvider>');
  const fireworksEnd = runtimeTree.indexOf('</FireworksProvider>', fireworksStart);
  expect(fireworksStart).toBeGreaterThanOrEqual(0);
  expect(fireworksEnd).toBeGreaterThan(fireworksStart);
  const fireworksTree = runtimeTree.slice(fireworksStart, fireworksEnd);

  expect(fireworksTree).toContain('<TooltipProvider');
  expect(fireworksTree).toContain('<MobileShell');
});

test('FireworksProvider gives a real hook consumer its celebration actions', () => {
  const actions: ReturnType<typeof useFireworksCelebration>[] = [];
  const HookConsumer = () => {
    actions.push(useFireworksCelebration());
    return null;
  };

  renderToStaticMarkup(createElement(FireworksProvider, null, createElement(HookConsumer)));

  expect(actions).toHaveLength(1);
  expect(actions[0]?.triggerFireworks).toBeInstanceOf(Function);
  expect(actions[0]?.dismissFireworks).toBeInstanceOf(Function);
});
