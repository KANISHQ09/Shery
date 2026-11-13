import { v4 as uuidv4 } from 'uuid';

// Demo identity (no login). The role comes from the role picker; the visitor id is a random
// per-browser id, so visitors using the demo at the same time keep separate chat histories.
const VISITOR_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const ALLOWED_ROLES = new Set(['student', 'instructor']);

const requestContext = (req, _res, next) => {
  const requestedRole = String(req.headers['x-demo-role'] || req.query.role || 'student').toLowerCase();
  const role = ALLOWED_ROLES.has(requestedRole) ? requestedRole : 'student';

  const visitorId = String(req.headers['x-visitor-id'] || '');
  const uid = VISITOR_ID_PATTERN.test(visitorId) ? `visitor-${visitorId}` : `open-${role}`;

  req.requestId = req.headers['x-request-id'] || uuidv4();
  req.user = {
    uid,
    email: `${role}@open.sheryai`,
    role,
  };

  next();
};

export default requestContext;
