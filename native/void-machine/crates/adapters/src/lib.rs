use std::fmt::Write;
use std::fs;
use std::path::Path;

use void_machine_core::{sha256_hex, DoctorReport, Finding, Health, SkillFinding, SkillReport};
use void_machine_host::inspect;

pub fn doctor(cwd: &Path) -> DoctorReport {
    let mut report = inspect(cwd);
    let Some(repository) = report.repository.as_deref() else {
        return report;
    };
    let root = Path::new(repository);
    let mut findings = report.findings;
    inspect_machine_files(root, &mut findings);
    report.findings = findings;
    report.health = if report
        .findings
        .iter()
        .any(|finding| finding.severity == Health::Blocked)
    {
        Health::Blocked
    } else if report
        .findings
        .iter()
        .any(|finding| finding.severity == Health::Degraded)
    {
        Health::Degraded
    } else {
        Health::Healthy
    };
    report
}

fn inspect_machine_files(root: &Path, findings: &mut Vec<Finding>) {
    let config = root.join(".void").join("machine.toml");
    if let Ok(contents) = fs::read_to_string(&config) {
        if !valid_machine_toml(&contents) {
            findings.push(Finding {
                code: "machine.config.malformed".into(),
                severity: Health::Degraded,
                problem: "machine.toml is malformed".into(),
                cause: "The native doctor cannot safely interpret its declared settings".into(),
                repair: "void-harness machine config --reset".into(),
            });
        }
    } else if config.exists() {
        findings.push(Finding {
            code: "machine.config.unreadable".into(),
            severity: Health::Blocked,
            problem: "machine.toml cannot be read".into(),
            cause: "The file exists but its contents are unavailable".into(),
            repair: "chmod u+r .void/machine.toml".into(),
        });
    }

    let lock = root.join(".void").join("machine.lock.json");
    if let Ok(contents) = fs::read_to_string(&lock) {
        if !valid_machine_lock(&contents) {
            findings.push(Finding {
                code: "machine.lock.malformed".into(),
                severity: Health::Degraded,
                problem: "machine.lock.json is malformed".into(),
                cause: "The native doctor cannot verify the recorded machine state".into(),
                repair: "void-harness machine lock --repair".into(),
            });
        }
    } else if lock.exists() {
        findings.push(Finding {
            code: "machine.lock.unreadable".into(),
            severity: Health::Blocked,
            problem: "machine.lock.json cannot be read".into(),
            cause: "The file exists but its contents are unavailable".into(),
            repair: "chmod u+r .void/machine.lock.json".into(),
        });
    }
}

fn valid_machine_toml(contents: &str) -> bool {
    contents
        .lines()
        .filter(|line| !line.trim().is_empty() && !line.trim_start().starts_with('#'))
        .all(|line| {
            let Some((key, value)) = line.split_once('=') else {
                return false;
            };
            let key = key.trim();
            let value = value.trim();
            matches!(key, "schema_version" | "state_dir" | "cache_dir") && !value.is_empty()
        })
}

fn valid_machine_lock(contents: &str) -> bool {
    let compact: String = contents
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect();
    compact.starts_with('{') && compact.ends_with('}') && compact.contains("\"schemaVersion\":1")
}

pub fn render_json(report: &DoctorReport) -> String {
    let mut output = String::from("{\"schemaVersion\":");
    let _ = write!(
        output,
        "{},\"health\":\"{}\"",
        report.schema_version,
        report.health.as_str()
    );
    write_optional(&mut output, "repository", report.repository.as_deref());
    write_optional(
        &mut output,
        "gitCommonDirectory",
        report.git_common_directory.as_deref(),
    );
    write_optional(
        &mut output,
        "stateDirectory",
        report.state_directory.as_deref(),
    );
    write_optional(
        &mut output,
        "cacheDirectory",
        report.cache_directory.as_deref(),
    );
    output.push_str(",\"findings\":[");
    for (index, finding) in report.findings.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        output.push_str("{\"code\":");
        write_json_string(&mut output, &finding.code);
        output.push_str(",\"severity\":");
        write_json_string(&mut output, finding.severity.as_str());
        output.push_str(",\"problem\":");
        write_json_string(&mut output, &finding.problem);
        output.push_str(",\"cause\":");
        write_json_string(&mut output, &finding.cause);
        output.push_str(",\"repair\":");
        write_json_string(&mut output, &finding.repair);
        output.push('}');
    }
    output.push_str("]}");
    output
}

