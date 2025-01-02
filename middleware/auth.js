const checkAuth = (req, res, next) => {
    if (!req.session.userInfo) {
        req.isAuthenticated = false;
    } else {
        req.isAuthenticated = true;
    }
    next();
};

// Authentication middleware
const authenticateAdmin = (req, res, next) => {
    if (req.session.userInfo) {
      req.isAuthenticated = true;
    } else {
      res.redirect('/admin/login');
    }
    next();
  };

// user
const authenticateUser = (req, res, next) => {
    if (req.session.userInfo && req.session.userInfo.email_verified) {
      next();
    } else {
      res.redirect('/user/login');
    }
  };

module.exports = {checkAuth, authenticateAdmin};