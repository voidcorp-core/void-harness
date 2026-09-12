use std::path::Path;
use std::process::Command;

use void_machine_core::{GitEffectObservation, ObservedCommit, SharedMutation};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SharedRepositorySnapshot {
    pub stash_digest: String,
    pub tags_digest: String,
    pub notes_digest: String,
    pub remotes_digest: String,
    pub config_digest: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GitEffectObservationError {
    CommandFailed(String),
    MalformedRange(String),
}

fn git(root: &Path, args: &[&str]) -> Result<Vec<u8>, GitEffectObservationError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|error| GitEffectObservationError::CommandFailed(error.to_string()))?;
    if !output.status.success() {
        return Err(GitEffectObservationError::CommandFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        ));
    }
    Ok(output.stdout)
}

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{}", void_machine_core::sha256_hex(bytes))
}

pub fn capture_shared_repository(
    root: &Path,
) -> Result<SharedRepositorySnapshot, GitEffectObservationError> {
    Ok(SharedRepositorySnapshot {
        stash_digest: digest(&git(root, &["stash", "list", "--format=%H"])?),
        tags_digest: digest(&git(
            root,
            &[
                "for-each-ref",
                "--format=%(refname) %(objectname)",
                "refs/tags",
            ],
        )?),
        notes_digest: digest(&git(
            root,
            &[
                "for-each-ref",
                "--format=%(refname) %(objectname)",
                "refs/notes",
            ],
        )?),
        remotes_digest: digest(&git(root, &["remote", "-v"])?),
        config_digest: digest(&git(root, &["config", "--local", "--null", "--list"])?),
    })
}

pub fn shared_mutations(
    before: &SharedRepositorySnapshot,
    after: &SharedRepositorySnapshot,
) -> Vec<SharedMutation> {
    let mut mutations = Vec::new();
    if before.stash_digest != after.stash_digest {
        mutations.push(SharedMutation::Stash);
    }
    if before.tags_digest != after.tags_digest {
        mutations.push(SharedMutation::Tag);
    }
    if before.notes_digest != after.notes_digest {
        mutations.push(SharedMutation::Note);
    }
    if before.remotes_digest != after.remotes_digest {
        mutations.push(SharedMutation::Remote);
    }
    if before.config_digest != after.config_digest {
        mutations.push(SharedMutation::RepositoryConfig);
    }
    mutations
}

pub fn observe_commit_range(
    root: &Path,
    base_sha: &str,
    head_sha: &str,
    source_sha: &str,
) -> Result<GitEffectObservation, GitEffectObservationError> {
    let raw_commits = git(
        root,
        &[
            "rev-list",
            "--reverse",
            "--parents",
            &format!("{base_sha}..{head_sha}"),
        ],
    )?;
    let commits = parse_commit_range(&raw_commits, base_sha, head_sha)?;
    let raw_files = git(
        root,
        &["diff", "--name-only", &format!("{base_sha}..{head_sha}")],
    )?;
    let files = String::from_utf8_lossy(&raw_files)
        .lines()
        .filter(|path| !path.is_empty())
        .map(str::to_owned)
        .collect();
    let tree_sha =
        String::from_utf8_lossy(&git(root, &["rev-parse", &format!("{head_sha}^{{tree}}")])?)
            .trim()
            .to_owned();
    Ok(GitEffectObservation {
        base_sha: base_sha.to_owned(),
        head_sha: head_sha.to_owned(),
        tree_sha,
        source_sha: source_sha.to_owned(),
        commits,
        files,
        shared_mutations: Vec::new(),
    })
}

fn parse_commit_range(
    raw: &[u8],
    base_sha: &str,
    head_sha: &str,
) -> Result<Vec<ObservedCommit>, GitEffectObservationError> {
    let text = std::str::from_utf8(raw).map_err(|_| {
        GitEffectObservationError::MalformedRange("git returned non-UTF-8 output".into())
    })?;
    let mut commits = Vec::new();
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let sha = parts.next().unwrap_or_default();
        let parents: Vec<_> = parts.collect();
        if sha.is_empty() || parents.is_empty() || parents.len() > 2 {
            return Err(GitEffectObservationError::MalformedRange(
                "git returned a commit without one or two parents".into(),
            ));
        }
        commits.push(ObservedCommit {
            sha: sha.into(),
            parent: parents[0].into(),
            merge: parents.len() == 2,
        });
    }
    if commits.is_empty() {
        return Err(GitEffectObservationError::MalformedRange(
            "git returned an empty commit range".into(),
        ));
    }
    if commits.first().map(|commit| commit.parent.as_str()) != Some(base_sha)
        || commits.last().map(|commit| commit.sha.as_str()) != Some(head_sha)
    {
        return Err(GitEffectObservationError::MalformedRange(
            "git range does not join the declared base and head".into(),
        ));
    }
    Ok(commits)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(value: &str) -> SharedRepositorySnapshot {
        SharedRepositorySnapshot {
            stash_digest: value.into(),
            tags_digest: value.into(),
            notes_digest: value.into(),
            remotes_digest: value.into(),
            config_digest: value.into(),
        }
    }

    #[test]
    fn shared_snapshot_changes_are_classified_without_exposing_contents() {
        let before = snapshot("a");
        let mut after = snapshot("a");
        after.config_digest = "b".into();
        assert_eq!(
            shared_mutations(&before, &after),
            vec![SharedMutation::RepositoryConfig]
        );
    }

    #[test]
    fn commit_parser_accepts_newest_to_oldest_output_only_when_parent_links_join() {
        let base = "a".repeat(40);
        let head = "c".repeat(40);
        let raw = format!("{} {}\n{} {}\n", "b".repeat(40), base, head, "b".repeat(40));
        let commits = parse_commit_range(raw.as_bytes(), &base, &head).unwrap();
        assert_eq!(commits.len(), 2);
    }

    #[test]
    fn commit_parser_rejects_a_merge_commit() {
        let base = "a".repeat(40);
        let head = "c".repeat(40);
        let raw = format!("{} {} {}\n", head, base, "b".repeat(40));
        let commits = parse_commit_range(raw.as_bytes(), &base, &head).unwrap();
        assert!(commits[0].merge);
    }
}
