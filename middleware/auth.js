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
  if (!req.session.adminInfo) {
      req.isAuthenticated = false;
      // console.log("Not authenticated. Cookies: ", req.cookies);
      return res.redirect('/admin-login'); // Stop further execution
  } 
  
  console.log("Authenticated. Admin Info: ", req.session.adminInfo);
  req.isAuthenticated = true;
  next(); // Proceed to the next middleware or route
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