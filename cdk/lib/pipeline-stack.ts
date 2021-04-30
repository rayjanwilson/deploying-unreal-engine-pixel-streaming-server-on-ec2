import { Construct, SecretValue, Stack, StackProps } from "@aws-cdk/core";
import * as cb from "@aws-cdk/aws-codebuild";
import * as cp from "@aws-cdk/aws-codepipeline";
import * as cpa from "@aws-cdk/aws-codepipeline-actions";

export class PipelineStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const sourceArtifact = new cp.Artifact();
        const cdkBuildOutput = new cp.Artifact();

        // CodeBuild Project
        const cdkBuildProject = new cb.PipelineProject(this, "CdkBuildProject", {
            buildSpec: cb.BuildSpec.fromObject({
                version: "0.2",
                phases: {
                    install: {
                        "runtime-versions": { nodejs: 14 },
                        commands: ["cd cdk", "npm install"],
                    },
                    build: {
                        commands: ["npm run build", "npm run cdk synth --", "ls -la", " ls -la cdk.out/"],
                    },
                },
                artifacts: {
                    "base-directory": "cdk/cdk.out",
                    files: [
                        `${this.stackName}.template.json`,
                        'UEPSNetworkStack.template.json',
                        'UEPSBuilderStack.template.json',
                        'cdk.out',
                        'manifest.json',
                        'tree.json'
                    ]
                }
            }),
            environment: {
                buildImage: cb.LinuxBuildImage.STANDARD_5_0
            }
        });

        // Actions
        const sourceAction = new cpa.GitHubSourceAction({
            actionName: "GitHubSource",
            output: sourceArtifact,
            oauthToken: SecretValue.secretsManager("github-token"),
            owner: "rayjanwilson",
            repo: "deploying-unreal-engine-pixel-streaming-server-on-ec2",
            branch: '12-trigger-from-sns',
            trigger: cpa.GitHubTrigger.WEBHOOK
        });

        // Pipeline
        new cp.Pipeline(this, 'BuildPipeline', {
            stages: [
                {
                    stageName: 'Source',
                    actions: [ sourceAction]
                },
                {
                    stageName: 'BuildAndAdministerPipeline',
                    actions: [
                        new cpa.CodeBuildAction({
                            actionName: 'CDK_Build',
                            project: cdkBuildProject,
                            input: sourceArtifact,
                            outputs: [ cdkBuildOutput ],
                            runOrder: 1
                        }),
                        new cpa.CloudFormationCreateUpdateStackAction({
                            actionName: "AdministerPipeline",
                            templatePath: cdkBuildOutput.atPath(`${this.stackName}.template.json`),
                            stackName: this.stackName,
                            adminPermissions: true,
                            runOrder: 2,
                        })
                    ]
                },
                {
                    stageName: 'AMIBuilder',
                    actions: [
                        new cpa.CloudFormationCreateUpdateStackAction({
                            actionName: 'ImageBuilder',
                            adminPermissions: true,
                            templatePath: cdkBuildOutput.atPath('UEPSBuilderStack.template.json'),
                            stackName: 'UEPSBuilderStack',
                            runOrder: 1
                        })
                    ]
                }
            ],
            restartExecutionOnUpdate: true
        })

    }
}
