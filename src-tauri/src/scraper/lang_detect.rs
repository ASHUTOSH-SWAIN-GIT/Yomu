//! Heuristic code language detection for code blocks that don't declare a
//! `language-xxx` class. This is a set of hand written signatures rather
//! than a full classifier (e.g. highlight.js's auto detect) — good enough
//! to label the common languages seen in technical docs, revisit if it
//! misfires often in practice.

use once_cell::sync::Lazy;
use regex::Regex;

// Ordered roughly from most to least distinctive. The first match wins.
const RAW_SIGNATURES: &[(&str, &str)] = &[
    (
        "yaml",
        r"(?m)^(apiVersion|kind):\s|^[\w.-]+:\s*$|^\s*-\s+\w",
    ),
    ("json", r#"^\s*[\[{][\s\S]*["'\w]+\s*:\s*"#),
    (
        "bash",
        r"(?m)^\s*#!.*\b(bash|sh)\b|^\s*\$\s+\w|^\s*(npm|cargo|git|docker|kubectl)\s",
    ),
    (
        "dockerfile",
        r"(?m)^\s*(FROM|RUN|COPY|WORKDIR|ENTRYPOINT|CMD)\s",
    ),
    (
        "python",
        r"(?m)^\s*(def|class)\s+\w+.*:\s*$|^\s*import\s+\w+|^\s*from\s+\w+\s+import",
    ),
    ("rust", r"\bfn\s+\w+\s*\(|::<|\blet\s+mut\b|\bimpl\s+\w"),
    ("go", r"\bfunc\s+\w+\s*\(|\bpackage\s+main\b"),
    (
        "typescript",
        r"\binterface\s+\w+|:\s*(string|number|boolean)\b|\bexport\s+type\b",
    ),
    (
        "javascript",
        r"\bfunction\s+\w*\s*\(|=>\s*\{|\bconst\s+\w+\s*=|\brequire\(|\bexport\s+(default|const)\b",
    ),
    (
        "java",
        r"\bpublic\s+(static\s+)?(void|class)\b|\bSystem\.out\.println",
    ),
    ("sql", r"(?i)\bselect\b[\s\S]*\bfrom\b"),
    ("css", r"[.#]?[\w-]+\s*\{[^}]*:\s*[^;]+;"),
    ("html", r"(?i)<\s*(html|div|span|body)[\s>]"),
];

static SIGNATURES: Lazy<Vec<(&'static str, Regex)>> = Lazy::new(|| {
    RAW_SIGNATURES
        .iter()
        .map(|(lang, pattern)| (*lang, Regex::new(pattern).expect("valid regex")))
        .collect()
});

pub fn detect_language(content: &str) -> Option<String> {
    let sample = content.trim();
    if sample.is_empty() {
        return None;
    }
    SIGNATURES
        .iter()
        .find(|(_, regex)| regex.is_match(sample))
        .map(|(lang, _)| lang.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_yaml() {
        assert_eq!(
            detect_language("apiVersion: v1\nkind: Pod\nmetadata:\n  name: demo"),
            Some("yaml".to_string())
        );
    }

    #[test]
    fn detects_python() {
        assert_eq!(
            detect_language("import os\n\ndef main():\n    print('hi')"),
            Some("python".to_string())
        );
    }

    #[test]
    fn detects_rust() {
        assert_eq!(
            detect_language("fn main() {\n    let mut x = 1;\n}"),
            Some("rust".to_string())
        );
    }

    #[test]
    fn returns_none_for_empty() {
        assert_eq!(detect_language("   "), None);
    }
}
