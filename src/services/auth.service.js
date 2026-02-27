const { HttpError } = require("./errors");
const { signJwtHs256 } = require("../middlewares/auth.middleware");

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

function getDemoUsers() {
  return [
    {
      id: "1",
      username: "admin",
      password: process.env.DEMO_ADMIN_PASSWORD || "admin123",
      role: "admin",
    },
    {
      id: "2",
      username: "user",
      password: process.env.DEMO_USER_PASSWORD || "user123",
      role: "user",
    },
  ];
}

async function login(username, password) {
  const normalizedUsername = String(username || "").trim();
  const normalizedPassword = String(password || "");

  if (!normalizedUsername || !normalizedPassword) {
    throw new HttpError(400, "username and password are required");
  }

  const matchedUser = getDemoUsers().find(
    (user) => user.username === normalizedUsername && user.password === normalizedPassword
  );
  if (!matchedUser) {
    throw new HttpError(401, "Invalid credentials");
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new HttpError(500, "JWT_SECRET is not configured");
  }

  const expiresIn = toPositiveInt(process.env.JWT_EXPIRES_IN_SECONDS, 3600);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claims = {
    sub: matchedUser.id,
    role: matchedUser.role,
    username: matchedUser.username,
    iat: nowSeconds,
    exp: nowSeconds + expiresIn,
  };
  const accessToken = signJwtHs256(claims, jwtSecret);

  return {
    accessToken,
    tokenType: "Bearer",
    expiresIn,
    user: {
      id: matchedUser.id,
      username: matchedUser.username,
      role: matchedUser.role,
    },
  };
}

module.exports = {
  login,
};
