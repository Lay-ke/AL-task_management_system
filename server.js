const express = require('express');
const awsServerlessExpress = require('aws-serverless-express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');
const AWS = require('aws-sdk');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
// const DynamoDBStore = require('connect-dynamodb')(session);
const path = require('path');
const adminRoutes = require('./routes/adminRoute');
const userRoutes = require('./routes/userRoute');
const {checkAuth} = require('./middleware/auth');
require('dotenv').config()

const app = express();

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'eu-west-1'
});
  
const dynamodb = new AWS.DynamoDB.DocumentClient();
// Set up the Cognito Identity Service Provider
const cognito = new AWS.CognitoIdentityServiceProvider();


let client1, client2;
// Initialize OpenID Client
async function initializeClient1() {
    const issuer1 = await Issuer.discover(process.env.COGNITO_ISSUER);
    client1 = new issuer1.Client({
        client_id: process.env.client_id,
        client_secret: process.env.client_secret,
        redirect_uris: ['http://localhost:3000/auth/callback'],
        response_types: ['code']
    });
};

// Initialize OpenID Client for Admin
async function initializeClient2() {
    const issuer2 = await Issuer.discover(process.env.COGNITO_ISSUER2);
    client2 = new issuer2.Client({
        client_id: process.env.client_id2,
        client_secret: process.env.client_secret2,
        redirect_uris: ['http://localhost:3000/auth/admin'],
        response_types: ['code']
    });
};

// Initialize both clients asynchronously
async function initializeClients() {
    await initializeClient1();
    await initializeClient2();
}
initializeClients().catch(console.error);

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));  // Adjust if necessary
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Middleware
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'some secret',
    resave: false,
    saveUninitialized: false
}));

// Admin routes
app.use(adminRoutes);

// User routes
app.use(userRoutes);

// Define routes


// login route
app.get('/login', (req, res) => {
    const nonce = generators.nonce();
    const state = generators.state();

    req.session.nonce = nonce;
    req.session.state = state;

    const authUrl = client1.authorizationUrl({
        scope: 'email openid phone',
        state: state,
        nonce: nonce,
    });

    res.redirect(authUrl);
});

// Function to add a team member to DynamoDB
const addTeamMember = async (userInfo) => {
    // Define the table name
    const tableName = 'TeamMembers';
    
    // Prepare the parameters for the put operation
    const params = {
      TableName: tableName,
      Item: {
        user_id: userInfo.sub ,  // Assuming 'username' is the partition key
        username: userInfo.username,        // Storing the email of the user
        email: userInfo.email,        // Storing the email of the user
        subcribe_email: false,
        createdAt: new Date().toISOString(), // Timestamp of when the team member is added
      }
    };
    
    try {
      // Use the DynamoDB DocumentClient to insert the item
      const result = await dynamodb.put(params).promise();
      console.log('Team member added successfully');
    } catch (error) {
      console.error('Error adding team member:', error);
    }
  };

// function to find a team member
const findUserById = async (Id) => {
    const params = {
        TableName: 'TeamMembers',
        Key: {
            user_id: Id // Assuming the email is the primary key in the DynamoDB table
        }
    };

    try {
        const result = await dynamodb.get(params).promise();
        return result.Item; // If the user exists, it returns the user details
    } catch (err) {
        console.error('Error fetching user from DynamoDB:', err);
        return null;
    }
};


// const addAdmin = async (adminInfo) => {
//   // Define the table name
//   const tableName = 'Admins';
  
//   // Prepare the parameters for the put operation
//   const params = {
//     TableName: tableName,
//     Item: {
//       user_id: adminInfo.sub ,  // Assuming 'username' is the partition key
//       username: adminInfo.username,        // Storing the email of the user
//       email: adminInfo.email,        // Storing the email of the user
//       createdAt: new Date().toISOString(), // Timestamp of when the team member is added
//     }
//   };
  
//   try {
//     // Use the DynamoDB DocumentClient to insert the item
//     const result = await dynamodb.put(params).promise();
//     console.log('Admin added successfully');
//   } catch (error) {
//     console.error('Error adding team member:', error);
//   }
// };

// Helper function to get the path from the URL. Example: "http://localhost/hello" returns "/hello"
function getPathFromURL(urlString) {
    try {
        const url = new URL(urlString);
        return url.pathname;
    } catch (error) {
        console.error('Invalid URL:', error);
        return null;
    }
}


app.get(getPathFromURL('http://localhost:3000/auth/callback'), async (req, res) => {
    try {
        const params = client1.callbackParams(req);
        console.log("params:", params)
        const tokenSet = await client1.callback(
            'http://localhost:3000/auth/callback',
            params,
            {
                nonce: req.session.nonce,
                state: req.session.state
            }
        );

        // console.log('tokenSet:', tokenSet);
        const userInfo = await client1.userinfo(tokenSet.access_token);
        req.session.userInfo = userInfo;

        // Check if the user already exists in DynamoDB (based on email)
        const existingUser = await findUserById(userInfo.sub);
        console.log("existingUser:",existingUser)

        if (!existingUser) {
            // If the user doesn't exist, add them as a team member
            addTeamMember(userInfo);
            console.log('New user added:', userInfo);
        } else {
            console.log('User already exists, skipping addition.');
        };

        res.redirect('/dashboard');
    } catch (err) {
        console.error('Callback error:', err);
        res.redirect('/');
    }
});

// logout route
app.get('/logout', (req, res) => {
    req.session.destroy();
    const logoutUrl = `https://eu-west-1rncdsddby.auth.eu-west-1.amazoncognito.com/logout?client_id=iehkfrjqfvod1c3g7k73lhtvc&logout_uri=<logout uri>`;
    res.redirect('/');
});

// admin authentication
app.get('/admin', checkAuth, (req, res) => {
    res.render('admin/aindex', {
        title: 'Welcome to the Admin Panel!',
    });
});

  // admin login route
app.get('/admin-login', (req, res) => {
  const nonce = generators.nonce();
  const state = generators.state();

  req.session.nonce = nonce;
  req.session.state = state;
  const authUrl = client2.authorizationUrl({
      scope: 'phone openid email',
      state: state,
      nonce: nonce,
  });

    res.redirect(authUrl);
});



app.get(getPathFromURL('http://localhost:3000/auth/admin'), async (req, res) => {
    try {
        const params = client2.callbackParams(req);
        const tokenSet = await client2.callback(
            'http://localhost:3000/auth/admin',
            params,
            {
                nonce: req.session.nonce,
                state: req.session.state
            }
        );

        const userInfo = await client2.userinfo(tokenSet.access_token);
        req.session.userInfo = userInfo;
        // console.log("adminInfo:",userInfo);

        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error('Callback error:', err);
        res.redirect('/');
    }
});

// Logout route
app.get('/admin-logout', (req, res) => {
    req.session.userInfo = null;
    const logoutUrl = `https://<user pool domain>/logout?client_id=4jedd7t37nnt1vsd981k4h5fs0&logout_uri=<logout uri>`;
    res.redirect('/admin');
});

app.listen(3000, () => {
    console.log("Listening on port 3000")
}); 
// Wrap the Express app for Lambda
// const server = awsServerlessExpress.createServer(app);

// exports.handler = (event, context) => {
//     awsServerlessExpress.proxy(server, event, context);
// };

module.exports = {app};