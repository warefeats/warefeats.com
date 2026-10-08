import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import type { StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

const DOMAIN = "warefeats.com";

/**
 * One URL per page: www and extensionless paths without a trailing slash redirect to the canonical
 * URL, which the page's canonical tag names. Prerendered pages live at <route>/index.html, and S3
 * through OAC does not resolve directory indexes.
 */
export const VIEWER_REQUEST_CODE = `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var file = uri.lastIndexOf(".") > uri.lastIndexOf("/");
  var path = file || uri.endsWith("/") ? uri : uri + "/";
  var host = request.headers.host ? request.headers.host.value : "";
  if (host === "www.${DOMAIN}" || path !== uri) {
    var query = [];
    for (var name in request.querystring) {
      var values = request.querystring[name].multiValue || [request.querystring[name]];
      for (var i = 0; i < values.length; i++) {
        query.push(name + "=" + values[i].value);
      }
    }
    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: { location: { value: "https://${DOMAIN}" + path + (query.length ? "?" + query.join("&") : "") } }
    };
  }
  if (!file) {
    request.uri = uri + "index.html";
  }
  return request;
}`;

export class WarefeatsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const zone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: DOMAIN,
    });

    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: DOMAIN,
      subjectAlternativeNames: [`www.${DOMAIN}`],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: Duration.days(7),
          noncurrentVersionExpiration: Duration.days(30),
        },
      ],
    });

    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, "ResponseHeaders", {
      responseHeadersPolicyName: "warefeats-security-headers",
      comment: "Security and browser policy headers for the warefeats site",
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, preload: true, override: true },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
      customHeadersBehavior: {
        customHeaders: [
          { header: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=()", override: true },
        ],
      },
    });

    // The construct id and name predate the redirects; renaming would replace the live function.
    const indexRewrite = new cloudfront.Function(this, "IndexRewrite", {
      functionName: "warefeats-index-rewrite",
      comment: "Redirects to the canonical URL and maps routes to their prerendered index.html",
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(VIEWER_REQUEST_CODE),
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      domainNames: [DOMAIN, `www.${DOMAIN}`],
      certificate,
      enableIpv6: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: indexRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(1) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(1) },
      ],
    });

    new route53.ARecord(this, "ApexAlias", {
      zone,
      recordName: DOMAIN,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    new route53.AaaaRecord(this, "ApexAliasV6", {
      zone,
      recordName: DOMAIN,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    new route53.ARecord(this, "WwwAlias", {
      zone,
      recordName: `www.${DOMAIN}`,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    new route53.AaaaRecord(this, "WwwAliasV6", {
      zone,
      recordName: `www.${DOMAIN}`,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    new route53.TxtRecord(this, "GoogleSiteVerification", {
      zone,
      recordName: DOMAIN,
      values: ["google-site-verification=kbdd4PhTIpAD2aw4lUTCsmxTpIwa4qk4UZbspA6SF68"],
    });

    new CfnOutput(this, "SiteBucketName", {
      value: siteBucket.bucketName,
      description: "S3 bucket receiving the built web files",
    });

    new CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
      description: "CloudFront distribution invalidated after each deploy",
    });

    new CfnOutput(this, "SiteUrl", {
      value: `https://${DOMAIN}`,
      description: "Public site URL",
    });
  }
}
