import { describe, expect, test } from "bun:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { VIEWER_REQUEST_CODE, WarefeatsStack } from "../lib/warefeats-stack";

test("keeps the origin private and serves it through CloudFront", () => {
  const app = new App();
  const stack = new WarefeatsStack(app, "TestStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });
  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::S3::Bucket", 1);
  template.hasResourceProperties("AWS::S3::Bucket", {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: Match.arrayWith([
        Match.objectLike({ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }),
      ]),
    },
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    VersioningConfiguration: { Status: "Enabled" },
  });

  template.hasResourceProperties("AWS::CloudFront::Distribution", {
    DistributionConfig: Match.objectLike({
      DefaultRootObject: "index.html",
      HttpVersion: "http2and3",
      IPV6Enabled: true,
      PriceClass: "PriceClass_100",
      Enabled: true,
      Aliases: ["warefeats.com", "www.warefeats.com"],
    }),
  });

  template.hasResourceProperties("AWS::CertificateManager::Certificate", {
    DomainName: "warefeats.com",
    SubjectAlternativeNames: ["www.warefeats.com"],
  });

  template.resourceCountIs("AWS::Route53::RecordSet", 5);
  template.resourceCountIs("AWS::CloudFront::Function", 1);
  template.hasResourceProperties("AWS::CloudFront::Distribution", {
    DistributionConfig: Match.objectLike({
      DefaultCacheBehavior: Match.objectLike({
        FunctionAssociations: [Match.objectLike({ EventType: "viewer-request" })],
      }),
    }),
  });
});

describe("viewer request function", () => {
  const handler = new Function(`${VIEWER_REQUEST_CODE}\nreturn handler;`)() as (event: unknown) => { statusCode?: number; headers: Record<string, { value: string }>; uri?: string };
  const request = (uri: string, host = "warefeats.com", querystring: Record<string, unknown> = {}) => handler({ request: { method: "GET", uri, querystring, headers: { host: { value: host } }, cookies: {} } });

  test("maps a page URL to its prerendered index.html", () => {
    expect(request("/").uri).toBe("/index.html");
    expect(request("/benchmarks/desktop-shells/").uri).toBe("/benchmarks/desktop-shells/index.html");
  });

  test("passes files through untouched", () => {
    expect(request("/og/site.png").uri).toBe("/og/site.png");
    expect(request("/sitemap.xml").uri).toBe("/sitemap.xml");
  });

  test("redirects a page URL without its trailing slash", () => {
    const response = request("/methodology");
    expect(response.statusCode).toBe(301);
    expect(response.headers.location?.value).toBe("https://warefeats.com/methodology/");
  });

  test("redirects www to the apex, keeping the path and the query", () => {
    const response = request("/benchmarks/desktop-shells", "www.warefeats.com", { ref: { value: "a%20b" }, tag: { value: "x", multiValue: [{ value: "x" }, { value: "y" }] } });
    expect(response.statusCode).toBe(301);
    expect(response.headers.location?.value).toBe("https://warefeats.com/benchmarks/desktop-shells/?ref=a%20b&tag=x&tag=y");
    expect(request("/og/site.png", "www.warefeats.com").headers.location?.value).toBe("https://warefeats.com/og/site.png");
  });
});
