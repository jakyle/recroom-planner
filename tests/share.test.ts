import { describe, it, expect, beforeEach } from 'vitest';
import { joinUrl, stashTokens, readTokens, clearTokens } from '../src/lib/share';

describe('joinUrl', () => {
  it('builds a hash join link on the current page', () => {
    expect(joinUrl('tok123', 'https://jakyle.github.io', '/recroom-planner/')).toBe(
      'https://jakyle.github.io/recroom-planner/#/join/tok123',
    );
  });
});

describe('token stash', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips per project and clears', () => {
    stashTokens('P1', { view: 'v1', edit: 'e1' });
    expect(readTokens('P1')).toEqual({ view: 'v1', edit: 'e1' });
    expect(readTokens('P2')).toBeNull();
    stashTokens('P1', { view: 'v2' });
    expect(readTokens('P1')).toEqual({ view: 'v2', edit: 'e1' });
    clearTokens('P1');
    expect(readTokens('P1')).toBeNull();
  });
});
