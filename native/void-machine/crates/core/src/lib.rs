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
}
