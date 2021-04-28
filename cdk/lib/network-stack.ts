import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    this.vpc = new ec2.Vpc(this, 'Vpc');

  }
}
