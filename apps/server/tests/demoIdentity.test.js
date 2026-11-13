import { describe, it, expect, afterEach } from 'vitest';
import requestContext from '../src/middleware/requestContext.js';
import { hasDemoAdminPasscode } from '../src/middleware/demoAdmin.js';
import config from '../src/config/env.js';

function run(headers = {}, query = {}) {
  const req = { headers, query };
  requestContext(req, {}, () => {});
  return req.user;
}

describe('requestContext (demo identity)', () => {
  it('gives each visitor their own uid from x-visitor-id', () => {
    const a = run({ 'x-visitor-id': '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed' });
    const b = run({ 'x-visitor-id': '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b' });
    expect(a.uid).toBe('visitor-1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed');
    expect(b.uid).not.toBe(a.uid);
  });

  it('falls back to the shared role uid when the visitor id is missing or malformed', () => {
    expect(run({}).uid).toBe('open-student');
    expect(run({ 'x-visitor-id': '../../etc/passwd' }).uid).toBe('open-student');
    expect(run({ 'x-visitor-id': 'x'.repeat(200) }).uid).toBe('open-student');
  });

  it('only accepts known roles', () => {
    expect(run({ 'x-demo-role': 'instructor' }).role).toBe('instructor');
    expect(run({ 'x-demo-role': 'admin' }).role).toBe('student');
  });
});

describe('hasDemoAdminPasscode', () => {
  const original = config.demoAdminPasscode;
  afterEach(() => {
    config.demoAdminPasscode = original;
  });

  it('is false when no passcode is configured', () => {
    config.demoAdminPasscode = '';
    expect(hasDemoAdminPasscode({ headers: { 'x-demo-passcode': '' } })).toBe(false);
    expect(hasDemoAdminPasscode({ headers: { 'x-demo-passcode': 'anything' } })).toBe(false);
  });

  it('matches only the exact configured passcode', () => {
    config.demoAdminPasscode = 'team-secret';
    expect(hasDemoAdminPasscode({ headers: { 'x-demo-passcode': 'team-secret' } })).toBe(true);
    expect(hasDemoAdminPasscode({ headers: { 'x-demo-passcode': 'team-secre' } })).toBe(false);
    expect(hasDemoAdminPasscode({ headers: {} })).toBe(false);
  });
});
