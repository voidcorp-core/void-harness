#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Health {
    Healthy,
    Degraded,
    Blocked,
}

impl Health {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Healthy => "healthy",
            Self::Degraded => "degraded",
            Self::Blocked => "blocked",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Finding {
    pub code: String,
    pub severity: Health,
    pub problem: String,
    pub cause: String,
    pub repair: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DoctorReport {
    pub schema_version: u32,
    pub health: Health,
    pub repository: Option<String>,
    pub git_common_directory: Option<String>,
    pub state_directory: Option<String>,
    pub cache_directory: Option<String>,
    pub findings: Vec<Finding>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SkillFinding {
    pub code: String,
    pub problem: String,
    pub repair: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SkillReport {
    pub schema_version: u32,
    pub valid: bool,
    pub package_id: Option<String>,
    pub manifest_digest: Option<String>,
    pub files: Vec<String>,
    pub findings: Vec<SkillFinding>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GitEffectRequest {
    pub run_id: String,
    pub unit_id: String,
    pub revision: u64,
    pub ordinal: u32,
    pub declared_files: Vec<String>,
    pub payload: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ObservedCommit {
    pub sha: String,
    pub parent: String,
    pub merge: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SharedMutation {
    Stash,
    Tag,
    Note,
    Remote,
    RepositoryConfig,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GitEffectObservation {
    pub base_sha: String,
    pub head_sha: String,
    pub tree_sha: String,
    pub source_sha: String,
    pub commits: Vec<ObservedCommit>,
    pub files: Vec<String>,
    pub shared_mutations: Vec<SharedMutation>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GitEffectProof {
    pub effect_id: String,
    pub base_sha: String,
    pub head_sha: String,
    pub tree_sha: String,
    pub source_sha: String,
    pub files: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GitEffectState {
    Pending {
        request: GitEffectRequest,
    },
    Claimed {
        request: GitEffectRequest,
        fence: u64,
    },
    Applied {
        request: GitEffectRequest,
        fence: u64,
        proof: GitEffectProof,
    },
    Ambiguous {
        request: GitEffectRequest,
        fence: u64,
        detail: String,
    },
}

impl GitEffectState {
    pub fn pending(request: GitEffectRequest) -> Self {
        Self::Pending { request }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GitEffectError {
    InvalidRequest(String),
    InvalidObservation(String),
    InvalidFence,
    StaleFence,
    NotClaimed,
    Ambiguous(String),
}

fn non_empty(value: &str, field: &str) -> Result<(), GitEffectError> {
    if value.is_empty() {
        return Err(GitEffectError::InvalidRequest(format!(
            "{field} is required"
        )));
    }
    Ok(())
}

fn valid_sha(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn canonical_part(value: &str) -> String {
    format!("{}:{value}", value.len())
}

fn validate_request(request: &GitEffectRequest) -> Result<(), GitEffectError> {
    non_empty(&request.run_id, "run_id")?;
    non_empty(&request.unit_id, "unit_id")?;
    non_empty(&request.payload, "payload")?;
    if request.declared_files.iter().any(String::is_empty) {
        return Err(GitEffectError::InvalidRequest(
            "declared_files cannot contain an empty path".into(),
        ));
    }
    Ok(())
}

pub fn effect_id(request: &GitEffectRequest) -> String {
    let mut files = request.declared_files.clone();
    files.sort();
    let files = files
        .iter()
        .map(|file| canonical_part(file))
        .collect::<Vec<_>>()
        .join("\n");
    let canonical = [
        canonical_part(&request.run_id),
        canonical_part(&request.unit_id),
        request.revision.to_string(),
        request.ordinal.to_string(),
        canonical_part(&request.payload),
        files,
    ]
    .join("\n");
    format!("effect-v1:sha256:{}", sha256_hex(canonical.as_bytes()))
}

pub fn claim_git_effect(state: &mut GitEffectState, fence: u64) -> Result<(), GitEffectError> {
    if fence == 0 {
        return Err(GitEffectError::InvalidFence);
    }
    match state {
        GitEffectState::Pending { request } => {
            validate_request(request)?;
            let request = request.clone();
            *state = GitEffectState::Claimed { request, fence };
            Ok(())
        }
        GitEffectState::Claimed { fence: current, .. }
        | GitEffectState::Applied { fence: current, .. }
            if *current == fence =>
        {
            Ok(())
        }
        GitEffectState::Claimed { .. } | GitEffectState::Applied { .. } => {
            Err(GitEffectError::StaleFence)
        }
        GitEffectState::Ambiguous { detail, .. } => Err(GitEffectError::Ambiguous(detail.clone())),
    }
}

fn validate_observation(
    request: &GitEffectRequest,
    observation: &GitEffectObservation,
) -> Result<(), GitEffectError> {
    for (field, value) in [
        ("base_sha", &observation.base_sha),
        ("head_sha", &observation.head_sha),
        ("tree_sha", &observation.tree_sha),
        ("source_sha", &observation.source_sha),
    ] {
        if !valid_sha(value) {
            return Err(GitEffectError::InvalidObservation(format!(
                "{field} must be a full commit id"
            )));
        }
    }
    if observation.commits.is_empty() || observation.base_sha == observation.head_sha {
        return Err(GitEffectError::InvalidObservation(
            "commit range is empty".into(),
        ));
    }
    let mut previous = observation.base_sha.clone();
    let mut seen = std::collections::HashSet::new();
    for commit in &observation.commits {
        if commit.merge {
            return Err(GitEffectError::InvalidObservation(
                "commit range contains a merge".into(),
            ));
        }
        if !valid_sha(&commit.sha) || !valid_sha(&commit.parent) {
            return Err(GitEffectError::InvalidObservation(
                "commit range contains an invalid commit id".into(),
            ));
        }
        if !seen.insert(commit.sha.as_str()) {
            return Err(GitEffectError::InvalidObservation(
                "commit range contains a duplicate commit".into(),
            ));
        }
        if commit.parent != previous {
            return Err(GitEffectError::InvalidObservation(
                "commit range is not a single chain from base to head".into(),
            ));
        }
        previous = commit.sha.clone();
    }
    if previous != observation.head_sha {
        return Err(GitEffectError::InvalidObservation(
            "commit range does not end at head".into(),
        ));
    }
    let mut expected = request.declared_files.clone();
    let mut observed = observation.files.clone();
    expected.sort();
    observed.sort();
    if expected != observed {
        return Err(GitEffectError::InvalidObservation(
            "observed files differ from the declared footprint".into(),
        ));
    }
    if let Some(mutation) = observation.shared_mutations.first() {
        return Err(GitEffectError::InvalidObservation(format!(
            "shared repository mutation is forbidden: {mutation:?}"
        )));
    }
    Ok(())
}

pub fn apply_git_effect(
    state: &mut GitEffectState,
    fence: u64,
    observation: GitEffectObservation,
) -> Result<GitEffectProof, GitEffectError> {
    if fence == 0 {
        return Err(GitEffectError::InvalidFence);
    }
    match state {
        GitEffectState::Applied {
            fence: current,
            proof,
            ..
        } if *current == fence => Ok(proof.clone()),
        GitEffectState::Applied { .. } => Err(GitEffectError::StaleFence),
        GitEffectState::Claimed {
            request,
            fence: current,
        } if *current == fence => {
            validate_observation(request, &observation)?;
            let proof = GitEffectProof {
                effect_id: effect_id(request),
                base_sha: observation.base_sha,
                head_sha: observation.head_sha,
                tree_sha: observation.tree_sha,
                source_sha: observation.source_sha,
                files: observation.files,
            };
            let request = request.clone();
            *state = GitEffectState::Applied {
                request,
                fence,
                proof: proof.clone(),
            };
            Ok(proof)
        }
        GitEffectState::Claimed { .. } => Err(GitEffectError::StaleFence),
        GitEffectState::Pending { .. } => Err(GitEffectError::NotClaimed),
        GitEffectState::Ambiguous { detail, .. } => Err(GitEffectError::Ambiguous(detail.clone())),
    }
}

pub fn mark_git_effect_ambiguous(
    state: &mut GitEffectState,
    fence: u64,
    detail: &str,
) -> Result<(), GitEffectError> {
    if fence == 0 {
        return Err(GitEffectError::InvalidFence);
    }
    if detail.is_empty() {
        return Err(GitEffectError::InvalidObservation(
            "ambiguous effect requires a detail".into(),
        ));
    }
    match state {
        GitEffectState::Claimed {
            request,
            fence: current,
        } if *current == fence => {
            let request = request.clone();
            *state = GitEffectState::Ambiguous {
                request,
                fence,
                detail: detail.into(),
            };
            Ok(())
        }
        GitEffectState::Claimed { .. } => Err(GitEffectError::StaleFence),
        GitEffectState::Ambiguous { detail, .. } => Err(GitEffectError::Ambiguous(detail.clone())),
        GitEffectState::Pending { .. } => Err(GitEffectError::NotClaimed),
        GitEffectState::Applied { .. } => Err(GitEffectError::InvalidObservation(
            "an applied effect cannot become ambiguous".into(),
        )),
    }
}

pub fn sha256_hex(input: &[u8]) -> String {
    let mut state = [
        0x6a09e667u32,
        0xbb67ae85,
        0x3c6ef372,
        0xa54ff53a,
        0x510e527f,
        0x9b05688c,
        0x1f83d9ab,
        0x5be0cd19,
    ];
    let bit_len = (input.len() as u64) * 8;
    let mut data = input.to_vec();
    data.push(0x80);
    while data.len() % 64 != 56 {
        data.push(0);
    }
    data.extend_from_slice(&bit_len.to_be_bytes());
    for block_index in 0..data.len() / 64 {
        let block = &data[block_index * 64..(block_index + 1) * 64];
        let mut words = [0u32; 64];
        for (index, word) in words.iter_mut().enumerate().take(16) {
            let offset = index * 4;
            *word = u32::from_be_bytes([
                block[offset],
                block[offset + 1],
                block[offset + 2],
                block[offset + 3],
            ]);
        }
        for index in 16..64 {
            let s0 = words[index - 15].rotate_right(7)
                ^ words[index - 15].rotate_right(18)
                ^ (words[index - 15] >> 3);
            let s1 = words[index - 2].rotate_right(17)
                ^ words[index - 2].rotate_right(19)
                ^ (words[index - 2] >> 10);
            words[index] = words[index - 16]
                .wrapping_add(s0)
                .wrapping_add(words[index - 7])
                .wrapping_add(s1);
        }
        let constants = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
            0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
            0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
            0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
            0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
            0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
            0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
            0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
            0xc67178f2,
        ];
        let mut working = state;
        for index in 0..64 {
            let s1 = working[4].rotate_right(6)
                ^ working[4].rotate_right(11)
                ^ working[4].rotate_right(25);
            let choice = (working[4] & working[5]) ^ ((!working[4]) & working[6]);
            let temp1 = working[7]
                .wrapping_add(s1)
                .wrapping_add(choice)
                .wrapping_add(constants[index])
                .wrapping_add(words[index]);
            let s0 = working[0].rotate_right(2)
                ^ working[0].rotate_right(13)
                ^ working[0].rotate_right(22);
            let majority =
                (working[0] & working[1]) ^ (working[0] & working[2]) ^ (working[1] & working[2]);
            let temp2 = s0.wrapping_add(majority);
            working = [
                temp1.wrapping_add(temp2),
                working[0],
                working[1],
                working[2],
                working[3].wrapping_add(temp1),
                working[4],
                working[5],
                working[6],
            ];
        }
        for index in 0..8 {
            state[index] = state[index].wrapping_add(working[index]);
        }
    }
    state.iter().map(|word| format!("{word:08x}")).collect()
}

impl DoctorReport {
    pub fn from_findings(
        repository: Option<String>,
        git_common_directory: Option<String>,
        state_directory: Option<String>,
        cache_directory: Option<String>,
        findings: Vec<Finding>,
    ) -> Self {
        let health = if findings
            .iter()
            .any(|finding| finding.severity == Health::Blocked)
        {
            Health::Blocked
        } else if findings
            .iter()
            .any(|finding| finding.severity == Health::Degraded)
        {
            Health::Degraded
        } else {
            Health::Healthy
        };
        Self {
            schema_version: 1,
            health,
            repository,
            git_common_directory,
            state_directory,
            cache_directory,
            findings,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn severity_is_blocked_when_any_finding_is_blocked() {
        let report = DoctorReport::from_findings(
            None,
            None,
            None,
            None,
            vec![Finding {
                code: "git.missing".into(),
                severity: Health::Blocked,
                problem: "Git is unavailable".into(),
                cause: "The project is not a Git repository".into(),
                repair: "git init".into(),
            }],
        );
        assert_eq!(report.health, Health::Blocked);
    }

    #[test]
    fn sha256_matches_known_vector() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
