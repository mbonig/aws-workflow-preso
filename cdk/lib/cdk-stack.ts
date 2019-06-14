import { Stack, Construct, StackProps } from '@aws-cdk/cdk';
import { Bucket } from '@aws-cdk/aws-s3';
import { Function, Code, Runtime, Tracing } from '@aws-cdk/aws-lambda';
import { Table, AttributeType } from '@aws-cdk/aws-dynamodb';
import { LambdaRestApi } from '@aws-cdk/aws-apigateway';
import { PolicyStatement, PolicyStatementEffect } from '@aws-cdk/aws-iam';

export class CdkStack extends Stack {

  processLambda: Function;
  s3Bucket: Bucket;
  greedyApiGateway: LambdaRestApi;
  docsTable: Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.setupS3Bucket();
    this.setupDynamoDB();
    this.setupLambda();
    this.setupAPIGateway();
  }

  setupAPIGateway() {

    this.greedyApiGateway = new LambdaRestApi(this, 'endpoint', {
      handler: this.processLambda
    });
  }
  setupLambda() {
    const dynamoAccess = new PolicyStatement(PolicyStatementEffect.Allow);
    dynamoAccess.addResource(this.docsTable.tableArn);
    dynamoAccess.addAction("dynamodb:*");

    this.processLambda = new Function(this, 'process-doc', {
      code: Code.directory('./handlers/convert'),
      handler: 'AWSLambdas::AWSLambdas.Function::FunctionHandler',
      runtime: Runtime.DotNetCore21,
      environment: {
        S3_BUCKET: this.s3Bucket.bucketName,
        DOCS_TABLE: this.docsTable.tableName
      },
      initialPolicy: [dynamoAccess],
      tracing: Tracing.Active

    });
  }
  setupDynamoDB() {
    this.docsTable = new Table(this, 'converted-docs', {
      partitionKey: { name: 'docId', type: AttributeType.String }
    })
  }
  setupS3Bucket() {

    this.s3Bucket = new Bucket(this, 'docs', {});


  }
}
