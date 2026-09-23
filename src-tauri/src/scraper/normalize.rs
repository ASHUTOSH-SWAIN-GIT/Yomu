use url::Url;

/// Tracking query parameters stripped before a URL is used as a cache key
/// or shown to the user. Not exhaustive, extend as new trackers show up.
const TRACKING_PARAMS: &[&str] = &[
    "gclid", "fbclid", "mc_cid", "mc_eid", "igshid", "ocid", "ref", "ref_src", "ref_url", "source",
    "spm", "si",
];

/// Normalizes a user supplied URL into a canonical form used as the
/// dedupe / cache key: strips tracking params and the fragment, lowercases
/// the host, and drops a trailing slash from the path.
pub fn canonicalize(raw: &str) -> Result<Url, url::ParseError> {
    let mut url = Url::parse(raw)?;

    url.set_fragment(None);

    let kept_pairs: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(key, _)| {
            let key_lower = key.to_lowercase();
            !(key_lower.starts_with("utm_") || TRACKING_PARAMS.contains(&key_lower.as_str()))
        })
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();

    if kept_pairs.is_empty() {
        url.set_query(None);
    } else {
        let mut serializer = url::form_urlencoded::Serializer::new(String::new());
        for (k, v) in &kept_pairs {
            serializer.append_pair(k, v);
        }
        url.set_query(Some(&serializer.finish()));
    }

    if let Some(host) = url.host_str() {
        let lower = host.to_lowercase();
        let _ = url.set_host(Some(&lower));
    }

    let path = url.path().to_string();
    if path.len() > 1 && path.ends_with('/') {
        url.set_path(path.trim_end_matches('/'));
    }

    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_utm_params() {
        let url = canonicalize("https://Example.com/post/?utm_source=x&utm_medium=y&id=1").unwrap();
        assert_eq!(url.as_str(), "https://example.com/post?id=1");
    }

    #[test]
    fn strips_fragment_and_trailing_slash() {
        let url = canonicalize("https://example.com/docs/intro/#section-2").unwrap();
        assert_eq!(url.as_str(), "https://example.com/docs/intro");
    }

    #[test]
    fn leaves_clean_url_untouched() {
        let url = canonicalize("https://kubernetes.io/docs/concepts/").unwrap();
        assert_eq!(url.as_str(), "https://kubernetes.io/docs/concepts");
    }

    #[test]
    fn rejects_invalid_url() {
        assert!(canonicalize("not a url").is_err());
    }
}
