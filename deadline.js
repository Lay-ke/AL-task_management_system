const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);
const snsClient = new SNSClient({});

const TABLE_NAME = 'Tasks';
const TEAM_MEMBERS_TABLE = 'TeamMembers';
const TOPIC_ARN = process.env.TOPIC_ARN; // Ensure the TOPIC_ARN is set as an environment variable in Lambda

module.exports.handler = async (event) => {
  try {
    // Get the current date and the date 5 days from now
    const currentDate = new Date();
    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(currentDate.getDate() + 5);

    // Scan for tasks with a deadline within the next 5 days and status 'PENDING' or 'IN_PROGRESS'
    const taskParams = {
      TableName: TABLE_NAME,
      FilterExpression: '#status IN (:pending, :inProgress) AND deadline BETWEEN :startDate AND :endDate',
      ExpressionAttributeValues: {
        ':startDate': currentDate.toISOString().split('T')[0], // Only use the date part (YYYY-MM-DD)
        ':endDate': fiveDaysFromNow.toISOString().split('T')[0], // Only use the date part (YYYY-MM-DD)
        ':pending': 'PENDING',
        ':inProgress': 'IN_PROGRESS',
      },
      ExpressionAttributeNames: {
        '#status': 'status', // Using #status as the placeholder for the reserved keyword 'status'
      },
    };

    // Fetch the tasks from DynamoDB using the ScanCommand
    const { Items: tasks } = await dynamo.send(new ScanCommand(taskParams));

    if (!tasks || tasks.length === 0) {
      console.log('No tasks approaching deadline within five days.');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No notifications sent.' }),
      };
    }

    // Process each task and notify assigned users
    for (const task of tasks) {
      const { assignedTo, title, description, deadline } = task;

      // Query the TeamMembers table for user details
      const userParams = {
        TableName: TEAM_MEMBERS_TABLE,
        IndexName: 'username-index', // Ensure you have a GSI on 'username'
        KeyConditionExpression: 'username = :username',
        ExpressionAttributeValues: {
          ':username': assignedTo,
        },
      };

      const { Items: user } = await dynamo.send(new QueryCommand(userParams));

      if (!user || user.length === 0) {
        console.log(`No user found for username: ${assignedTo}`);
        continue;
      }

      const userProfile = user[0];
      const userEmail = userProfile.email;

      if (!userEmail) {
        console.log(`No email found for user: ${assignedTo}`);
        continue;
      }

      // Construct the notification message
      const message = `Reminder: You have an upcoming task deadline in five days!\n\nTitle: ${title}\nDescription: ${description}\nDeadline: ${deadline}`;

      // SNS Parameters
      const snsParams = {
        Message: message,
        Subject: `Task Deadline Reminder: ${title}`,
        TopicArn: TOPIC_ARN,
      };

      // Send the notification via SNS using the PublishCommand
      await snsClient.send(new PublishCommand(snsParams));
      console.log(`Notification sent to ${userEmail} for task: ${title}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Notifications sent successfully.' }),
    };
  } catch (error) {
    console.error('Error sending notifications:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error sending notifications.', error: error.message }),
    };
  }
};
