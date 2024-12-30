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


let client;
// Initialize OpenID Client
async function initializeClient() {
    const issuer = await Issuer.discover(process.env.COGNITO_ISSUER);
    client = new issuer.Client({
        client_id: process.env.client_id,
        client_secret: process.env.client_secret,
        redirect_uris: ['http://localhost:3000/auth/callback'],
        response_types: ['code']
    });
};
initializeClient().catch(console.error);

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
app.get('/', checkAuth,(req, res) => {
    // console.log(req.session)
    res.render('index', { 
        title: 'Serverless with Express and EJS',
        isAuthenticated: req.isAuthenticated,
        userInfo: req.session.userInfo
    });
});

app.get('/api', (req, res) => {
    res.json({ message: "Hello from the serverless Express API!" });
});

// login route
app.get('/login', (req, res) => {
    const nonce = generators.nonce();
    const state = generators.state();

    req.session.nonce = nonce;
    req.session.state = state;

    const authUrl = client.authorizationUrl({
        scope: 'phone openid email',
        state: state,
        nonce: nonce,
    });

    res.redirect(authUrl);
});

// Function to add a team member to DynamoDB
const addTeamMember = async (user_id, email) => {
    // Define the table name
    const tableName = 'TeamMembers';
    
    // Prepare the parameters for the put operation
    const params = {
      TableName: tableName,
      Item: {
        user_id: user_id ,  // Assuming 'username' is the partition key
        email: email,        // Storing the email of the user
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
        const params = client.callbackParams(req);
        console.log("params:", params)
        const tokenSet = await client.callback(
            'http://localhost:3000/auth/callback',
            params,
            {
                nonce: req.session.nonce,
                state: req.session.state
            }
        );

        // console.log('tokenSet:', tokenSet);
        const userInfo = await client.userinfo(tokenSet.access_token);
        req.session.userInfo = userInfo;
        addTeamMember(userInfo.username, userInfo.email)
        console.log("userInfo:",userInfo)

        res.redirect('/dashboard');
    } catch (err) {
        console.error('Callback error:', err);
        res.redirect('/');
    }
});

// logout route
app.get('/logout', (req, res) => {
    req.session.destroy();
    const logoutUrl = `https://eu-west-1q1swh7jxc.auth.eu-west-1.amazoncognito.com/logout?client_id=4b0afaa3jdqb7jqk51mng01np8&logout_uri=http://localhost:3000/`;
    res.redirect(logoutUrl);
});



app.listen(3000, () => {
    console.log("Listening on port 3000")
}); 
// Wrap the Express app for Lambda
// const server = awsServerlessExpress.createServer(app);

// exports.handler = (event, context) => {
//     awsServerlessExpress.proxy(server, event, context);
// };
