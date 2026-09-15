use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WorkerOutcome {
    Completed,
    Blocked,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReviewProvenance {
    Panel,
    SelfReview,
    None,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClusterLane {
    Parallel,
    Sequential,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClusterTicket {
    pub id: String,
    pub declared_files: Vec<String>,
    pub lane: ClusterLane,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkerReport {
    pub ticket_id: String,
    pub outcome: WorkerOutcome,
    pub observed_files: Vec<String>,
    pub review: ReviewProvenance,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClusterIntegration {
    pub tickets: Vec<String>,
    pub files: Vec<String>,
    pub review: BTreeMap<String, ReviewProvenance>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClusterError {
    MissingWorker(String),
    UnexpectedWorker(String),
    UndeclaredWidening { ticket_id: String, file: String },
    MissingReview(String),
    NoObservedFiles(String),
    DuplicateWorker(String),
    NoIntegrableTickets,
    AlreadyAccepted(String),
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ReconciliationLedger {
    accepted: BTreeSet<String>,
}

impl ReconciliationLedger {
    pub fn accept(&mut self, ticket_id: &str) -> Result<(), ClusterError> {
        if self.accepted.insert(ticket_id.to_owned()) {
            Ok(())
        } else {
            Err(ClusterError::AlreadyAccepted(ticket_id.to_owned()))
        }
    }

    pub fn contains(&self, ticket_id: &str) -> bool {
        self.accepted.contains(ticket_id)
    }
}

pub fn reconcile_cluster(
    tickets: &[ClusterTicket],
    reports: &[WorkerReport],
) -> Result<ClusterIntegration, ClusterError> {
    let expected = tickets
        .iter()
        .map(|ticket| ticket.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut by_id = BTreeMap::new();
    for report in reports {
        if !expected.contains(report.ticket_id.as_str()) {
            return Err(ClusterError::UnexpectedWorker(report.ticket_id.clone()));
        }
        if by_id.insert(report.ticket_id.as_str(), report).is_some() {
            return Err(ClusterError::DuplicateWorker(report.ticket_id.clone()));
        }
    }

    let declared = tickets
        .iter()
        .flat_map(|ticket| {
            ticket
                .declared_files
                .iter()
                .map(move |file| (ticket.id.as_str(), file.as_str()))
        })
        .collect::<Vec<_>>();
    let mut integrable = Vec::new();
    let mut files = BTreeSet::new();
    let mut review = BTreeMap::new();
    for ticket in tickets {
        let report = by_id
            .get(ticket.id.as_str())
            .ok_or_else(|| ClusterError::MissingWorker(ticket.id.clone()))?;
        if report.outcome != WorkerOutcome::Completed {
            continue;
        }
        if report.review == ReviewProvenance::None {
            return Err(ClusterError::MissingReview(ticket.id.clone()));
        }
        if report.observed_files.is_empty() {
            return Err(ClusterError::NoObservedFiles(ticket.id.clone()));
        }
        for file in &report.observed_files {
            let owned_by_other = declared.iter().any(|(owner, declared_file)| {
                *owner != ticket.id.as_str()
                    && *declared_file == file.as_str()
                    && !tickets.iter().any(|other| {
                        other.id == *owner
                            && other.lane == ClusterLane::Sequential
                            && ticket.lane == ClusterLane::Sequential
                    })
            });
            if owned_by_other {
                return Err(ClusterError::UndeclaredWidening {
                    ticket_id: ticket.id.clone(),
                    file: file.clone(),
                });
            }
            files.insert(file.clone());
        }
        integrable.push(ticket.id.clone());
        review.insert(ticket.id.clone(), report.review.clone());
    }
    if integrable.is_empty() {
        return Err(ClusterError::NoIntegrableTickets);
    }
    Ok(ClusterIntegration {
        tickets: integrable,
        files: files.into_iter().collect(),
        review,
    })
}
