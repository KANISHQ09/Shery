import crypto from 'node:crypto';
import config from '../config/env.js';

/**
 * True when the request carries the team's demo passcode (header `x-demo-passcode`).
 * Compared in constant time. Always false when DEMO_ADMIN_PASSCODE is not configured.
 */
export function hasDemoAdminPasscode(req) {
  const expected = config.demoAdminPasscode;
  if (!expected) return false;

  const provided = String(req.headers['x-demo-passcode'] || '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default hasDemoAdminPasscode;
