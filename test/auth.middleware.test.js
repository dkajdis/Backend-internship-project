const crypto = require("crypto");
const { requireAuth, requireRole } = require("../src/middlewares/auth.middleware");

function toBase64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signHs256Token(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = toBase64Url(Buffer.from(JSON.stringify(header)));
  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(payload)));
  const signature = toBase64Url(
    crypto.createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest()
  );
  return `${headerB64}.${payloadB64}.${signature}`;
}

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

describe("auth.middleware", () => {
  const secret = "test-jwt-secret";
  const oldSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
  });

  afterAll(() => {
    process.env.JWT_SECRET = oldSecret;
  });

  test("requireAuth returns 401 when Authorization header is missing", () => {
    const req = { get: () => null };
    const res = createRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("requireAuth returns 401 when token signature is invalid", () => {
    const payload = { sub: "u1", role: "admin", exp: Math.floor(Date.now() / 1000) + 60 };
    const token = signHs256Token(payload, "wrong-secret");
    const req = { get: () => `Bearer ${token}` };
    const res = createRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("requireAuth attaches user claims and calls next for valid token", () => {
    const payload = { sub: "u42", role: "user", exp: Math.floor(Date.now() / 1000) + 60 };
    const token = signHs256Token(payload, secret);
    const req = { get: () => `Bearer ${token}` };
    const res = createRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      id: "u42",
      role: "user",
    });
    expect(req.user.claims.sub).toBe("u42");
  });

  test("requireRole returns 403 when role does not match", () => {
    const req = { user: { id: "u1", role: "user" } };
    const res = createRes();
    const next = jest.fn();

    requireRole("admin")(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test("requireRole calls next when role matches", () => {
    const req = { user: { id: "u1", role: "admin" } };
    const res = createRes();
    const next = jest.fn();

    requireRole("admin")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
