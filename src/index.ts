/* eslint-disable @typescript-eslint/no-require-imports */
import assert = require("assert");
import { spawnSync } from "child_process";
import * as path from "path";
import { pascalCase } from "change-case";
import * as fs from "fs-extra";
import { cdk } from "projen";
import { AutoMerge } from "./auto-merge";
import { CdktfConfig } from "./cdktf-config";
import { PackageInfo } from "./package-info";
import { ProviderUpgrade } from "./provider-upgrade";

const version = require("../version.json").version;

function getMajorVersion(outdir = process.cwd()): number | undefined {
  const gitPath = path.resolve(outdir, ".git");

  // Git repo is not initialized yet, so we need to set the version to 1
  if (!fs.existsSync(gitPath)) {
    return 1;
  }

  const out = spawnSync(`git tag -l 'v1.*'`, {
    shell: true,
    cwd: outdir,
  });

  // If there is no v1.x tag the command has no stdout and we set 1 as the major version
  return out.stdout.length > 0 ? undefined : 1;
}

export interface CdktfProviderProjectOptions extends cdk.JsiiProjectOptions {
  readonly terraformProvider: string;
  readonly cdktfVersion: string;
  readonly constructsVersion: string;
  readonly jsiiVersion?: string;
}

const authorName = "HashiCorp";
const authorAddress = "https://hashicorp.com";
const namespace = "cdktf";
const githubNamespace = "hashicorp";

const getMavenName = (providerName: string): string => {
  return ["null", "random"].includes(providerName)
    ? `${providerName}_provider`
    : providerName.replace(/-/gi, "_");
};
export class CdktfProviderProject extends cdk.JsiiProject {
  constructor(options: CdktfProviderProjectOptions) {
    const {
      terraformProvider,
      workflowContainerImage = "hashicorp/jsii-terraform",
      cdktfVersion,
      constructsVersion,
      minNodeVersion,
      jsiiVersion,
    } = options;
    const [fqproviderName, providerVersion] = terraformProvider.split("@");
    const providerName = fqproviderName.split("/").pop();
    assert(providerName, `${terraformProvider} doesn't seem to be valid`);
    assert(
      !providerName.endsWith("-go"),
      "providerName may not end with '-go' as this can conflict with repos for go packages"
    );

    const nugetName = `HashiCorp.${pascalCase(
      namespace
    )}.Providers.${pascalCase(providerName)}`;
    const mavenName = `com.${githubNamespace}.cdktf.providers.${getMavenName(
      providerName
    )}`;

    const packageInfo: PackageInfo = {
      npm: {
        name: `@${namespace}/provider-${providerName}`,
      },
      python: {
        distName: `${namespace}-cdktf-provider-${providerName.replace(
          /-/gi,
          "_"
        )}`,
        module: `${namespace}_cdktf_provider_${providerName.replace(
          /-/gi,
          "_"
        )}`,
      },
      publishToNuget: {
        dotNetNamespace: nugetName,
        packageId: nugetName,
      },
      publishToMaven: {
        javaPackage: mavenName,
        mavenGroupId: `com.${githubNamespace}`,
        mavenArtifactId: `cdktf-provider-${providerName}`,
        mavenEndpoint: "https://hashicorp.oss.sonatype.org",
      },
      publishToGo: {
        moduleName: `github.com/hashicorp/cdktf-provider-${providerName}-go`,
        gitUserEmail: "github-team-tf-cdk@hashicorp.com",
        gitUserName: "CDK for Terraform Team",
      },
    };

    super({
      ...options,
      workflowContainerImage,
      license: "MPL-2.0",
      releaseToNpm: true,
      minNodeVersion,
      devDeps: [`@cdktf/provider-project@^${version}`, "dot-prop@^5.2.0"],
      name: packageInfo.npm.name,
      description: `Prebuilt ${providerName} Provider for Terraform CDK (cdktf)`,
      keywords: ["cdktf", "terraform", "cdk", "provider", providerName],
      sampleCode: false,
      jest: false,
      authorAddress,
      authorName,
      authorOrganization: true,
      defaultReleaseBranch: "main",
      repository: `https://github.com/${githubNamespace}/cdktf-provider-${providerName}.git`,
      mergify: false,
      eslint: false,
      depsUpgradeOptions: {
        workflowOptions: {
          labels: ["automerge"],
        },
      },
      python: packageInfo.python,
      publishToNuget: packageInfo.publishToNuget,
      publishToMaven: packageInfo.publishToMaven,
      publishToGo: packageInfo.publishToGo,
      peerDependencyOptions: {
        pinnedDevDependency: false,
      },
      workflowGitIdentity: {
        name: "team-tf-cdk",
        email: "github-team-tf-cdk@hashicorp.com",
      },
      // sets major version to 1 for the first version but resets it for future versions to allow them to automatically increase to e.g. v2 if breaking changes occurred
      majorVersion: getMajorVersion(options.outdir),
    });

    // workaround because JsiiProject does not support setting packageName
    this.manifest.jsii.targets.go.packageName = providerName;

    this.tasks.addEnvironment("CHECKPOINT_DISABLE", "1");

    new CdktfConfig(this, {
      terraformProvider,
      providerName,
      providerVersion,
      cdktfVersion,
      constructsVersion,
      jsiiVersion,
      packageInfo,
    });
    new ProviderUpgrade(this);
    new AutoMerge(this);
  }
}
