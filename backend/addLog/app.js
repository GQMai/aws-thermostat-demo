// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

// default imports
const AWSXRay = require("aws-xray-sdk-core");
const AWS = AWSXRay.captureAWS(require("aws-sdk"));
const { metricScope, Unit } = require("aws-embedded-metrics");
const DDB = new AWS.DynamoDB({ apiVersion: "2012-10-08" });
const { v1: uuidv1 } = require("uuid");

// environment variables
const { TABLE_NAME, ENDPOINT_OVERRIDE, REGION } = process.env;
const options = { region: REGION };
console.log('REGION='+REGION);
AWS.config.update({ region: REGION });

if (ENDPOINT_OVERRIDE !== "") {
  options.endpoint = ENDPOINT_OVERRIDE;
}

const docClient = new AWS.DynamoDB.DocumentClient(options);
// response helper
const response = (statusCode, body, additionalHeaders) => ({
  statusCode,
  body: JSON.stringify(body),
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    ...additionalHeaders,
  },
});

function isValidRequest(event) {
  return event.body !== null;
}

function getCognitoUsername(event) {
  let authHeader = event.requestContext.authorizer;
  if (authHeader !== null) {
    return authHeader.claims["cognito:username"];
  }
  return null;
}

function addRecord(event) {
  let usernameField = {
    "cognito_username": getCognitoUsername(event),
  };

  // auto generated date fields
  let dISO = new Date().toISOString();
  let auto_fields = {
    id: uuidv1(),
    creation_date: dISO,
    lastupdate_date: dISO,
  };

  //merge the json objects
  let item_body = {
    ...usernameField,
    ...auto_fields,
    ...JSON.parse(event.body),
  };

  console.log("TABLE_NAME: "+TABLE_NAME+"\r\n");
  console.log("Test body: "+JSON.stringify(item_body)+"\r\n");

  //final params to DynamoDB
  const params = {
    TableName: TABLE_NAME,
    Item: item_body,
  };

  return docClient.put(params);
}

// Lambda Handler
exports.addLogItem = metricScope((metrics) => async (event, context) => {
  console.log("addLogItem");
  console.log(JSON.stringify(event));
  console.log(JSON.stringify(context));

  metrics.setNamespace("ThermostatApp");
  metrics.putDimensions({ Service: "addLog" });
  metrics.setProperty("RequestId", context.requestId);

  if (!isValidRequest(event)) {
    metrics.putMetric("Error", 1, Unit.Count);
    return response(400, { message: "Error: Invalid request" });
  }

  try {
    let data = await addRecord(event).promise();
    metrics.putMetric("Success", 1, Unit.Count);
    // let data = {"msg": "success"};

    console.log("data="+JSON.stringify(data));
    return response(200, data);
  } catch (err) {
    metrics.putMetric("Error", 1, Unit.Count);
    console.warn("err: "+JSON.stringify(err));
    return response(400, { message: err.message });
  }
});
