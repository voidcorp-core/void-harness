use void_machine_core::cluster::{
    reconcile_cluster, ClusterError, ClusterLane, ClusterTicket, ReconciliationLedger,
    ReviewProvenance, WorkerOutcome, WorkerReport,
};
use void_machine_core::merge::{
    decide_merge, CheckState, MergeLedger, MergeObservation, MergeRefusal, Protection, ReviewState,
};
use void_machine_core::{
    apply_git_effect, claim_git_effect, effect_id, GitEffectRequest, GitEffectState,
    ObservedCommit, SharedMutation,
};

fn ticket(id: &str, file: &str) -> ClusterTicket {
    ClusterTicket {
        id: id.into(),
        declared_files: vec![file.into()],
        lane: ClusterLane::Parallel,
    }
}

fn report(id: &str, file: &str) -> WorkerReport {
    WorkerReport {
        ticket_id: id.into(),
        outcome: WorkerOutcome::Completed,
        observed_files: vec![file.into()],
        review: ReviewProvenance::Panel,
    }
}

#[test]
fn cluster_reconciliation_integrates_disjoint_completed_workers() {
    let result = reconcile_cluster(
        &[ticket("DEV-1", "a"), ticket("DEV-2", "b")],
        &[report("DEV-1", "a"), report("DEV-2", "b")],
    )
    .unwrap();
    assert_eq!(result.tickets, vec!["DEV-1", "DEV-2"]);
    assert_eq!(result.files, vec!["a", "b"]);
}

#[test]
fn cluster_reconciliation_rejects_undeclared_widening() {
    let result = reconcile_cluster(
        &[ticket("DEV-1", "a"), ticket("DEV-2", "b")],
        &[report("DEV-1", "b"), report("DEV-2", "b")],
    );
    assert!(matches!(
        result,
        Err(ClusterError::UndeclaredWidening { .. })
    ));
}

#[test]
fn cluster_reconciliation_keeps_partial_failure_out_of_the_integrated_set() {
    let blocked = WorkerReport {
        ticket_id: "DEV-2".into(),
        outcome: WorkerOutcome::Blocked,
        observed_files: vec![],
        review: ReviewProvenance::None,
    };
    let result = reconcile_cluster(
        &[ticket("DEV-1", "a"), ticket("DEV-2", "b")],
        &[report("DEV-1", "a"), blocked],
    )
    .unwrap();
    assert_eq!(result.tickets, vec!["DEV-1"]);
}

#[test]
fn cluster_reconciliation_rejects_an_unreviewed_completed_worker() {
    let unreviewed = WorkerReport {
        review: ReviewProvenance::None,
        ..report("DEV-1", "a")
    };
    assert!(matches!(
        reconcile_cluster(&[ticket("DEV-1", "a")], &[unreviewed]),
        Err(ClusterError::MissingReview(_))
    ));
}

#[test]
fn cluster_reconciliation_allows_a_declared_sequential_collision() {
    let tickets = [
        ClusterTicket {
            lane: ClusterLane::Sequential,
            ..ticket("DEV-1", "shared")
        },
        ClusterTicket {
            lane: ClusterLane::Sequential,
            ..ticket("DEV-2", "shared")
        },
    ];
    let result = reconcile_cluster(
        &tickets,
        &[report("DEV-1", "shared"), report("DEV-2", "shared")],
    );
    assert!(result.is_ok());
}

#[test]
fn reconciliation_ledger_rejects_accepting_a_ticket_twice_after_resume() {
    let mut ledger = ReconciliationLedger::default();
    assert!(ledger.accept("DEV-1").is_ok());
    assert!(ledger.contains("DEV-1"));
    assert_eq!(
        ledger.accept("DEV-1"),
        Err(ClusterError::AlreadyAccepted("DEV-1".into()))
    );
}

fn merge_observation() -> MergeObservation {
    MergeObservation {
        target: "develop".into(),
        deploy_branch: "main".into(),
        integration_sha: "a".repeat(40),
        pull_request: Some(17),
        protection: Protection::Protected {
            required_checks: vec!["validate".into()],
        },
        checks: CheckState::Green {
            sha: "a".repeat(40),
        },
        review: ReviewState::Clean {
            sha: "a".repeat(40),
        },
        changed_paths: vec!["packages/cli/src/lib.ts".into()],
        human_gate: false,
        forced_push_attempt: false,
    }
}

#[test]
fn merge_grant_is_bound_to_the_exact_head_and_one_merge_command() {
    let grant = decide_merge(&merge_observation(), &MergeLedger::default()).unwrap();
    assert_eq!(
        grant.command[0..6],
        ["gh", "pr", "merge", "17", "--merge", "--match-head-commit"]
    );
    assert_eq!(grant.command[6], "a".repeat(40));
}

#[test]
fn merge_grant_rejects_stale_ci_and_review() {
    let mut observation = merge_observation();
    observation.checks = CheckState::Green {
        sha: "b".repeat(40),
    };
    assert_eq!(
        decide_merge(&observation, &MergeLedger::default()),
        Err(MergeRefusal::ChecksNotGreen)
    );
    observation.checks = CheckState::Green {
        sha: "a".repeat(40),
    };
    observation.review = ReviewState::Inconclusive;
    assert_eq!(
        decide_merge(&observation, &MergeLedger::default()),
        Err(MergeRefusal::ReviewUnavailable)
    );
}

