import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  extractNpmProvenanceBundle,
  integrityToSha512Hex,
  resolveNpmPublicationProvenance,
  verifyPublicationProvenance,
} from '../../scripts/release-provenance-contract.mjs';

const RELEASE_COMMIT = 'a'.repeat(40);
const WORKFLOW_HEAD_SHA = 'b'.repeat(40);
const TARBALL = Buffer.from('published tarball');
const SHA512 = createHash('sha512').update(TARBALL).digest('hex');
const RUN_ID = '32466960155';
const RUN_ATTEMPT = '2';

type Producer = {
  workflowHeadSha: string;
  runId: string;
  runAttempt: string;
};

const CURRENT_PRODUCER: Producer = {
  workflowHeadSha: WORKFLOW_HEAD_SHA,
  runId: RUN_ID,
  runAttempt: RUN_ATTEMPT,
};

function invocation(producer: Producer) {
  return `https://github.com/voidcorp-core/void-harness/actions/runs/${producer.runId}/attempts/${producer.runAttempt}`;
}

function statement(producer = CURRENT_PRODUCER) {
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
            digest: { gitCommit: producer.workflowHeadSha },
          },
        ],
      },
      runDetails: {
        builder: { id: 'https://github.com/actions/runner/github-hosted' },
        metadata: { invocationId: invocation(producer) },
      },
    },
  };
}

function fixture(producer = CURRENT_PRODUCER) {
  const signedStatement = statement(producer);
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
            buildSignerDigest: producer.workflowHeadSha,
            runnerEnvironment: 'github-hosted',
            sourceRepositoryURI: 'https://github.com/voidcorp-core/void-harness',
            sourceRepositoryDigest: producer.workflowHeadSha,
            sourceRepositoryRef: 'refs/heads/main',
            runInvocationURI: invocation(producer),
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
  publicationMode: 'new',
  currentWorkflowHeadSha: WORKFLOW_HEAD_SHA,
  currentRunId: RUN_ID,
  currentRunAttempt: RUN_ATTEMPT,
  producerWorkflowHeadSha: WORKFLOW_HEAD_SHA,
  producerRunId: RUN_ID,
  producerRunAttempt: RUN_ATTEMPT,
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
      publicationMode: 'new',
      workflowHeadSha: WORKFLOW_HEAD_SHA,
      runId: RUN_ID,
      runAttempt: RUN_ATTEMPT,
      sha512: SHA512,
    });
  });

  it('accepts an existing version attested by its earlier canonical publishing run', () => {
    const earlierProducer = {
      workflowHeadSha: 'c'.repeat(40),
      runId: '30000000001',
      runAttempt: '1',
    };
    const currentRetry = {
      ...expected,
      publicationMode: 'existing',
      currentWorkflowHeadSha: 'd'.repeat(40),
      currentRunId: '40000000002',
      currentRunAttempt: '3',
    };
    const value = fixture(earlierProducer);

    expect(resolveNpmPublicationProvenance(value.npmAudit, currentRetry)).toEqual({
      bundle: value.bundle,
      workflowHeadSha: earlierProducer.workflowHeadSha,
      runId: earlierProducer.runId,
      runAttempt: earlierProducer.runAttempt,
    });
    expect(
      verifyPublicationProvenance({
        ...value,
        expected: {
          ...currentRetry,
          producerWorkflowHeadSha: earlierProducer.workflowHeadSha,
          producerRunId: earlierProducer.runId,
          producerRunAttempt: earlierProducer.runAttempt,
        },
      }),
    ).toMatchObject({
      publicationMode: 'existing',
      workflowHeadSha: earlierProducer.workflowHeadSha,
      runId: earlierProducer.runId,
      runAttempt: earlierProducer.runAttempt,
    });
  });

  it('rejects an earlier producer when this execution claims a new publication', () => {
    const earlierProducer = {
      workflowHeadSha: 'c'.repeat(40),
      runId: '30000000001',
      runAttempt: '1',
    };
    expect(() =>
      resolveNpmPublicationProvenance(fixture(earlierProducer).npmAudit, expected),
    ).toThrow(/current workflow execution/i);
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
