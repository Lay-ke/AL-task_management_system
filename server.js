const express = require('express');
const awsServerlessExpress = require('aws-serverless-express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const bodyParser = require('body-parser');
const path = require('path');
const adminRoutes = require('./routes/adminRoute');
const userRoutes = require('./routes/userRoute');
const { checkAuth, authenticateAdmin } = require('./middleware/auth');

const app = express();

// Initialize OpenID Clients
let client1, client2;
async function initializeClients() {
    try {
        const issuer1 = await Issuer.discover(process.env.COGNITO_ISSUER);
        client1 = new issuer1.Client({
            client_id: process.env.client_id,
            client_secret: process.env.client_secret,
            redirect_uris: ['https://9q2kavk7q4.execute-api.eu-west-1.amazonaws.com/dev/auth/callback'],
            response_types: ['code'],
        });

        const issuer2 = await Issuer.discover(process.env.COGNITO_ISSUER2);
        client2 = new issuer2.Client({
            client_id: process.env.client_id2,
            client_secret: process.env.client_secret2,
            redirect_uris: ['https://9q2kavk7q4.execute-api.eu-west-1.amazonaws.com/dev/auth/admin'],
            response_types: ['code'],
        });
        console.log('Client2 initialized:', client2);

    } catch (error) {
        console.error('Error initializing OpenID Clients:', error);
    }
}
initializeClients();



// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
// app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'some secret',
    resave: false,
    saveUninitialized: false,
}));

// Routes
app.use(adminRoutes);
app.use(userRoutes);

app.get('/login', (req, res) => {
    const nonce = generators.nonce();
    const state = generators.state();
    req.session.nonce = nonce;
    req.session.state = state;

    const authUrl = client1.authorizationUrl({
        scope: 'email openid phone',
        state,
        nonce,
    });
    res.redirect(authUrl);
});

// Initialize DynamoDB Client
const dynamodbClient = new DynamoDBClient({ region: 'eu-west-1' });

// Add team member to DynamoDB
const addTeamMember = async (userInfo) => {
    const params = {
        TableName: 'TeamMembers',
        Item: {
            user_id: userInfo.sub,
            username: userInfo.username,
            email: userInfo.email,
            subscribe_email: false,
            createdAt: new Date().toISOString(),
        },
    };
    try {
        await dynamodbClient.send(new PutCommand(params));
        console.log('Team member added successfully');
    } catch (error) {
        console.error('Error adding team member:', error);
    }
};

// Find user by ID in DynamoDB
const findUserById = async (id) => {
    const params = {
        TableName: 'TeamMembers',
        Key: { user_id: id },
    };
    try {
        const result = await dynamodbClient.send(new GetCommand(params));
        return result.Item;
    } catch (error) {
        console.error('Error fetching user from DynamoDB:', error);
        return null;
    }
};

// user logout route
app.get('/auth/callback', async (req, res) => {
    try {
        const params = client1.callbackParams(req);
        const tokenSet = await client1.callback('https://9q2kavk7q4.execute-api.eu-west-1.amazonaws.com/dev/auth/callback', params, {
            nonce: req.session.nonce,
            state: req.session.state,
        });

        const userInfo = await client1.userinfo(tokenSet.access_token);
        req.session.userInfo = userInfo;

        const existingUser = await findUserById(userInfo.sub);
        if (!existingUser) await addTeamMember(userInfo);

        res.redirect('/dev/dashboard');
    } catch (error) {
        console.error('Callback error:', error);
        res.redirect('/');
    }
});

// user logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Failed to destroy session:', err);
            return res.status(500).send('Failed to logout.');
        }
    });
    res.redirect('/dev/');
});

// admin first page route
app.get('/admin', (req, res) => {
    res.render('admin/aindex', { title: 'Welcome to the Admin Panel!' });
});

// cognito admin route
app.get('/admin/login', (req, res) => {
    const nonce = generators.nonce();
    const state = generators.state();
    req.session.nonce = nonce;
    req.session.state = state;

    const authUrl = client2.authorizationUrl({
        scope: 'phone openid email',
        state,
        nonce,
    });
    res.redirect(authUrl);
});

// cognito admin callback funtion
app.get('/auth/admin', async (req, res) => {
    if (!client2) {
        console.error('Client2 is not initialized.');
        return res.status(500).send('OpenID client not initialized.');
    }

    try {
        const params = client2.callbackParams(req);
        const tokenSet = await client2.callback('https://9q2kavk7q4.execute-api.eu-west-1.amazonaws.com/dev/auth/admin', params, {
            nonce: req.session.nonce,
            state: req.session.state,
        });

        adminInfo = await client2.userinfo(tokenSet.access_token);
        req.session.adminInfo = adminInfo;
        
        console.log("Admin: ", adminInfo )
        res.redirect('/dev/admin/dashboard');
    } catch (error) {
        console.error('Callback error:', error);
        res.redirect('/');
    }
});

// admin logout route
app.get('/admin/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Failed to destroy session:', err);
            return res.status(500).send('Failed to logout.');
        }
    });

    // Clear the session cookie by setting it to an expired date
    res.clearCookie('connect.sid'); 

    res.redirect('/dev/admin');
});

// Wrap the Express app for Lambda
const server = awsServerlessExpress.createServer(app);

exports.handler = (event, context) => {
    awsServerlessExpress.proxy(server, event, context);
};
