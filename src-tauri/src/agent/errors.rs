//! What went wrong with the agent, in a form the chat can act on: a kind
//! (so the right fix can be offered) and a message that names the agent the
//! user actually runs, not always Codex.
//!
//! Agents give no structured error codes for these, so the kind comes from
//! the wording, as it always did; it now lives here, next to the code that
//! produces the errors, and is tested against them.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    /// The plan's limit is used up.
    UsageLimit,
    /// Not signed in.
    LoggedOut,
    /// The account may not use the model that was asked for.
    ModelUnavailable,
    /// The agent process stopped.
    AdapterCrashed,
    /// The agent could not be started at all.
    AdapterMissing,
    /// The agent went quiet and was given up on.
    Timeout,
    Other,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct AgentError {
    pub kind: ErrorKind,
    pub message: String,
}

impl AgentError {
    /// Wraps an error that happened outside the agent (a file, a download).
    pub fn other(message: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::Other,
            message: message.into(),
        }
    }
}

impl From<String> for AgentError {
    fn from(message: String) -> Self {
        Self::other(message)
    }
}

/// Sorts a raw error from the agent (or from talking to it) into a kind and
/// a message for the reader. `agent` is what to call the agent ("Codex").
/// The order matters: "sign in again after your usage limit resets" is a
/// limit, not a login problem.
pub fn classify(raw: &str, agent: &str) -> AgentError {
    let has = |words: &[&str]| {
        let lower = raw.to_lowercase();
        words.iter().any(|w| lower.contains(w))
    };
    let (kind, message) = if has(&["usage limit", "rate limit", "quota", "too many requests"]) {
        (
            ErrorKind::UsageLimit,
            format!("You've hit {agent}'s usage limit. Try again once it resets."),
        )
    } else if has(&["stopped responding"]) {
        (
            ErrorKind::Timeout,
            format!(
                "{agent} stopped responding, so Yomu gave up on this answer. Retry starts a fresh session."
            ),
        )
    } else if has(&[
        "model is not supported",
        "model is not available",
        "not supported when using",
    ]) {
        (
            ErrorKind::ModelUnavailable,
            format!("{agent} can't use the model that was picked on your plan. Choose another one below, or use Auto."),
        )
    } else if has(&[
        "unauthorized",
        "unauthorised",
        "not logged in",
        "log in",
        "login",
        "sign in",
        "authenticat",
    ]) {
        (
            ErrorKind::LoggedOut,
            format!("{agent} isn't signed in. Sign in to continue."),
        )
    } else if has(&["exited", "closed before responding", "broken pipe"]) {
        (
            ErrorKind::AdapterCrashed,
            format!("{agent} stopped unexpectedly. Retry restarts it."),
        )
    } else if has(&[
        "could not start",
        "not available",
        "no such file",
        "not found",
    ]) {
        (
            ErrorKind::AdapterMissing,
            format!("Couldn't start {agent}. Check that it is installed (the Codex adapter also needs Node.js)."),
        )
    } else {
        (ErrorKind::Other, raw.to_string())
    };
    AgentError { kind, message }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kind(raw: &str) -> ErrorKind {
        classify(raw, "Codex").kind
    }

    #[test]
    fn sorts_the_errors_agents_give() {
        assert_eq!(kind("You've hit your usage limit"), ErrorKind::UsageLimit);
        assert_eq!(kind("429 Too Many Requests"), ErrorKind::UsageLimit);
        assert_eq!(kind("not logged in"), ErrorKind::LoggedOut);
        assert_eq!(kind("401 Unauthorized"), ErrorKind::LoggedOut);
        assert_eq!(kind("agent process exited"), ErrorKind::AdapterCrashed);
        assert_eq!(
            kind("agent process closed before responding"),
            ErrorKind::AdapterCrashed
        );
        assert_eq!(
            kind("could not start the agent (`x`, needs Node/npx): No such file"),
            ErrorKind::AdapterMissing
        );
        assert_eq!(kind("something odd happened"), ErrorKind::Other);
    }

    #[test]
    fn a_hung_turn_and_a_refused_model_have_their_own_kinds() {
        assert_eq!(
            kind("The agent stopped responding (nothing for 180 seconds)."),
            ErrorKind::Timeout
        );
        // The exact wording Codex uses when a plan lacks the model.
        assert_eq!(
            kind(
                "The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account."
            ),
            ErrorKind::ModelUnavailable
        );
    }

    #[test]
    fn a_usage_limit_beats_login_wording() {
        assert_eq!(
            kind("usage limit reached, sign in later"),
            ErrorKind::UsageLimit
        );
    }

    #[test]
    fn names_the_agent_in_use() {
        let e = classify("not logged in", "OpenCode");
        assert!(e.message.starts_with("OpenCode isn't signed in"));
        let e = classify("agent process exited", "my-agent");
        assert!(e.message.contains("my-agent"));
    }

    #[test]
    fn what_it_cannot_sort_is_passed_through_untouched() {
        let e = classify("weird", "Codex");
        assert_eq!((e.kind, e.message.as_str()), (ErrorKind::Other, "weird"));
    }

    #[test]
    fn serializes_for_the_frontend() {
        let json = serde_json::to_value(classify("not logged in", "Codex")).unwrap();
        assert_eq!(json["kind"], "logged_out");
        assert!(json["message"].is_string());
    }
}
