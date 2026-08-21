import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  extractNpmProvenanceBundle,
  integrityToSha512Hex,
  verifyPublicationProvenance,
} from '../../scripts/release-provenance-contract.mjs';

const RELEASE_COMMIT = 'a'.repeat(40);
const WORKFLOW_HEAD_SHA = 'b'.repeat(40);
const TARBALL = Buffer.from('published tarball');
const SHA512 = createHash('sha512').update(TARBALL).digest('hex');
const RUN_ID = '32466960155';
const RUN_ATTEMPT = '2';
const INVOCATION =
  `https://github.com/voidcorp-core/void-harness/actions/runs/${RUN_ID}/attempts/${RUN_ATTEMPT}`;

function statement() {
  return {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: 'pkg:npm/voidharness@3.4.0', digest: { sha512: SHA512 } }],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
        externalParameters: {
          workflow: {
            ref: 'refs/heads/main',
            repository: 'https://github.com/voidcorp-core/void-harness',
            path: '.github/workflows/release.yml',
          },
        },
        resolvedDependencies: [
          {
            uri: 'git+https://github.com/voidcorp-core/void-harness@refs/heads/main',
            digest: { gitCommit: WORKFLOW_HEAD_SHA },
          },
        ],
      },
      runDetails: {
        builder: { id: 'https://github.com/actions/runner/github-hosted' },
        metadata: { invocationId: INVOCATION },
      },
    },
  };
}

function fixture() {
  const signedStatement = statement();
  const bundle = {
    mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
    verificationMaterial: { certificate: { rawBytes: 'fixture' }, tlogEntries: [{}] },
    dsseEnvelope: {
      payloadType: 'application/vnd.in-toto+json',
      payload: Buffer.from(JSON.stringify(signedStatement)).toString('base64'),
      signatures: [{ sig: 'fixture' }],
    },
  };
  const npmAudit = {
    invalid: [],
    missing: [],
    verified: [
      {
        name: 'voidharness',
        version: '3.4.0',
        registry: 'https://registry.npmjs.org/',
        attestationBundles: [
          { predicateType: 'https://slsa.dev/provenance/v1', bundle },
        ],
      },
    ],
  };
  const ghVerification = [
    {
      verificationResult: {
        signature: {
          certificate: {
            issuer: 'https://token.actions.githubusercontent.com',
            githubWorkflowRepository: 'voidcorp-core/void-harness',
            githubWorkflowRef: 'refs/heads/main',
            buildSignerURI:
              'https://github.com/voidcorp-core/void-harness/.github/workflows/release.yml@refs/heads/main',
            buildSignerDigest: WORKFLOW_HEAD_SHA,
            runnerEnvironment: 'github-hosted',
            sourceRepositoryURI: 'https://github.com/voidcorp-core/void-harness',
            sourceRepositoryDigest: WORKFLOW_HEAD_SHA,
            sourceRepositoryRef: 'refs/heads/main',
            runInvocationURI: INVOCATION,
          },
        },
        verifiedTimestamps: [
          { type: 'Tlog', uri: 'https://rekor.sigstore.dev', timestamp: '2026-08-21T09:24:19Z' },
        ],
        statement: signedStatement,
      },
    },
  ];
  return { npmAudit, ghVerification, bundle };
}

const expected = {
  packageName: 'voidharness',
  version: '3.4.0',
  sha512: SHA512,
  releaseCommit: RELEASE_COMMIT,
  workflowHeadSha: WORKFLOW_HEAD_SHA,
  runId: RUN_ID,
  runAttempt: RUN_ATTEMPT,
};

describe('published npm provenance', () => {
  it('converts npm integrity to the digest verified by GitHub CLI', () => {
    const integrity = `sha512-${createHash('sha512').update(TARBALL).digest('base64')}`;
    expect(integrityToSha512Hex(integrity)).toBe(SHA512);
  });

  it('extracts the sole npm-verified SLSA bundle', () => {
    const { npmAudit, bundle } = fixture();
    expect(extractNpmProvenanceBundle(npmAudit, expected)).toEqual(bundle);
  });

  it('accepts one cryptographically verified statement bound to this run', () => {
    const { npmAudit, ghVerification } = fixture();
    expect(verifyPublicationProvenance({ npmAudit, ghVerification, expected })).toEqual({
      packageName: 'voidharness',
      version: '3.4.0',
      releaseCommit: RELEASE_COMMIT,
      workflowHeadSha: WORKFLOW_HEAD_SHA,
      runId: RUN_ID,
      runAttempt: RUN_ATTEMPT,
      sha512: SHA512,
    });
  });

  it.each([
    ['subject', (value: ReturnType<typeof fixture>) => {
      value.ghVerification[0].verificationResult.statement.subject[0].name = 'pkg:npm/other@3.4.0';
    }],
    ['repository', (value: ReturnType<typeof fixture>) => {
      value.ghVerification[0].verificationResult.signature.certificate.githubWorkflowRepository =
        'attacker/repo';
    }],
    ['workflow', (value: ReturnType<typeof fixture>) => {
      value.ghVerification[0].verificationResult.statement.predicate.buildDefinition.externalParameters.workflow.path =
        '.github/workflows/other.yml';
    }],
    ['ref', (value: ReturnType<typeof fixture>) => {
      value.ghVerification[0].verificationResult.signature.certificate.sourceRepositoryRef =
        'refs/heads/develop';
    }],
    ['commit', (value: ReturnType<typeof fixture>) => {
      value.ghVerification[0].verificationResult.signature.certificate.sourceRepositoryDigest =
        'c'.repeat(40);
    }],
    ['run', (value: ReturnType<typeof fixture>) => {
      value.ghVerification[0].verificationResult.signature.certificate.runInvocationURI =
        'https://github.com/voidcorp-core/void-harness/actions/runs/1/attempts/2';
    }],
    ['attempt', (value: ReturnType<typeof fixture>) => {
      value.ghVerification[0].verificationResult.statement.predicate.runDetails.metadata.invocationId =
        `https://github.com/voidcorp-core/void-harness/actions/runs/${RUN_ID}/attempts/1`;
    }],
    ['digest', (value: ReturnType<typeof fixture>) => {
      value.ghVerification[0].verificationResult.statement.subject[0].digest.sha512 =
        'c'.repeat(128);
    }],
  ])('rejects a wrong %s', (_name, mutate) => {
    const value = fixture();
    mutate(value);
    expect(() => verifyPublicationProvenance({ ...value, expected })).toThrow();
  });

  it('rejects missing, duplicate and npm-invalid attestations', () => {
    const missing = fixture();
    missing.npmAudit.verified[0].attestationBundles = [];
    expect(() => verifyPublicationProvenance({ ...missing, expected })).toThrow(/one.*SLSA/i);

    const duplicate = fixture();
    duplicate.ghVerification.push(structuredClone(duplicate.ghVerification[0]));
    expect(() => verifyPublicationProvenance({ ...duplicate, expected })).toThrow(/one.*verified/i);

    const invalid = fixture();
    invalid.npmAudit.invalid.push({ name: 'voidharness', version: '3.4.0' });
    expect(() => verifyPublicationProvenance({ ...invalid, expected })).toThrow(/invalid/i);
  });
});
