import {Construct, Stack, StackProps} from '@aws-cdk/cdk';
import {Bucket, EventType} from '@aws-cdk/aws-s3';
import {Code, Function, Runtime} from '@aws-cdk/aws-lambda';
import {AttributeType, Table} from '@aws-cdk/aws-dynamodb';
import {
    AwsIntegration, LambdaIntegration,
    LambdaRestApi,
    PassthroughBehavior,
    RestApi
} from '@aws-cdk/aws-apigateway';
import {PolicyDocument, PolicyStatement, Role, ServicePrincipal} from '@aws-cdk/aws-iam';
import {S3EventSource} from '@aws-cdk/aws-lambda-event-sources';

export class CdkStack extends Stack {

    processLambda: Function;
    docsBucket: Bucket;
    greedyApiGateway: LambdaRestApi;
    docsTable: Table;
    catalogLambda: Function;
    catalogReadGateway: RestApi;
    private apigatewayRole: Role;
    private getDocLambda: Function;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        this.setupS3Bucket();
        this.setupDynamoDB();
        this.setupLambda();
        this.setupAPIGateway();
    }

    setupAPIGateway() {

        this.greedyApiGateway = new LambdaRestApi(this, 'doc-api', {
            handler: this.processLambda
        });

        this.catalogReadGateway = new RestApi(this, 'catalog-api', {

        });
        this.catalogReadGateway.root.addResource('{proxy+}', {

        }).addMethod('GET', new LambdaIntegration(this.getDocLambda, {
            proxy: true
        }));
        this.apigatewayRole = new Role(this, 'apigateway-dynamodb', {
            assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
            inlinePolicies: {
                'read-dynamo': new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            actions: ['dynamodb:*'],
                            resources: [this.docsTable.tableArn]
                        })]
                })
            }
        });
        this.catalogReadGateway.root.addMethod("GET", new AwsIntegration({
            service: 'dynamodb',
            action: 'Scan',
            integrationHttpMethod: 'POST',
            options: {
                credentialsRole: this.apigatewayRole,
                passthroughBehavior: PassthroughBehavior.WhenNoTemplates,

                integrationResponses: [{
                    statusCode: '200',
                    responseTemplates: {
                        'application/json': `#set($inputRoot = $input.path('$'))
                            [
                                #foreach($elem in $inputRoot.Items) {
                                        "eTag": "$elem.eTag.S",
                                        "key": "$elem.key.S",
                                        "size": "$elem.size.N"
                                    }#if($foreach.hasNext),#end
                            \t#end
                            ]`
                    }
                }],

                requestTemplates: {
                    'application/json': `{
                            "TableName": "${this.docsTable.tableName}"
                    }`
                },

            }
        }), {
            methodResponses: [{
                statusCode: '200'
            }]
        });
    }

    setupLambda() {

        let s3writePolicy = new PolicyStatement({
            actions: ['S3:PutObject'],
            resources: [`${this.docsBucket.bucketArn}/*`]
        });
        let s3ReadPolicy = new PolicyStatement({
            actions: ['S3:GetObject'],
            resources: [`${this.docsBucket.bucketArn}/*`]
        });
        this.processLambda = new Function(this, 'process-doc', {
            code: Code.asset('./handlers/convert'),
            handler: 'lambda_function.lambda_handler',
            runtime: Runtime.Python37,
            timeout: 15,
            environment: {
                S3_BUCKET: this.docsBucket.bucketName
            },
            initialPolicy: [s3writePolicy]
        });

        const dynamoAccess = new PolicyStatement({
            actions: ["dynamodb:*"],
            resources: [this.docsTable.tableArn],
        });
        this.catalogLambda = new Function(this, 'catalog-doc', {
            code: Code.asset('./handlers/catalog'),
            handler: 'index.processRecords',
            runtime: Runtime.Nodejs810,
            environment: {
                DOCS_TABLE: this.docsTable.tableName
            },
            initialPolicy: [dynamoAccess],
        });

        this.getDocLambda = new Function(this, 'get-doc', {
            code: Code.asset('./handlers/catalog'),
            handler: 'index.get',
            runtime: Runtime.Nodejs810,
            environment: {
                DOCS_TABLE: this.docsTable.tableName,
                S3_BUCKET: this.docsBucket.bucketName
            },
            initialPolicy: [dynamoAccess, s3ReadPolicy],
        });

        this.catalogLambda.addEventSource(new S3EventSource(this.docsBucket, {
            events: [EventType.ObjectCreatedPut]
        }));

    }

    setupDynamoDB() {
        this.docsTable = new Table(this, 'docs-catalog', {
            partitionKey: {name: 'docId', type: AttributeType.String}
        })
    }

    setupS3Bucket() {
        this.docsBucket = new Bucket(this, 'docs', {});
    }
}
