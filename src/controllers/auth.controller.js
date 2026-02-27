const authService = require("../services/auth.service");

// POST /auth/login
async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};
    const result = await authService.login(username, password);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

module.exports = {
  login,
};
