const express = require('express');
const { authenticateAdmin, checkAuth } = require('../middleware/auth');
const router = express.Router();
const { DynamoDBClient, ScanCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { SNSClient, SubscribeCommand, PublishCommand } = require('@aws-sdk/client-sns');

// Initialize AWS Clients
const dynamodb = new DynamoDBClient({ region: 'eu-west-1' });
const sns = new SNSClient({ region: 'eu-west-1' });

// Helper functions
async function getAllItems(tableName) {
    const params = { TableName: tableName };
    const command = new ScanCommand(params);
    try {
        const result = await dynamodb.send(command);
        return result.Items;
    } catch (error) {
        console.error(`Error scanning table ${tableName}:`, error);
        throw new Error(`Unable to retrieve items from ${tableName}`);
    }
}

async function queryItemsByIndex(tableName, indexName, keyConditionExpression, expressionAttributeValues) {
    const params = {
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
    };
    const command = new QueryCommand(params);
    try {
        const result = await dynamodb.send(command);
        return result.Items;
    } catch (error) {
        console.error(`Error querying ${tableName} by index ${indexName}:`, error);
        throw new Error(`Unable to query items in ${tableName}`);
    }
}

// Admin dashboard
router.get('/admin/dashboard', authenticateAdmin, async (req, res) => {
    try {
        const tasks = await getAllItems('Tasks');
        const teamMembers = await getAllItems('TeamMembers');
        const adminInfo = req.session.adminInfo;

        res.render('admin/dashboard', {
            adminInfo,
            tasks,
            teamMembers,
            isAuthenticated: req.isAuthenticated,
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).send('Error fetching dashboard data');
    }
});

// Create a new task
router.post('/admin/tasks/create', async (req, res) => {
    const { title, description, assignedTo, deadline } = req.body;

    const taskParams = {
        TableName: 'Tasks',
        Item: {
            task_Id: Date.now().toString(),
            title,
            description,
            assignedTo,
            deadline,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
    };

    try {
        await dynamodb.send(new PutCommand(taskParams));

        // Fetch user information
        const user = await queryItemsByIndex(
            'TeamMembers',
            'username-index',
            'username = :username',
            { ':username': assignedTo }
        );

        if (!user || user.length === 0) {
            return res.status(404).send('Assigned user not found or email not available');
        }

        const userProfile = user[0];
        const { email: userEmail, subcribe_email: isSubscribed, user_id } = userProfile;

        if (!isSubscribed) {
            console.log('Subscribing user to SNS topic');

            const subscribeCommand = new SubscribeCommand({
                Protocol: 'email',
                Endpoint: userEmail,
                TopicArn: process.env.TOPIC_ARN,
            });

            await sns.send(subscribeCommand);

            const updateParams = {
                TableName: 'TeamMembers',
                Key: { user_id },
                UpdateExpression: 'set subcribe_email = :subscribed',
                ExpressionAttributeValues: {
                    ':subscribed': true,
                },
            };

            await dynamodb.send(new UpdateCommand(updateParams));
        }

        // Notify user via SNS
        const notificationMessage = `You have been assigned a new task: ${title}\nDescription: ${description}\nDeadline: ${deadline}`;
        const publishCommand = new PublishCommand({
            Message: notificationMessage,
            Subject: `New Task Assigned: ${title}`,
            TopicArn: process.env.TOPIC_ARN,
        });

        await sns.send(publishCommand);

        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).send('Error creating task');
    }
});

// Update a task
router.put('/admin/tasks/:task_Id', async (req, res) => {
    const { task_Id } = req.params;
    const { title, description, status, assignedTo, deadline } = req.body;

    const params = {
        TableName: 'Tasks',
        Key: { task_Id },
        UpdateExpression:
            'set #title = :title, #description = :description, #status = :status, assignedTo = :assignedTo, deadline = :deadline, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#title': 'title',
            '#description': 'description',
            '#status': 'status',
        },
        ExpressionAttributeValues: {
            ':title': title,
            ':description': description,
            ':status': status,
            ':assignedTo': assignedTo,
            ':deadline': deadline,
            ':updatedAt': new Date().toISOString(),
        },
    };

    try {
        await dynamodb.send(new UpdateCommand(params));
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Error updating task' });
    }
});

// Delete a task
router.delete('/admin/tasks/:task_Id', async (req, res) => {
    const { task_Id } = req.params;

    const params = {
        TableName: 'Tasks',
        Key: { task_Id },
    };

    try {
        await dynamodb.send(new DeleteCommand(params));
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Error deleting task' });
    }
});

module.exports = router;
