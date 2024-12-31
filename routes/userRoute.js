const express = require('express');
const AWS = require('aws-sdk');
const router = express.Router();

const dynamodb = new AWS.DynamoDB.DocumentClient();


router.get('/dashboard', async (req, res) => {
  console.log('User info in dash:', req.session.userInfo);
  const params = {
    TableName: 'Tasks',
    IndexName: 'assignedTo-index',
    KeyConditionExpression: 'assignedTo = :username',
    ExpressionAttributeValues: {
      ':username': req.session.userInfo.username
    }
  };
  

  try {
    const result = await dynamodb.query(params).promise();
    console.log('Tasks:', result);
    res.render('user/dashboard', { tasks: result.Items });
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