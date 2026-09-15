use std::env;
use std::path::Path;
use std::process::ExitCode;

use void_machine_adapters::{check_skill, doctor, render_json, render_skill_json};
use void_machine_core::Health;

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("skill") {
        return skill_command(&args);
    }
    if args.first().map(String::as_str) != Some("doctor") {
        eprintln!("usage: void-machine doctor [--json] | skill check <path> --json");
        return ExitCode::from(2);
    }
    let json = args.iter().any(|argument| argument == "--json");
    if args
        .iter()
        .any(|argument| argument.starts_with('-') && argument != "--json")
    {
        eprintln!("usage: void-machine doctor [--json]");
        return ExitCode::from(2);
    }
    let report = doctor(Path::new("."));
    if json {
        println!("{}", render_json(&report));
    } else {
        println!("void-machine doctor: {}", report.health.as_str());
        for finding in &report.findings {
            println!(
                "{}: {}. Cause: {}. Repair: {}.",
                finding.code, finding.problem, finding.cause, finding.repair
            );
        }
    }
    match report.health {
        Health::Healthy => ExitCode::SUCCESS,
        Health::Degraded | Health::Blocked => ExitCode::from(1),
    }
}

fn skill_command(args: &[String]) -> ExitCode {
    if args.len() != 4 || args[1] != "check" || args[3] != "--json" {
        eprintln!("usage: void-machine skill check <path> --json");
        return ExitCode::from(2);
    }
    let report = check_skill(Path::new(&args[2]));
    println!("{}", render_skill_json(&report));
    if report.valid {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(1)
    }
}