#[test]
fn merge_grant_rejects_production_aliases_missing_protection_and_forced_push() {
    let mut observation = merge_observation();
    observation.deploy_branch = "refs/heads/develop".into();
    assert_eq!(
        decide_merge(&observation, &MergeLedger::default()),
        Err(MergeRefusal::ProductionDownstream)
    );
    observation.deploy_branch = "main".into();
    observation.protection = Protection::Unknown;
    assert_eq!(
        decide_merge(&observation, &MergeLedger::default()),
        Err(MergeRefusal::BaseUnprotected)
    );
    observation.protection = Protection::Protected {
        required_checks: vec!["validate".into()],
    };
    observation.forced_push_attempt = true;
    assert_eq!(
        decide_merge(&observation, &MergeLedger::default()),
        Err(MergeRefusal::ForcedPush)
    );
}

#[test]
fn merge_ledger_allows_exactly_one_merge() {
    let mut ledger = MergeLedger::default();
    assert!(ledger.record_merge(17).is_ok());
    assert_eq!(ledger.record_merge(17), Err(MergeRefusal::AlreadyMerged));
}

#[test]
fn merge_grant_refuses_human_gates_and_sensitive_paths() {
    let mut observation = merge_observation();
    observation.human_gate = true;
    assert_eq!(
        decide_merge(&observation, &MergeLedger::default()),
        Err(MergeRefusal::HumanGate)
    );
    observation.human_gate = false;
    observation.changed_paths = vec![".github/workflows/release.yml".into()];
    assert_eq!(
        decide_merge(&observation, &MergeLedger::default()),
        Err(MergeRefusal::SensitivePath)
    );
}

fn request() -> GitEffectRequest {
    GitEffectRequest {
        run_id: "run-1".into(),
        unit_id: "DEV-814".into(),
        revision: 7,
        ordinal: 0,
        declared_files: vec!["src/lib.rs".into()],
        payload: "commit-range".into(),
    }
}

fn observation() -> void_machine_core::GitEffectObservation {
    void_machine_core::GitEffectObservation {
        base_sha: "a".repeat(40),
        head_sha: "c".repeat(40),
        tree_sha: "d".repeat(40),
        source_sha: "e".repeat(40),
        commits: vec![ObservedCommit {
            sha: "c".repeat(40),
            parent: "a".repeat(40),
            merge: false,
        }],
        files: vec!["src/lib.rs".into()],
        shared_mutations: Vec::new(),
    }
}

#[test]
fn effect_identity_is_stable_for_the_canonical_request() {
    assert_eq!(effect_id(&request()), effect_id(&request()));
    assert_eq!(
        effect_id(&request()),
        effect_id(&GitEffectRequest {
            declared_files: vec!["src/lib.rs".into()],
            ..request()
        })
    );
    assert_ne!(
        effect_id(&request()),
        effect_id(&GitEffectRequest {
            ordinal: 1,
            ..request()
        })
    );
}

#[test]
fn claim_requires_a_positive_fencing_token() {
    let mut state = GitEffectState::pending(request());
    assert!(claim_git_effect(&mut state, 0).is_err());
    assert!(claim_git_effect(&mut state, 9).is_ok());
}

#[test]
fn applying_the_same_effect_twice_returns_the_original_proof() {
    let mut state = GitEffectState::pending(request());
    claim_git_effect(&mut state, 9).unwrap();
    let first = apply_git_effect(&mut state, 9, observation()).unwrap();
    let second = apply_git_effect(&mut state, 9, observation()).unwrap();
    assert_eq!(first, second);
    assert!(matches!(state, GitEffectState::Applied { .. }));
}

#[test]
fn stale_supervisor_cannot_apply_an_effect() {
    let mut state = GitEffectState::pending(request());
    claim_git_effect(&mut state, 9).unwrap();
    assert!(apply_git_effect(&mut state, 8, observation()).is_err());
    assert!(matches!(state, GitEffectState::Claimed { fence: 9, .. }));
}

#[test]
fn shared_repository_mutations_are_blocked_before_application() {
    let mut state = GitEffectState::pending(request());
    claim_git_effect(&mut state, 9).unwrap();
    let mut proof = observation();
    proof.shared_mutations = vec![SharedMutation::Stash];
    assert!(apply_git_effect(&mut state, 9, proof).is_err());
    assert!(matches!(state, GitEffectState::Claimed { fence: 9, .. }));
}

#[test]
fn a_range_with_a_merge_commit_is_rejected() {
    let mut state = GitEffectState::pending(request());
    claim_git_effect(&mut state, 9).unwrap();
    let mut proof = observation();
    proof.commits[0].merge = true;
    assert!(apply_git_effect(&mut state, 9, proof).is_err());
}

#[test]
fn an_unobserved_command_is_ambiguous_and_cannot_be_replayed() {
    let mut state = GitEffectState::pending(request());
    claim_git_effect(&mut state, 9).unwrap();
    void_machine_core::mark_git_effect_ambiguous(&mut state, 9, "command timed out").unwrap();
    assert!(apply_git_effect(&mut state, 9, observation()).is_err());
    assert!(matches!(state, GitEffectState::Ambiguous { .. }));
}
