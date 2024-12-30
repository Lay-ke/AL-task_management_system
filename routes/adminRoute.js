const express = require('express');
const {authenticateAdmin} = require('../middleware/auth');
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

// admin dashboard
router.get('/admin/dashboard', async (req, res) => {
  try {
    const tasks = await getAllTasks();
    const teamMembers = await getAllTeamMembers();
    
    res.render('admin/dashboard', { tasks, teamMembers });
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