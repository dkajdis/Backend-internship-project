const authService = require("../src/services/auth.service");
const { verifyJwtHs256 } = require("../src/middlewares/auth.middleware");

describe("auth.service", () => {
  const oldJwtSecret = process.env.JWT_SECRET;
  const oldJwtExpiresInSeconds = process.env.JWT_EXPIRES_IN_SECONDS;
  const oldDemoAdminPassword = process.env.DEMO_ADMIN_PASSWORD;
  const oldDemoUserPassword = process.env.DEMO_USER_PASSWORD;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_EXPIRES_IN_SECONDS = "120";
    process.env.DEMO_ADMIN_PASSWORD = "admin-pass";
    process.env.DEMO_USER_PASSWORD = "user-pass";
  });

  afterAll(() => {
    process.env.JWT_SECRET = oldJwtSecret;
    process.env.JWT_EXPIRES_IN_SECONDS = oldJwtExpiresInSeconds;
    process.env.DEMO_ADMIN_PASSWORD = oldDemoAdminPassword;
    process.env.DEMO_USER_PASSWORD = oldDemoUserPassword;
  });

  test("login succeeds for admin and returns usable JWT claims", async () => {
    const out = await authService.login("admin", "admin-pass");

    expect(out.tokenType).toBe("Bearer");
    expect(out.expiresIn).toBe(120);
    expect(out.user).toMatchObject({
      id: "1",
      username: "admin",
      role: "admin",
    });

    const claims = verifyJwtHs256(out.accessToken, process.env.JWT_SECRET);
    expect(claims.sub).toBe("1");
    expect(claims.role).toBe("admin");
    expect(claims.username).toBe("admin");
    expect(claims.exp - claims.iat).toBe(120);
  });

  test("login fails with 400 when username/password are missing", async () => {
    await expect(authService.login("", "")).rejects.toMatchObject({
      status: 400,
      message: "username and password are required",
    });
  });

  test("login fails with 401 for invalid credentials", async () => {
    await expect(authService.login("admin", "wrong-pass")).rejects.toMatchObject({
      status: 401,
      message: "Invalid credentials",
    });
  });

  test("login fails with 500 when JWT_SECRET is missing", async () => {
    process.env.JWT_SECRET = "";
    await expect(authService.login("admin", "admin-pass")).rejects.toMatchObject({
      status: 500,
      message: "JWT_SECRET is not configured",
    });
  });
});
