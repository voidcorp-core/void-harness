use std::collections::BTreeSet;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Protection {
    Protected { required_checks: Vec<String> },
    Unprotected,
    Unknown,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CheckState {
    Green { sha: String },
    Stale { sha: String },
    Pending,
    Failed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReviewState {
    Clean { sha: String },
    Inconclusive,
    Blocking,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MergeObservation {
    pub target: String,
    pub deploy_branch: String,
    pub integration_sha: String,
    pub pull_request: Option<u64>,
    pub protection: Protection,
    pub checks: CheckState,
    pub review: ReviewState,
    pub changed_paths: Vec<String>,
    pub human_gate: bool,
    pub forced_push_attempt: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MergeGrant {
    pub pull_request: u64,
    pub command: Vec<String>,
    pub head_sha: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MergeRefusal {
    ProductionDownstream,
    HumanGate,
    BaseUnprotected,
    SensitivePath,
    ChecksNotGreen,
    ReviewUnavailable,
    ReviewStale,
    InvalidHead,
    MissingPullRequest,
    ForcedPush,
    AlreadyMerged,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct MergeLedger {
    merged_pull_requests: BTreeSet<u64>,
}

impl MergeLedger {
    pub fn record_merge(&mut self, pull_request: u64) -> Result<(), MergeRefusal> {
        if self.merged_pull_requests.insert(pull_request) {
            Ok(())
        } else {
            Err(MergeRefusal::AlreadyMerged)
        }
    }
}

pub fn decide_merge(
    observation: &MergeObservation,
    ledger: &MergeLedger,
) -> Result<MergeGrant, MergeRefusal> {
    if observation.target.trim().is_empty()
        || observation.deploy_branch.trim().is_empty()
        || same_branch(&observation.target, &observation.deploy_branch)
    {
        return Err(MergeRefusal::ProductionDownstream);
    }
    if observation.human_gate {
        return Err(MergeRefusal::HumanGate);
    }
    if !is_sha(&observation.integration_sha) {
        return Err(MergeRefusal::InvalidHead);
    }
    let pull_request = observation
        .pull_request
        .ok_or(MergeRefusal::MissingPullRequest)?;
    if ledger.merged_pull_requests.contains(&pull_request) {
        return Err(MergeRefusal::AlreadyMerged);
    }
    if observation.forced_push_attempt {
        return Err(MergeRefusal::ForcedPush);
    }
    match &observation.protection {
        Protection::Protected { required_checks } if !required_checks.is_empty() => {}
        Protection::Protected { .. } | Protection::Unprotected | Protection::Unknown => {
            return Err(MergeRefusal::BaseUnprotected);
        }
    }
    match &observation.checks {
        CheckState::Green { sha } if sha == &observation.integration_sha => {}
        CheckState::Stale { .. } => return Err(MergeRefusal::ReviewStale),
        CheckState::Green { .. } | CheckState::Pending | CheckState::Failed => {
            return Err(MergeRefusal::ChecksNotGreen);
        }
    }
    match &observation.review {
        ReviewState::Clean { sha } if sha == &observation.integration_sha => {}
        ReviewState::Clean { .. } => return Err(MergeRefusal::ReviewStale),
        ReviewState::Inconclusive => return Err(MergeRefusal::ReviewUnavailable),
        ReviewState::Blocking => return Err(MergeRefusal::ReviewUnavailable),
    }
    if observation.changed_paths.iter().any(|path| {
        path.ends_with("package.json")
            || path.ends_with("pnpm-lock.yaml")
            || path.ends_with("package-lock.json")
            || path.ends_with("yarn.lock")
            || path.ends_with("bun.lock")
            || path.ends_with("CODEOWNERS")
            || path.starts_with(".github/")
            || path.starts_with("migrations/")
            || path.contains("/migrations/")
    }) {
        return Err(MergeRefusal::SensitivePath);
    }
    Ok(MergeGrant {
        pull_request,
        command: vec![
            "gh".into(),
            "pr".into(),
            "merge".into(),
            pull_request.to_string(),
            "--merge".into(),
            "--match-head-commit".into(),
            observation.integration_sha.clone(),
        ],
        head_sha: observation.integration_sha.clone(),
    })
}

fn is_sha(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn same_branch(left: &str, right: &str) -> bool {
    let left = branch_identity(left);
    let right = branch_identity(right);
    left == right || left.ends_with(&format!("/{right}")) || right.ends_with(&format!("/{left}"))
}

fn branch_identity(value: &str) -> String {
    let mut identity = value.trim().to_ascii_lowercase();
    for prefix in ["refs/heads/", "refs/remotes/", "remotes/"] {
        if let Some(stripped) = identity.strip_prefix(prefix) {
            identity = stripped.to_owned();
        }
    }
    if let Some(stripped) = identity.strip_prefix("origin/") {
        identity = stripped.to_owned();
    }
    identity
}
