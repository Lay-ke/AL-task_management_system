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
    if (req.session.isAdmin) {
      next();
    } else {
      res.redirect('/admin/login');
    }
  };

// user
const authenticateUser = (req, res, next) => {
    if (req.session.isUser) {
      next();
    } else {
      res.redirect('/user/login');
    }
  };

module.exports = {checkAuth, authenticateAdmin};