pub fn check_skill(path: &Path) -> SkillReport {
    let mut findings = Vec::new();
    let mut files = Vec::new();
    if !path.is_dir()
        || fs::symlink_metadata(path)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(true)
    {
        findings.push(skill_finding(
            "skill.path.invalid",
            "Skill package path is not a real directory",
        ));
        return skill_report(files, findings, None, None);
    }
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(_) => {
            findings.push(skill_finding(
                "skill.path.unreadable",
                "Skill package directory cannot be read",
            ));
            return skill_report(files, findings, None, None);
        }
    };
    let mut contents: Vec<(String, Vec<u8>)> = Vec::new();
    for entry in entries.flatten() {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.file_type().map(|t| t.is_symlink()).unwrap_or(true) {
            findings.push(skill_finding(
                "skill.path.symlink",
                "Skill packages cannot contain symlinks",
            ));
            continue;
        }
        if !matches!(name.as_str(), "SKILL.md" | "harness.yaml") || !safe_relative_path(&name) {
            findings.push(skill_finding(
                "skill.path.unknown-entry",
                "Skill package contains an unsupported entry",
            ));
            continue;
        }
        match fs::read(&entry_path) {
            Ok(bytes) => {
                files.push(name.clone());
                contents.push((name, bytes));
            }
            Err(_) => findings.push(skill_finding(
                "skill.file.unreadable",
                "Skill package file cannot be read",
            )),
        }
    }
    files.sort();
    let skill = contents
        .iter()
        .find(|(name, _)| name == "SKILL.md")
        .map(|(_, bytes)| bytes);
    let manifest = contents
        .iter()
        .find(|(name, _)| name == "harness.yaml")
        .map(|(_, bytes)| bytes);
    if skill.is_none() || manifest.is_none() {
        findings.push(skill_finding(
            "skill.package.incomplete",
            "SKILL.md and harness.yaml must be present together",
        ));
    }
    let mut package_id = None;
    let mut manifest_digest = None;
    if let Some(bytes) = manifest {
        manifest_digest = Some(sha256_hex(bytes));
        parse_manifest(bytes, &mut findings);
    }
    if let (Some(skill), Some(manifest)) = (skill, manifest) {
        let mut canonical = Vec::new();
        for (name, bytes) in [
            ("SKILL.md", skill.as_slice()),
            ("harness.yaml", manifest.as_slice()),
        ] {
            canonical.extend_from_slice(name.as_bytes());
            canonical.push(b'\n');
            canonical.extend_from_slice(bytes.len().to_string().as_bytes());
            canonical.push(b'\n');
            canonical.extend_from_slice(bytes);
        }
        package_id = Some(sha256_hex(&canonical));
    }
    skill_report(files, findings, package_id, manifest_digest)
}

fn skill_report(
    files: Vec<String>,
    findings: Vec<SkillFinding>,
    package_id: Option<String>,
    manifest_digest: Option<String>,
) -> SkillReport {
    SkillReport {
        schema_version: 1,
        valid: findings.is_empty() && package_id.is_some(),
        package_id,
        manifest_digest,
        files,
        findings,
    }
}

fn skill_finding(code: &str, problem: &str) -> SkillFinding {
    SkillFinding {
        code: code.into(),
        problem: problem.into(),
        repair: "Fix the package and run void-machine skill check again".into(),
    }
}

fn safe_relative_path(path: &str) -> bool {
    !path.is_empty()
        && !path.starts_with('/')
        && !path.contains('\\')
        && !path.split('/').any(|part| part == ".." || part.is_empty())
}

fn parse_manifest(bytes: &[u8], findings: &mut Vec<SkillFinding>) {
    let Ok(contents) = std::str::from_utf8(bytes) else {
        findings.push(skill_finding(
            "skill.manifest.encoding",
            "harness.yaml must be valid UTF-8",
        ));
        return;
    };
    let allowed = [
        "schemaVersion",
        "kind",
        "name",
        "version",
        "capabilities",
        "inputs",
        "outputs",
        "permissions",
        "successCriteria",
    ];
    let mut seen = Vec::new();
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((key, value)) = trimmed.split_once(':') else {
            findings.push(skill_finding(
                "skill.manifest.malformed",
                "harness.yaml contains an invalid field",
            ));
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        if !allowed.contains(&key) {
            findings.push(skill_finding(
                "skill.schema.unknown-field",
                "harness.yaml contains an unknown field",
            ));
        }
        if seen.contains(&key) {
            findings.push(skill_finding(
                "skill.schema.duplicate-field",
                "harness.yaml contains a duplicate field",
            ));
        }
        seen.push(key);
        if value.is_empty() {
            findings.push(skill_finding(
                "skill.manifest.malformed",
                "harness.yaml contains an empty field",
            ));
        }
        if key == "capabilities" {
            validate_list(
                value,
                &["read"],
                "skill.contract.incompatible-capability",
                findings,
            );
        }
        if key == "permissions" {
            validate_list(
                value,
                &["none"],
                "skill.contract.unsafe-permission",
                findings,
            );
        }
    }
    for required in [
        "schemaVersion",
        "kind",
        "name",
        "version",
        "capabilities",
        "inputs",
        "outputs",
        "permissions",
        "successCriteria",
    ] {
        if !seen.contains(&required) {
            findings.push(skill_finding(
                "skill.schema.missing-field",
                "harness.yaml is missing a required field",
            ));
        }
    }
}

