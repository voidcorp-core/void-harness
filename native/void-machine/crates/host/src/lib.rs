use std::path::{Path, PathBuf};
use std::process::Command;

use void_machine_core::{DoctorReport, Finding, Health};

pub mod git_effect;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RepositoryPaths {
    pub root: PathBuf,
    pub common_directory: PathBuf,
}

pub fn resolve_repository(cwd: &Path) -> Result<RepositoryPaths, Finding> {
    let root = git_value(cwd, &["rev-parse", "--show-toplevel"])
        .map(PathBuf::from)
        .ok_or_else(|| Finding {
            code: "git.missing".into(),
            severity: Health::Blocked,
            problem: "Git repository not found".into(),
            cause: "The current directory is outside a Git worktree".into(),
            repair: "git init".into(),
        })?;
    let common_directory = git_value(&root, &["rev-parse", "--git-common-dir"])
        .map(|value| {
            let path = PathBuf::from(value);
            if path.is_absolute() {
                path
            } else {
                root.join(path)
            }
        })
        .unwrap_or_else(|| root.join(".git"));
    Ok(RepositoryPaths {
        root,
        common_directory,
    })
}

pub fn inspect(cwd: &Path) -> DoctorReport {
    match resolve_repository(cwd) {
        Ok(paths) => {
            let state = paths.root.join(".void").join("machine");
            let cache = machine_cache_directory(&paths.root);
            DoctorReport::from_findings(
                Some(paths.root.display().to_string()),
                Some(paths.common_directory.display().to_string()),
                Some(state.display().to_string()),
                Some(cache.display().to_string()),
                Vec::new(),
            )
        }
        Err(finding) => DoctorReport::from_findings(None, None, None, None, vec![finding]),
    }
}

fn git_value(cwd: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8(output.stdout).ok()?.trim().to_owned();
    (!value.is_empty()).then_some(value)
}

fn machine_cache_directory(root: &Path) -> PathBuf {
    if let Some(value) = std::env::var_os("XDG_CACHE_HOME") {
        return PathBuf::from(value).join("void-machine");
    }
    if let Some(value) = std::env::var_os("HOME") {
        return PathBuf::from(value).join(".cache").join("void-machine");
    }
    root.join(".void").join("machine").join("cache")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_git_is_blocked_without_writing() {
        let report = inspect(Path::new("/tmp"));
        assert_eq!(report.health, Health::Blocked);
        assert_eq!(report.findings[0].code, "git.missing");
    }
}
