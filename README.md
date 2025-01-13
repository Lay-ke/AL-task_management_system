# Guide for Task Management System

## Prerequisites

* AWS Account (free tier is sufficient)
* AWS CLI installed and configured
* Git installed
* Node.js (v14 or higher) and npm installed

## 1. Initial Setup

Clone the Repository and Install Dependencies:

```bash
git clone [repository-url]
cd task-management-system
npm install
```

Configure AWS CLI:

```bash
# Verify AWS CLI installation
aws --version

# Configure AWS CLI
aws configure
# Enter when prompted:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region (use: eu-west-1)
# - Default output format (use: json)
```

## 2. AWS Services Setup

### Step 1: DynamoDB Setup

Create Tasks Table:

```bash
aws dynamodb create-table \
    --table-name Tasks \
    --attribute-definitions \
        AttributeName=task_Id,AttributeType=S \
        AttributeName=assignedTo,AttributeType=S \
    --key-schema \
        AttributeName=task_Id,KeyType=HASH \
    --global-secondary-indexes \
        "[{
            \"IndexName\": \"assignedTo-index\",
            \"KeySchema\": [{\"AttributeName\":\"assignedTo\",\"KeyType\":\"HASH\"}],
            \"Projection\": {\"ProjectionType\":\"ALL\"},
            \"ProvisionedThroughput\": {\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}
        }]" \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5
```

Create TeamMembers Table:

```bash
aws dynamodb create-table \
    --table-name TeamMembers \
    --attribute-definitions \
        AttributeName=user_id,AttributeType=S \
        AttributeName=username,AttributeType=S \
    --key-schema \
        AttributeName=user_id,KeyType=HASH \
    --global-secondary-indexes \
        "[{
            \"IndexName\": \"username-index\",
            \"KeySchema\": [{\"AttributeName\":\"username\",\"KeyType\":\"HASH\"}],
            \"Projection\": {\"ProjectionType\":\"ALL\"},
            \"ProvisionedThroughput\": {\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}
        }]" \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5
```

### Step 2: SNS Topic Setup

Create SNS Topic:

```bash
aws sns create-topic --name task-notifications

# Save the Topic ARN
export TOPIC_ARN="arn:aws:sns:eu-west-1:YOUR_ACCOUNT_ID:task-notifications"
```

### Step 3: Cognito User Pools Setup

Create User Pool for Regular Users:

```bash
# Create user pool
aws cognito-idp create-user-pool \
    --pool-name task-management-users \
    --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":true}}' \
    --auto-verified-attributes email

# Save the User Pool ID
export USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 10 | jq -r '.UserPools[] | select(.Name=="task-management-users") | .Id')

# Create app client
aws cognito-idp create-user-pool-client \
    --user-pool-id $USER_POOL_ID \
    --client-name task-management-client \
    --generate-secret \
    --explicit-auth-flows ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH \
    --callback-urls '["https://YOUR_API_GATEWAY_URL/dev/auth/callback"]' \
    --logout-urls '["https://YOUR_API_GATEWAY_URL/dev/"]'

# Save the Client ID and Secret
export CLIENT_ID=$(aws cognito-idp list-user-pool-clients --user-pool-id $USER_POOL_ID | jq -r '.UserPoolClients[0].ClientId')
export CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client --user-pool-id $USER_POOL_ID --client-id $CLIENT_ID | jq -r '.UserPoolClient.ClientSecret')
```

Create Admin User Pool:

```bash
# Create admin pool
aws cognito-idp create-user-pool \
    --pool-name task-management-admins \
    --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":true}}' \
    --auto-verified-attributes email

# Save the Admin Pool ID
export ADMIN_POOL_ID=$(aws cognito-idp list-user-pools --max-results 10 | jq -r '.UserPools[] | select(.Name=="task-management-admins") | .Id')

# Create admin app client
aws cognito-idp create-user-pool-client \
    --user-pool-id $ADMIN_POOL_ID \
    --client-name task-management-admin-client \
    --generate-secret \
    --explicit-auth-flows ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH \
    --callback-urls '["https://YOUR_API_GATEWAY_URL/dev/auth/admin"]' \
    --logout-urls '["https://YOUR_API_GATEWAY_URL/dev/admin"]'

# Save the Admin Client ID and Secret
export ADMIN_CLIENT_ID=$(aws cognito-idp list-user-pool-clients --user-pool-id $ADMIN_POOL_ID | jq -r '.UserPoolClients[0].ClientId')
export ADMIN_CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client --user-pool-id $ADMIN_POOL_ID --client-id $ADMIN_CLIENT_ID | jq -r '.UserPoolClient.ClientSecret')
```

### Step 4: Lambda Function Setup

Create IAM Role for Lambda:

