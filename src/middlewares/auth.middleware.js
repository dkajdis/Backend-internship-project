const crypto = require("crypto");

function toBase64Url(inputBuffer) {
  return inputBuffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseJson(input) {
  try {
    return JSON.parse(input);
  } catch (_) {
    return null;
  }
}

function decodeBase64Url(input) {
  const normalized = String(input).replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);
  return Buffer.from(padded, "base64").toString("utf8");
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function signJwtHs256(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = toBase64Url(Buffer.from(JSON.stringify(header)));
  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(payload)));
  const signature = toBase64Url(
    crypto.createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest()
  );
  return `${headerB64}.${payloadB64}.${signature}`;
}

function verifyJwtHs256(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed token");

  const [headerB64, payloadB64, signature] = parts;
  const header = parseJson(decodeBase64Url(headerB64));
  const payload = parseJson(decodeBase64Url(payloadB64));

  if (!header || !payload) throw new Error("Invalid token payload");
  if (header.alg !== "HS256") throw new Error("Unsupported JWT algorithm");

  const expected = toBase64Url(
    crypto.createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest()
  );
  if (!timingSafeEqualText(expected, signature)) throw new Error("Invalid token signature");

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp != null && Number(payload.exp) <= nowSeconds) {
    throw new Error("Token expired");
  }
  if (payload.nbf != null && Number(payload.nbf) > nowSeconds) {
    throw new Error("Token not active yet");
  }

  return payload;
}

function unauthorized(res, message = "Unauthorized") {
  return res.status(401).json({ message });
}

function forbidden(res, message = "Forbidden") {
  return res.status(403).json({ message });
}

function parseBearerToken(req) {
  const authHeader = req.get("Authorization");
  if (!authHeader) return null;

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  if (parts[0] !== "Bearer") return null;
  return parts[1] || null;
}

function requireAuth(req, res, next) {
  const token = parseBearerToken(req);
  if (!token) return unauthorized(res, "Missing or invalid Authorization header");

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ message: "JWT_SECRET is not configured" });
  }

  try {
    const claims = verifyJwtHs256(token, jwtSecret);
    req.user = {
      id: claims.sub || null,
      role: claims.role || "user",
      claims,
    };
    return next();
  } catch (_) {
    return unauthorized(res, "Invalid or expired token");
  }
}

function requireRole(expectedRole) {
  return (req, res, next) => {
    if (!req.user) return unauthorized(res, "Unauthorized");

    const actual = String(req.user.role || "").toLowerCase();
    const expected = String(expectedRole || "").toLowerCase();
    if (actual !== expected) {
      return forbidden(res, `Requires ${expectedRole} role`);
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  signJwtHs256,
  verifyJwtHs256,
};
