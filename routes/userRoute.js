const express = require('express');
const { DynamoDBClient, QueryCommand, UpdateCommand } = require('@aws-sdk/client-dynamodb');
const { checkAuth } = require('../middleware/auth');
const router = express.Router();

// Initialize DynamoDB Client
const dynamodb = new DynamoDBClient({ region: 'eu-west-1' });

// Helper Functions
async function queryDynamoDB(params) {
    try {
        const command = new QueryCommand(params);
        const result = await dynamodb.send(command);
        return result.Items || [];
    } catch (error) {
        console.error('DynamoDB Query Error:', error);
        throw new Error('Error querying DynamoDB');
    }
}

async function updateDynamoDB(params) {
    try {
        const command = new UpdateCommand(params);
        await dynamodb.send(command);
    } catch (error) {
        console.error('DynamoDB Update Error:', error);
        throw new Error('Error updating DynamoDB item');
    }
}

// Routes

// Home Page
router.get('/', checkAuth, (req, res) => {
    res.render('index', {
        title: 'Serverless with Express and EJS',
        isAuthenticated: req.isAuthenticated,
        userInfo: req.session.userInfo,
    });
});

// User Dashboard
router.get('/dashboard', async (req, res) => {
    const username = req.session.userInfo?.username;

    if (!username) {
        return res.status(400).send('User information is missing.');
    }

    const params = {
        TableName: 'Tasks',
        IndexName: 'assignedTo-index',
        KeyConditionExpression: 'assignedTo = :username',
        ExpressionAttributeValues: {
            ':username': username,
        },
    };

    try {
        const tasks = await queryDynamoDB(params);
        res.render('user/dashboard', { tasks });
    } catch (error) {
        console.error('Error fetching tasks for dashboard:', error);
        res.status(500).send('Error fetching tasks');
    }
});

// Update Task Status
router.put('/tasks/:task_Id/status', async (req, res) => {
    const { task_Id } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Task status is required' });
    }

    const params = {
        TableName: 'Tasks',
        Key: { task_Id },
        UpdateExpression: 'set #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#status': 'status',
        },
        ExpressionAttributeValues: {
            ':status': status,
            ':updatedAt': new Date().toISOString(),
        },
    };

    try {
        await updateDynamoDB(params);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating task status:', error);
        res.status(500).json({ error: 'Error updating task status' });
    }
});

module.exports = router;
