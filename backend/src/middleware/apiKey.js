import { verifyApiKey, parseScopes } from '../services/apiKeys.js';

export function requireApiKey(requiredScope) {
  return (req, res, next) => {
    const key =
      req.header('x-api-key') ||
      req.header('authorization')?.replace(/^Bearer\s+/i, '') ||
      req.query.api_key;

    if (!key) return res.status(401).json({ error: 'API-Key fehlt (Header X-API-Key)' });

    const row = verifyApiKey(key);
    if (!row) return res.status(401).json({ error: 'Ungültiger API-Key' });

    const scopes = parseScopes(row);
    if (requiredScope && !scopes.includes(requiredScope) && !scopes.includes('*')) {
      return res.status(403).json({ error: `Scope fehlt: ${requiredScope}` });
    }
    req.apiKey = row;
    req.apiScopes = scopes;
    next();
  };
}