```bash
# Create role policy document
cat > lambda-role-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF

# Create role
aws iam create-role \
    --role-name task-management-lambda-role \
    --assume-role-policy-document file://lambda-role-policy.json

# Attach necessary policies
aws iam attach-role-policy \
    --role-name task-management-lambda-role \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam attach-role-policy \
    --role-name task-management-lambda-role \
    --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess

aws iam attach-role-policy \
    --role-name task-management-lambda-role \
    --policy-arn arn:aws:iam::aws:policy/AmazonSNSFullAccess
```

Create Lambda Function:

```bash
# Create deployment package
zip -r function.zip .

# Create Lambda function
aws lambda create-function \
    --function-name task-management-system \
    --runtime nodejs14.x \
    --role arn:aws:iam::YOUR_ACCOUNT_ID:role/task-management-lambda-role \
    --handler server.handler \
    --zip-file fileb://function.zip \
    --timeout 30 \
    --memory-size 256 \
    --environment Variables="{
        COGNITO_ISSUER=https://cognito-idp.eu-west-1.amazonaws.com/$USER_POOL_ID,
        COGNITO_ISSUER2=https://cognito-idp.eu-west-1.amazonaws.com/$ADMIN_POOL_ID,
        client_id=$CLIENT_ID,
        client_id2=$ADMIN_CLIENT_ID,
        client_secret=$CLIENT_SECRET,
        client_secret2=$ADMIN_CLIENT_SECRET,
        TOPIC_ARN=$TOPIC_ARN
    }"
```

### Step 5: API Gateway Setup

Create HTTP API:

```bash
# Create API
aws apigatewayv2 create-api \
    --name task-management-api \
    --protocol-type HTTP \
    --target arn:aws:lambda:eu-west-1:YOUR_ACCOUNT_ID:function:task-management-system

# Save the API ID
export API_ID=$(aws apigatewayv2 get-apis | jq -r '.Items[] | select(.Name=="task-management-api") | .ApiId')

# Create routes for all endpoints
aws apigatewayv2 create-route \
    --api-id $API_ID \
    --route-key "ANY /{proxy+}" \
    --target "integrations/lambda-integration"
```

### Step 6: EventBridge Setup for Deadline Checker

```bash
# Create rule
aws events put-rule \
    --name task-deadline-checker \
    --schedule-expression "rate(1 day)"

# Add Lambda permission
aws lambda add-permission \
    --function-name task-management-system \
    --statement-id EventBridgeInvoke \
    --action lambda:InvokeFunction \
    --principal events.amazonaws.com \
    --source-arn arn:aws:events:eu-west-1:YOUR_ACCOUNT_ID:rule/task-deadline-checker

# Add target
aws events put-targets \
    --rule task-deadline-checker \
    --targets "Id"="1","Arn"="arn:aws:lambda:eu-west-1:YOUR_ACCOUNT_ID:function:task-management-system"
```

## 3. Environment Setup

Create a `.env` file in your project root:

```
COGNITO_ISSUER=https://cognito-idp.eu-west-1.amazonaws.com/${USER_POOL_ID}
COGNITO_ISSUER2=https://cognito-idp.eu-west-1.amazonaws.com/${ADMIN_POOL_ID}
client_id=${CLIENT_ID}
client_id2=${ADMIN_CLIENT_ID}
client_secret=${CLIENT_SECRET}
client_secret2=${ADMIN_CLIENT_SECRET}
TOPIC_ARN=${TOPIC_ARN}
```

## 4. Testing the Setup

Verify DynamoDB Tables:

```bash
aws dynamodb describe-table --table-name Tasks
aws dynamodb describe-table --table-name TeamMembers
```

Verify SNS Topic:

```bash
aws sns list-topics
```

Test Lambda Function:

```bash
aws lambda invoke \
    --function-name task-management-system \
    --payload '{"body": "test"}' \
    response.json
```

## 5. Common Issues and Solutions

### DynamoDB Table Not Found:

* Check if table names are correct
* Verify AWS region matches configuration
* Check IAM permissions

### Cognito Authentication Issues:

* Verify callback URLs match your API Gateway URL
* Double-check client IDs and secrets
* Ensure user pool settings are correct

### Lambda Function Errors:

Check CloudWatch logs:

```bash
aws logs filter-log-events \
    --log-group-name /aws/lambda/task-management-system \
    --start-time $(date -d '1 hour ago' +%s000)
```

### SNS Topic Issues:

* Verify topic ARN is correct
* Check IAM permissions
* Confirm email endpoints are verified

## Note

Remember to replace the following placeholders with your actual values:
* `YOUR_ACCOUNT_ID`
* `YOUR_API_GATEWAY_URL`
* Any region references if you're not using `eu-west-1`