fn validate_list(value: &str, allowed: &[&str], code: &str, findings: &mut Vec<SkillFinding>) {
    let Some(items) = value
        .strip_prefix('[')
        .and_then(|item| item.strip_suffix(']'))
    else {
        findings.push(skill_finding(
            "skill.manifest.malformed",
            "contract lists must use bracket notation",
        ));
        return;
    };
    for item in items
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
    {
        let normalized = item.trim_matches('"');
        if !allowed.contains(&normalized) {
            findings.push(skill_finding(
                code,
                "skill package requests an incompatible contract",
            ));
        }
    }
}

pub fn render_skill_json(report: &SkillReport) -> String {
    let mut output = format!("{{\"schemaVersion\":1,\"valid\":{}", report.valid);
    output.push_str(",\"packageId\":");
    write_skill_optional(&mut output, report.package_id.as_deref());
    output.push_str(",\"manifestDigest\":");
    write_skill_optional(&mut output, report.manifest_digest.as_deref());
    output.push_str(",\"files\":[");
    for (index, file) in report.files.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        write_json_string(&mut output, file);
    }
    output.push_str("],\"findings\":[");
    for (index, finding) in report.findings.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        output.push_str("{\"code\":");
        write_json_string(&mut output, &finding.code);
        output.push_str(",\"problem\":");
        write_json_string(&mut output, &finding.problem);
        output.push_str(",\"repair\":");
        write_json_string(&mut output, &finding.repair);
        output.push('}');
    }
    output.push_str("]}");
    output
}

fn write_skill_optional(output: &mut String, value: Option<&str>) {
    match value {
        Some(value) => write_json_string(output, value),
        None => output.push_str("null"),
    }
}

fn write_optional(output: &mut String, key: &str, value: Option<&str>) {
    output.push(',');
    write_json_string(output, key);
    output.push(':');
    match value {
        Some(value) => write_json_string(output, value),
        None => output.push_str("null"),
    }
}

fn write_json_string(output: &mut String, value: &str) {
    output.push('"');
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            character if character.is_control() => {
                let _ = write!(output, "\\u{:04x}", character as u32);
            }
            character => output.push(character),
        }
    }
    output.push('"');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_machine_lock_is_rejected() {
        assert!(!valid_machine_lock("{}"));
        assert!(valid_machine_lock("{ \"schemaVersion\": 1 }"));
    }

    #[test]
    fn json_output_escapes_strings() {
        let report = DoctorReport::from_findings(
            None,
            None,
            None,
            None,
            vec![Finding {
                code: "test".into(),
                severity: Health::Degraded,
                problem: "quote \"here\"".into(),
                cause: "line\nbreak".into(),
                repair: "true".into(),
            }],
        );
        let json = render_json(&report);
        assert!(json.contains("quote \\\"here\\\""));
        assert!(json.contains("line\\nbreak"));
    }

    #[test]
    fn read_only_fixture_has_stable_identity() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/read-only-skill");
        let report = check_skill(&path);
        assert!(report.valid);
        assert_eq!(report.files, vec!["SKILL.md", "harness.yaml"]);
        assert_eq!(report.package_id.as_ref().map(String::len), Some(64));
        assert_eq!(report.manifest_digest.as_ref().map(String::len), Some(64));
    }

    #[test]
    fn unknown_manifest_field_fails_before_execution() {
        let path = std::env::temp_dir().join("void-machine-invalid-skill");
        let _ = fs::create_dir_all(&path);
        fs::write(path.join("SKILL.md"), "# fixture\n").expect("write skill");
        fs::write(
            path.join("harness.yaml"),
            "schemaVersion: 1\nunknown: true\n",
        )
        .expect("write manifest");
        let report = check_skill(&path);
        assert!(!report.valid);
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.code == "skill.schema.unknown-field"));
        let _ = fs::remove_dir_all(path);
    }
}
