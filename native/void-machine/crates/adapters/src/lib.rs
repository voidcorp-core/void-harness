use std::fmt::Write;
use std::fs;
use std::path::Path;

use void_machine_core::{DoctorReport, Finding, Health};
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
}
