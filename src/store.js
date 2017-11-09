import AWS from 'aws-sdk';
import { EventEmitter } from 'events';

const ONE_DAY = 86400 * 1000;

export default class DynamoDBStore extends EventEmitter {
  constructor(options = {}) {
    super();

    let { connection } = options;
    const {
      key = 'Id',
      tableName = 'Session',
      credentials,
      region = 'usa',
      ttlKey = 'Ttl',
    } = options;

    if (!connection) {
      connection = new AWS.DynamoDB({ credentials, region });
    }

    const client = connection.DocumentClient();
    Object.assign(this, {
      key,
      tableName,
      client,
      connection,
      ttlKey,
    });
    this.createTable();
  }

  async doesTableExist() {
    try {
      return await this.connection.listTables({ limit: 0 }).promise()
        .then(result => result.data.TableNames.indexOf(this.TableName) !== -1);
    } catch (err) {
      throw err;
    }
  }

  async createTable() {
    if (await this.doesTableExist()) {
      return true;
    }

    const {
      tableName: TableName,
      key: AttributeName,
      readCapacityUnits,
      writeCapacityUnits,
    } = this;

    const params = {
      TableName,
      KeySchema: [
        { AttributeName, KeyType: 'HASH' },
      ],
      AttributeDefinitions: [
        { AttributeName, AttributeType: 'S' },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: readCapacityUnits,
        WriteCapacityUnits: writeCapacityUnits,
      },
    };

    try {
      await this.connection.createTable(params).promise();
      await this.setTtlField().promise();
      return true;
    } catch (err) {
      throw new Error('Error creating session table');
    }
  }

  async setTtlField() {
    const { tableName: TableName, ttlKey: AttributeName } = this;
    const params = {
      TableName,
      TimeToLiveSpecification: {
        AttributeName,
        Enabled: true,
      },
    };
    try {
      await this.connection.updateTimeToLive(params).promise();
    } catch (err) {
      throw new Error('Error setting TTL');
    }
  }

  getParamsForId(id) {
    const { TableName, key } = this;
    return {
      Key: {
        [key]: id,
      },
      TableName,
    };
  }

  async get(id) {
    const params = this.getParamsForId(id);
    try {
      return await this.client.get(params).promise();
    } catch (err) {
      throw new Error('Unable to get session.');
    }
  }

  async set(id, session, ttl) {
    const { TableName, key, ttlKey } = this;
    const maxAge = (session.cookie && session.cookie.maxAge) ? session.cookie.maxAge : null;

    const Items = session;
    Items[key] = id;
    Items[ttlKey] = new Date((ttl || maxAge || ONE_DAY) + Date.now());
    const params = { TableName, Items };
    try {
      return await this.client.put(params).promise();
    } catch (err) {
      throw new Error('Unable to set session.');
    }
  }

  async destroy(id) {
    const params = this.getParamsForId(id);
    try {
      return await this.client.delete(params).promise();
    } catch (err) {
      throw new Error('Unable to delete session.');
    }
  }
}
