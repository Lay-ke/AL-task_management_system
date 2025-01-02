const express = require('express');
const {authenticateAdmin,checkAuth} = require('../middleware/auth');
const router = express.Router();
const AWS = require('aws-sdk');
require('dotenv').config();

// AWS Configuration
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'eu-west-1'
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

// admin dashboard
router.get('/admin/dashboard', checkAuth, async (req, res) => {
  try {
    const tasks = await getAllTasks();
    const teamMembers = await getAllTeamMembers();
    const userInfo = req.session.userInfo;
    
    res.render('admin/dashboard', { 
      userInfo,tasks,
      teamMembers,
      isAuthenticated: req.isAuthenticated,
      userInfo: req.session.userInfo
    });
  } catch (error) {
    res.status(500).send('Error fetching dashboard data');
  }
});

// Create a new task 
router.post('/admin/tasks/create', async (req, res) => {
  const { title, description, assignedTo, deadline } = req.body;
  
  const params = {
    TableName: 'Tasks',
    Item: {
      task_Id: Date.now().toString(),
      title,
      description,
      assignedTo,
      deadline,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };

  
  try {
    const result = await dynamodb.put(params).promise();

    // Retrieve the user's email address using 'assignedTo' (username)
    // Query for the user by username using a secondary index (GSI) for the 'username'
    const userParams = {
      TableName: 'TeamMembers', // Table name
      IndexName: 'username-index', // The GSI name (replace with the actual GSI name)
      KeyConditionExpression: 'username = :username', // Query condition
      ExpressionAttributeValues: {
        ':username': assignedTo // The value of 'assignedTo' is the username to search for
      }
    };

    const user = await dynamodb.query(userParams).promise();
    if (!user.Items || user.Items.length === 0) {
      return res.status(404).send('Assigned user not found or email not available');
    }

    
    // Check if user exists and has an email
    const userProfile = user.Items && user.Items.length > 0 ? user.Items[0] : null;
    const userEmail = userProfile.email;
    const checkSubcribe = userProfile.subcribe_email;
    // console.log("User Email", userEmail);
    const TOPIC_ARN = process.env.TOPIC_ARN;
    

    if (checkSubcribe === "false") {
      // Subscribe the user's email to the SNS topic (only if not already subscribed)
      const subscribeParams = {
      Protocol: 'email', // Set protocol to email
      Endpoint: userEmail, // The user's email address
      TopicArn: TOPIC_ARN // Your SNS Topic ARN
      };

      await sns.subscribe(subscribeParams).promise();

      // Update the user's subscribe_email to true
      const updateParams = {
      TableName: 'TeamMembers',
      Key: { user_id: userProfile.user_id },
      UpdateExpression: 'set subcribe_email = :subcribe_email',
      ExpressionAttributeValues: {
        ':subcribe_email': 'true'
      }
      };

      await dynamodb.update(updateParams).promise();
    };

    // Construct the notification message
    const message = `You have been assigned a new task: ${title}\nDescription: ${description}\nDeadline: ${deadline}`;

    // SNS parameters for publishing the message to the topic
    const snsPublishParams = {
      Message: message, // The message content
      Subject: `New Task Assigned: ${title}`, // Subject of the email
      TopicArn: TOPIC_ARN // Send to the SNS topic
    };

    // Publish the message to the SNS topic
    await sns.publish(snsPublishParams).promise();
    
    res.redirect('/admin/dashboard');
  } catch (error) {
    res.status(500).send('Error creating task');
  }
});

// Update a task
router.put('/admin/tasks/:task_Id', async (req, res) => {
  const { task_Id } = req.params;

  const { title, description, status, deadline } = req.body;
  let assignedTo = 'Joe Doe';

  const params = {
    TableName: 'Tasks',
    Key: { task_Id },
    UpdateExpression: 'set #title = :title, #description = :description, #status = :status, assignedTo = :assignedTo, deadline = :deadline, updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#title': 'title',
      '#description': 'description',
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':title': title,
      ':description': description,
      ':status': status,
      ':assignedTo': assignedTo,
      ':deadline': deadline,
      ':updatedAt': new Date().toISOString()
    }
  };

  try {
    const result = await dynamodb.update(params).promise();
    res.json({ success: true });
  } catch (error) {
    console.log({"Update Error": error})
    res.status(500).json({ error: 'Error updating task' });
  }
});

// delete a task
router.delete('/admin/tasks/:task_Id', async (req, res) => {
    const { task_Id } = req.params;
    
    const params = {
      TableName: 'Tasks',
      Key: { task_Id }
    };
  
    try {
      await dynamodb.delete(params).promise();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Error deleting task' });
    }
});

// Helper functions
async function getAllTasks() {
  const params = {
    TableName: 'Tasks'
  };
  
  const result = await dynamodb.scan(params).promise();
  return result.Items;
}

async function getAllTeamMembers() {
  const params = {
    TableName: 'TeamMembers'
  };
  
  const result = await dynamodb.scan(params).promise();
  return result.Items;
}

module.exports = router;