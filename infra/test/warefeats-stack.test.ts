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

  test("redirects a moved page, card or matchup to where it lives now, in one hop, keeping the query", () => {
    const post = request("/benchmarks/maplibre-gl-js-vs-mapbox-gl-js/");
    expect(post.statusCode).toBe(301);
    expect(post.headers.location?.value).toBe("https://warefeats.com/posts/2026-09-02-web-map-renderers-mapbox-gl-js-vs-maplibre-gl-js/");
    expect(request("/benchmarks/maplibre-gl-js-vs-mapbox-gl-js").headers.location?.value).toBe("https://warefeats.com/posts/2026-09-02-web-map-renderers-mapbox-gl-js-vs-maplibre-gl-js/");
    const matchup = request("/benchmarks/maplibre-gl-js-vs-mapbox-gl-js/matchup/", "warefeats.com", { run: { value: "2026-10-12-radeon-680m-win11" }, pick: { value: "maplibre-gl-5%2Cmaplibre-gl-6" } });
    expect(matchup.headers.location?.value).toBe("https://warefeats.com/benchmarks/web-map-renderers/?run=2026-10-12-radeon-680m-win11&pick=maplibre-gl-5%2Cmaplibre-gl-6");
    expect(request("/og/matchup/maplibre-gl-js-vs-mapbox-gl-js.png").headers.location?.value).toBe("https://warefeats.com/og/benchmarks/web-map-renderers.png");
    expect(request("/og/desktop-shells.png").headers.location?.value).toBe("https://warefeats.com/og/posts/2026-09-10-desktop-shells-tauri-vs-electron.png");
    expect(request("/posts/").headers.location?.value).toBe("https://warefeats.com/");
  });

  test("serves the new pages, and the old desktop-shells post URL as that benchmark's page", () => {
    expect(request("/posts/2026-09-02-web-map-renderers-mapbox-gl-js-vs-maplibre-gl-js/").uri).toBe("/posts/2026-09-02-web-map-renderers-mapbox-gl-js-vs-maplibre-gl-js/index.html");
    expect(request("/benchmarks/web-map-renderers/").uri).toBe("/benchmarks/web-map-renderers/index.html");
    expect(request("/benchmarks/").uri).toBe("/benchmarks/index.html");
    expect(request("/constructor/").uri).toBe("/constructor/index.html");
  });

  test("redirects www to the apex, keeping the path and the query", () => {
    const response = request("/benchmarks/desktop-shells", "www.warefeats.com", { ref: { value: "a%20b" }, tag: { value: "x", multiValue: [{ value: "x" }, { value: "y" }] } });
    expect(response.statusCode).toBe(301);
    expect(response.headers.location?.value).toBe("https://warefeats.com/benchmarks/desktop-shells/?ref=a%20b&tag=x&tag=y");
    expect(request("/og/site.png", "www.warefeats.com").headers.location?.value).toBe("https://warefeats.com/og/site.png");
  });
});
