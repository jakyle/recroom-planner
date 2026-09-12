import { describe, it, expect } from 'vitest';
import { parseHash, hrefFor } from '../src/lib/router';

describe('parseHash', () => {
  it('empty hash is landing', () => {
    expect(parseHash('')).toEqual({ name: 'landing' });
    expect(parseHash('#/')).toEqual({ name: 'landing' });
  });
  it('join carries the token', () => {
    expect(parseHash('#/join/abc-DEF_123')).toEqual({ name: 'join', token: 'abc-DEF_123' });
  });
  it('project with and without scenario', () => {
    expect(parseHash('#/p/11111111-1111-1111-1111-111111111111')).toEqual({
      name: 'project', projectId: '11111111-1111-1111-1111-111111111111', scenarioId: null,
    });
    expect(parseHash('#/p/P1/s/S1')).toEqual({ name: 'project', projectId: 'P1', scenarioId: 'S1' });
  });
  it('setup route', () => {
    expect(parseHash('#/setup')).toEqual({ name: 'setup' });
  });
  it('unknown is not_found', () => {
    expect(parseHash('#/nope/x')).toEqual({ name: 'not_found', hash: '#/nope/x' });
  });
  it('hrefFor round-trips', () => {
    for (const h of ['#/', '#/join/tok', '#/p/P1', '#/p/P1/s/S1', '#/setup']) {
      expect(hrefFor(parseHash(h))).toBe(h);
    }
  });
});
