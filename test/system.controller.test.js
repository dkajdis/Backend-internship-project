jest.mock("../src/db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require("../src/db/pool");
const systemController = require("../src/controllers/system.controller");

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

describe("system.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("health returns 200 and ok status", () => {
    const req = {};
    const res = createRes();

    systemController.health(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ status: "ok" });
  });

  test("ready returns 200 when database is reachable", async () => {
    pool.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const req = {};
    const res = createRes();

    await systemController.ready(req, res);

    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ status: "ready" });
  });

  test("ready returns 503 when database is not reachable", async () => {
    pool.query.mockRejectedValue(new Error("db down"));
    const req = {};
    const res = createRes();

    await systemController.ready(req, res);

    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
    expect(res.statusCode).toBe(503);
    expect(res.payload).toEqual({ status: "not_ready" });
  });
});
