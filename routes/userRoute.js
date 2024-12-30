const express = require('express');
const AWS = require('aws-sdk');
const router = express.Router();

const dynamodb = new AWS.DynamoDB.DocumentClient();


router.get('/dashboard', async (req, res) => {
  // console.log({"userInfo":req});
  // const params = {
  //   TableName: 'Tasks',
  //   IndexName: 'AssignedToIndex',
  //   KeyConditionExpression: 'assignedTo = :username',
  //   ExpressionAttributeValues: {
  //     ':username': req.session.userInfo.username
  //   }
  // };
  const tasks = [
    { task_Id: 'task001', assignedTo: 'user001', title: 'Create API for User Management', status: 'In Progress', deadline: '2024-12-30' },
    { task_Id: 'task002', assignedTo: 'user001', title: 'Design Homepage Layout', status: 'Completed', deadline: '2024-12-25' },
    { task_Id: 'task003', assignedTo: 'user001', title: 'Write Unit Tests for API', status: 'Pending', deadline: '2025-01-15' },
    { task_Id: 'task004', assignedTo: 'user001', title: 'Setup Database Schema', status: 'In Progress', deadline: '2025-01-10' },
    { task_Id: 'task005', assignedTo: 'user001', title: 'Review Code for Merge Request', status: 'Pending', deadline: '2025-01-05' }
];

  try {
    // const result = await dynamodb.query(params).promise();
    res.render('user/dashboard', { tasks: tasks });
  } catch (error) {
    res.status(500).send('Error fetching tasks');
  }
});

router.put('/tasks/:task_Id/status', async (req, res) => {
  const { task_Id } = req.params;
  const { status } = req.body;
  
  const params = {
    TableName: 'Tasks',
    Key: { task_Id },
    UpdateExpression: 'set #status = :status, updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': status,
      ':updatedAt': new Date().toISOString()
    }
  };

  try {
    await dynamodb.update(params).promise();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error updating task status' });
  }
});

module.exports = router;