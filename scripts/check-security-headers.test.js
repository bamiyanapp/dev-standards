"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const yaml = require("js-yaml");
const { buildSchema } = require("./check-dynamodb-protection.js");
const { check } = require("./check-security-headers.js");

const load = (text) => yaml.load(text, { schema: buildSchema(yaml) });

const WITH_POLICY = `
resources:
  Resources:
    Distribution:
      Type: AWS::CloudFront::Distribution
      Properties:
        DistributionConfig:
          DefaultCacheBehavior:
            TargetOriginId: s3
            ResponseHeadersPolicyId: !Ref SecurityHeadersPolicy
          CacheBehaviors:
            - PathPattern: /api/*
              ResponseHeadersPolicyId: !Ref SecurityHeadersPolicy
`;

test("DefaultCacheBehaviorとCacheBehaviorsのすべてに関連付けがあれば、違反なし", () => {
  const r = check(load(WITH_POLICY), "serverless.yml");
  assert.deepEqual([r.distributions, r.checked, r.violations.length], [1, 1, 0]);
});

test("DefaultCacheBehaviorに関連付けが無ければ、違反（!Refなどのタグも読める）", () => {
  const r = check(load(WITH_POLICY.replace("            ResponseHeadersPolicyId: !Ref SecurityHeadersPolicy\n          CacheBehaviors", "          CacheBehaviors")), "s.yml");
  assert.equal(r.violations.length, 1);
  assert.match(r.violations[0].problems[0], /DefaultCacheBehavior/);
});

test("CacheBehaviorsの一部に関連付けが無ければ、そのパスを示して違反にする", () => {
  const r = check(load(WITH_POLICY + "            - PathPattern: /static/*\n              TargetOriginId: s3\n"), "s.yml");
  assert.equal(r.violations.length, 1);
  assert.match(r.violations[0].problems[0], /CacheBehaviors\[1\]（\/static\/\*）/);
});

test("理由つきのMetadataで除外でき、理由が空なら違反になる", () => {
  const base = "Resources:\n  D:\n    Type: AWS::CloudFront::Distribution\n    Properties:\n      DistributionConfig:\n        DefaultCacheBehavior: { TargetOriginId: x }\n";
  const ok = check(load(base + "    Metadata:\n      DevStandardsSecurityHeadersExempt: 社内の検証用で公開しない\n"), "t.yaml");
  assert.deepEqual([ok.exempt, ok.violations.length], [1, 0]);
  for (const bad of ['""', "true"]) {
    const r = check(load(base + `    Metadata:\n      DevStandardsSecurityHeadersExempt: ${bad}\n`), "t.yaml");
    assert.match(r.violations[0].problems[0], /理由/);
  }
});

test("ディストリビューションが無い構成は、何も報告しない", () => {
  const r = check(load("service: x\nfunctions:\n  a:\n    handler: h\n"), "serverless.yml");
  assert.deepEqual([r.distributions, r.violations.length], [0, 0]);
});
