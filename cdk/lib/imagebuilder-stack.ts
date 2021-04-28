import { Peer, Port, Protocol, SecurityGroup, Vpc } from '@aws-cdk/aws-ec2';
import { CfnInstanceProfile, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { CfnComponent, CfnImagePipeline, CfnImageRecipe, CfnInfrastructureConfiguration } from '@aws-cdk/aws-imagebuilder';
import { BlockPublicAccess, Bucket, BucketEncryption } from '@aws-cdk/aws-s3';
import { Construct, RemovalPolicy, Stack, StackProps } from '@aws-cdk/core';
import { readFileSync } from 'fs';
import * as YAML from 'js-yaml';

interface Props extends StackProps {
    vpc: Vpc,
}

export class ImageBuilderStack extends Stack {

    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        let role = new Role(this, 'UEPSWindowsImageBuilderRole', {
            assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                { 'managedPolicyArn': 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore' },
                { 'managedPolicyArn': 'arn:aws:iam::aws:policy/EC2InstanceProfileForImageBuilder' },
            ]
        });

        const subnet = props.vpc.publicSubnets[0];
        const sg = new SecurityGroup(this, 'ImageBuilder-sg', {
            vpc: props.vpc
        })
        sg.addIngressRule(Peer.anyIpv4(), new Port({
            // TODO: lock this down
            protocol: Protocol.ALL,
            stringRepresentation: 'Everything'
        }));

        // S3 configuration
        const s3BucketName = this.node.tryGetContext("bucket_name");
        var bucket
        if (typeof(s3BucketName) !== 'undefined') {
            bucket = Bucket.fromBucketName(this, "UnrealZipBucket", s3BucketName);
        }
        else {
            bucket = new Bucket(this, "UnrealZipBucket", {
                encryption: BucketEncryption.KMS,
                bucketKeyEnabled: true,
                versioned: true,
                enforceSSL: true,
                removalPolicy: RemovalPolicy.DESTROY,
                blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            })
        }

        // image builder components

        const component_version = "0.0.5"
        const image_version = "1.0.5"

        const component_firewall_data = YAML.load(readFileSync('resources/install_firewall_rules.yml', 'utf8'));
        const component_firewall = new CfnComponent(this, "InstallFirewallRules", {
            name: "FirewallRulesCoomponent",
            platform: "Windows",
            version: component_version,
            data: YAML.dump(component_firewall_data)
        });

        const component_nodejs_data = YAML.load(readFileSync('resources/install_nodejs.yml', 'utf8'));
        const component_nodejs = new CfnComponent(this, "InstallNodeJS", {
            name: "NodeJSComponent",
            platform: "Windows",
            version: component_version,
            data: YAML.dump(component_nodejs_data)
        });

        const component_nvidia_data = YAML.load(readFileSync('resources/install_nvidia.yml', 'utf8'));
        const component_nvidia = new CfnComponent(this, "InstallNvidia", {
            name: "NvidiaComponent",
            platform: "Windows",
            version: component_version,
            data: YAML.dump(component_nvidia_data)
        });

        const component_nice_dcv_data = YAML.load(readFileSync('resources/install_nice_dcv.yml', 'utf8'));
        const component_nice_dcv = new CfnComponent(this, "InstallNiceDCV", {
            name: "NiceDCVComponent",
            platform: "Windows",
            version: component_version,
            data: YAML.dump(component_nice_dcv_data)
        });


        // image builder pipeline

        const instanceprofile = new CfnInstanceProfile(this, "UEPSWindowsImageInstanceProfile", {
            instanceProfileName: 'UEPSWindowsImageInstanceProfile',
            roles: [role.roleName]
        });

        const rcp = new CfnImageRecipe(this, 'UEPSWindowsImageRecipe', {
            name: 'UEPSWindowsImageRecipe',
            version: image_version,
            components: [
                { "componentArn": 'arn:aws:imagebuilder:us-east-1:aws:component/dotnet-core-sdk-windows/3.1.0' },
                { "componentArn": 'arn:aws:imagebuilder:us-east-1:aws:component/amazon-cloudwatch-agent-windows/1.0.0' },
                { "componentArn": 'arn:aws:imagebuilder:us-east-1:aws:component/aws-cli-version-2-windows/1.0.0' },
                { "componentArn": 'arn:aws:imagebuilder:us-east-1:aws:component/chocolatey/1.0.0' },
                { "componentArn": component_firewall.attrArn },
                { "componentArn": component_nodejs.attrArn },
                { "componentArn": component_nvidia.attrArn },
                { "componentArn": component_nice_dcv.attrArn }
            ],
            // Core image should be used for deploying, base is helpful for development debugging
            // parentImage: 'arn:aws:imagebuilder:us-east-1:aws:image/windows-server-2019-english-core-base-x86/x.x.x'
            parentImage: 'arn:aws:imagebuilder:us-east-1:aws:image/windows-server-2019-english-full-base-x86/x.x.x'
        });

        const infraconfig = new CfnInfrastructureConfiguration(this, "UEPSWindowsImageInfrastructureConfig", {
            name: "UEPSWindowsImageInfrastructureConfig",
            instanceTypes: ["t3.xlarge"],
            instanceProfileName: "UEPSWindowsImageInstanceProfile",
            subnetId: subnet.subnetId,
            securityGroupIds: [sg.securityGroupId]
        })
        infraconfig.addDependsOn(instanceprofile);

        const pipeline = new CfnImagePipeline(this, "UEPSWindowsImagePipeline", {
            name: "UEPSWindowsImagePipeline",
            imageRecipeArn: rcp.attrArn,
            infrastructureConfigurationArn: infraconfig.attrArn
        })
        pipeline.addDependsOn(rcp);
        pipeline.addDependsOn(infraconfig);

    }
}
