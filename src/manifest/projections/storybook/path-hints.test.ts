import { describe, expect, it } from 'vitest';
import { storybookCommandPathHint, storybookEntityPathHint } from './path-hints.js';

describe('storybook pathHints — per-module nesting', () => {
  it('keeps flat stories/ paths when module is absent', () => {
    expect(storybookEntityPathHint({ name: 'Order' })).toBe('stories/Order.stories.tsx');
    expect(
      storybookCommandPathHint({
        commandName: 'create',
        entityName: 'Order',
      }),
    ).toBe('stories/Order/Create.stories.tsx');
  });

  it('nests under stories/<module>/ when module is set', () => {
    expect(storybookEntityPathHint({ name: 'Order', module: 'billing' })).toBe(
      'stories/billing/Order.stories.tsx',
    );
    expect(
      storybookCommandPathHint({
        commandName: 'create',
        entityName: 'Order',
        module: 'billing',
      }),
    ).toBe('stories/billing/Order/Create.stories.tsx');
  });

  it('uses Global folder when command has no entity', () => {
    expect(storybookCommandPathHint({ commandName: 'seed' })).toBe(
      'stories/Global/Seed.stories.tsx',
    );
  });

  it('sanitizes unsafe module segments', () => {
    expect(storybookEntityPathHint({ name: 'Order', module: 'Billing / Ops!' })).toBe(
      'stories/Billing_Ops/Order.stories.tsx',
    );
  });

  it('treats blank module as flat', () => {
    expect(storybookEntityPathHint({ name: 'Order', module: '   ' })).toBe(
      'stories/Order.stories.tsx',
    );
  });
});
