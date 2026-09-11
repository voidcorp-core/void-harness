use void_machine_core::{
    apply_git_effect, claim_git_effect, effect_id, GitEffectRequest, GitEffectState,
    ObservedCommit, SharedMutation,
};

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
