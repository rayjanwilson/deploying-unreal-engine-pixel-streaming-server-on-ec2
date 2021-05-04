import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';
import * as imagebuilder from '@aws-cdk/aws-imagebuilder';
import * as YAML from 'js-yaml';
import * as fs from 'fs';
import { CfnPipeline } from '@aws-cdk/aws-codepipeline';

interface Props extends cdk.StackProps {
    vpc: ec2.Vpc,
}

export class ImageBuilderStack extends cdk.Stack {

    constructor(scope: cdk.Construct, id: string, props: Props) {
        super(scope, id, props);

        // "this" is the current construct. use for pseudo paramters
        const stack = cdk.Stack.of(this);

        let role = new iam.Role(this, 'UEPSWindowsImageBuilderRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                { 'managedPolicyArn': 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore' },
                { 'managedPolicyArn': 'arn:aws:iam::aws:policy/EC2InstanceProfileForImageBuilder' },
            ]
        });

        const subnet = props.vpc.publicSubnets[0];
        const sg = new ec2.SecurityGroup(this, 'ImageBuilder-sg', {
            vpc: props.vpc
        })
        sg.addIngressRule(ec2.Peer.anyIpv4(), new ec2.Port({
            // TODO: lock this down
            protocol: ec2.Protocol.ALL,
            stringRepresentation: 'Everything'
        }));

        // image builder components

        const component_version = "1.0.4"
        const image_version = "1.0.4"

        const component_firewall_data = YAML.load(fs.readFileSync('resources/install_firewall_rules.yml', 'utf8'));
        const component_firewall = new imagebuilder.CfnComponent(this, "InstallFirewallRules", {
            name: "FirewallRulesComponent",
            platform: "Windows",
            version: component_version,
            data: YAML.dump(component_firewall_data)
        });

        const component_nodejs_data = YAML.load(fs.readFileSync('resources/install_nodejs.yml', 'utf8'));
        const component_nodejs = new imagebuilder.CfnComponent(this, "InstallNodeJS", {
            name: "NodeJSComponentBump",
            platform: "Windows",
            version: component_version,
            data: YAML.dump(component_nodejs_data)
        });

        const component_nvidia_data = YAML.load(fs.readFileSync('resources/install_nvidia.yml', 'utf8'));
        const component_nvidia = new imagebuilder.CfnComponent(this, "InstallNvidia", {
            name: "NvidiaComponent",
            platform: "Windows",
            version: component_version,
            data: YAML.dump(component_nvidia_data)
        });

        const component_nice_dcv_data = YAML.load(fs.readFileSync('resources/install_nice_dcv.yml', 'utf8'));
        const component_nice_dcv = new imagebuilder.CfnComponent(this, "InstallNiceDCV", {
            name: "NiceDCVComponent",
            platform: "Windows",
            version: component_version,
            data: YAML.dump(component_nice_dcv_data)
        });


        // image builder pipeline

        const instanceprofile = new iam.CfnInstanceProfile(this, "UEPSWindowsImageInstanceProfile", {
            instanceProfileName: 'UEPSWindowsImageInstanceProfile',
            roles: [role.roleName]
        });

        const image_recipe = new imagebuilder.CfnImageRecipe(this, 'UEPSWindowsImageRecipe', {
            name: 'UEPSWindowsImageRecipe',
            version: image_version,
            components: [
                { "componentArn": `arn:aws:imagebuilder:${stack.region}:aws:component/dotnet-core-sdk-windows/3.1.0` },
                { "componentArn": `arn:aws:imagebuilder:${stack.region}:aws:component/amazon-cloudwatch-agent-windows/1.0.0` },
                { "componentArn": `arn:aws:imagebuilder:${stack.region}:aws:component/aws-cli-version-2-windows/1.0.0` },
                { "componentArn": `arn:aws:imagebuilder:${stack.region}:aws:component/chocolatey/1.0.0` },
                { "componentArn": `arn:aws:imagebuilder:${stack.region}:aws:component/update-windows/1.0.0` },
                { "componentArn": component_firewall.attrArn },
                { "componentArn": component_nodejs.attrArn },
                { "componentArn": component_nvidia.attrArn },
                { "componentArn": component_nice_dcv.attrArn }
            ],
            // Core image should be used for deploying, base is helpful for development debugging
            // parentImage: 'arn:aws:imagebuilder:us-east-1:aws:image/windows-server-2019-english-core-base-x86/x.x.x'
            parentImage: `arn:aws:imagebuilder:${stack.region}:aws:image/windows-server-2019-english-full-base-x86/x.x.x`
        });

        const infraconfig = new imagebuilder.CfnInfrastructureConfiguration(this, "UEPSWindowsImageInfrastructureConfig", {
            name: "UEPSWindowsImageInfrastructureConfig",
            instanceTypes: ["g4dn.xlarge"],
            instanceProfileName: "UEPSWindowsImageInstanceProfile",
            subnetId: subnet.subnetId,
            securityGroupIds: [sg.securityGroupId]
        })
        // infraconfig.addDependsOn(instanceprofile);

        const pipeline = new imagebuilder.CfnImagePipeline(this, "UEPSWindowsImagePipeline", {
            name: "UEPSWindowsImagePipeline",
            imageRecipeArn: image_recipe.attrArn,
            infrastructureConfigurationArn: infraconfig.attrArn,
            schedule: {
                scheduleExpression: 'cron(0 0 * * ? *)',
                pipelineExecutionStartCondition: "EXPRESSION_MATCH_AND_DEPENDENCY_UPDATES_AVAILABLE"
            }
        });
        // Run daily at midnight (UTC) https://docs.aws.amazon.com/imagebuilder/latest/userguide/cron-expressions.html
        // pipeline.addDependsOn(image_recipe);
        // pipeline.addDependsOn(infraconfig);

        // new imagebuilder.CfnImage(this, 'UEPSWindowsImage', {
        //     imageRecipeArn: image_recipe.attrArn,
        //     infrastructureConfigurationArn: infraconfig.attrArn
        // });

    }
}
