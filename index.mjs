
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const DB = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const TABLE = process.env.TABLE_NAME ?? "StudentRecords";


const success = (body, statusCode = 200) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const failure = (err, statusCode = 500) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ error: err?.message || String(err) }),
});

function extractStudentId(event, bodyObj) {
  return (
    event?.pathParameters?.student_id ||
    event?.queryStringParameters?.student_id ||
    bodyObj?.student_id
  );
}

function update(item, keyField = "student_id") {
  const updates = { ...item };
  delete updates[keyField];
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

  const keys = Object.keys(updates);
  if (!keys.length) return null;

  let UpdateExpression = "SET ";
  const ExpressionAttributeNames = {};
  const ExpressionAttributeValues = {};

  keys.forEach((k, i) => {
    const nk = `#k${i}`, vk = `:v${i}`;
    if (i) UpdateExpression += ", ";
    UpdateExpression += `${nk} = ${vk}`;
    ExpressionAttributeNames[nk] = k;
    ExpressionAttributeValues[vk] = updates[k];
  });

  return { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues };
}

function switch_action(event) {
  if (event?.action) return event.action.toLowerCase();

  const method = (event?.requestContext?.http?.method || event?.httpMethod || "").toUpperCase();
  switch (method) {
    case "POST": return "CREATE";
    case "GET": return "GET";
    case "PUT": return "UPDATE";
    case "DELETE": return "DELETE";
    default: return null;
  }
}

export const handler = async (event) => {
  try {
    const act = switch_action(event);
    const bodyObj = typeof event?.body === "string" ? JSON.parse(event.body || "{}") : (event?.body || {});
    const student_id = extractStudentId(event, bodyObj);

    switch (act) {

      case "CREATE": {
        if (!student_id) return failure(new Error("Missing student_id in body"), 400);
        const item = { ...bodyObj, student_id };
        await DB.send(new PutCommand({ TableName: TABLE, Item: item }));
        return success({item }, 201);
      }

      case "GET": {
        if (!student_id) return failure(new Error("Missing student_id"), 400);
        const { Item } = await DB.send(new GetCommand({ TableName: TABLE, Key: { student_id } }));
        if (!Item) return failure(new Error("Not found"), 404);
        return success(Item);
      }

      case "UPDATE": {
        if (!student_id) return failure(new Error("Missing student_id"), 400);
        const updateBits = update(bodyObj, ["student_id"]);

        const out = await DB.send(new UpdateCommand({
          TableName: TABLE,
          Key: { student_id },
          ...updateBits,
          ConditionExpression: "attribute_exists(student_id)",
          ReturnValues: "ALL_NEW",
        }));
        return success({ message: "The item is updated", item: out.Attributes });
      }

      case "DELETE": {
        if (!student_id) return failure(new Error("Missing student_id"), 400);
        await DB.send(new DeleteCommand({
          TableName: TABLE,
          Key: { student_id }
        }));
        return success({ message: "Deleted", student_id });
      }

      

      default:
        return success();
    }
  } catch (err) {
  
    return failure(err);
  }
};
