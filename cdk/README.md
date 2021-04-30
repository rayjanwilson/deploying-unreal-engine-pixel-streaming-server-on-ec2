# Welcome to your CDK TypeScript project!

This is a blank project for TypeScript development with CDK.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template


To find aws managed components to add to your image recipe, there is no online registry. You'll have to go through aws web console.

Note: There is a known issue wrt version numbers for the image recipe and the component recipe. For the time being, if you edit `resources/AMIDependencyInstall.yaml` then you'll have to increment `onst installComponent = new imagebuilder.CfnComponent` and if you add new components to `const rcp = new imagebuilder.CfnImageRecipe(` then you'll have to increment its version.
Punting on that automation for now

References:
- https://aws.amazon.com/blogs/mt/create-immutable-servers-using-ec2-image-builder-aws-codepipeline/
  - this is the cat's meow
  - [source repo](https://github.com/aws-samples/immutable-server-pipeline/blob/main/codecommit-repo/cf-build-image.yaml)
- https://www.arhs-group.com/ami-factory-aws-codepipeline-codebuild-packer-ansible/
  - i like the diagram and basic writeup of the different "types" of AMIs