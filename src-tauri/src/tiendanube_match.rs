//! Compara nombres y variantes de WalQo con los de Tienda Nube.
//! "1.20" y "120" (metros y centímetros) cuentan como la misma medida.

pub fn fold_key(input: &str) -> String {
    let mut out = String::new();
    for ch in input.chars() {
        let lower: String = ch.to_lowercase().collect();
        let mapped: String = lower
            .chars()
            .map(|c| match c {
                'á' | 'à' | 'ä' | 'â' => 'a',
                'é' | 'è' | 'ë' | 'ê' => 'e',
                'í' | 'ì' | 'ï' | 'î' => 'i',
                'ó' | 'ò' | 'ö' | 'ô' => 'o',
                'ú' | 'ù' | 'ü' | 'û' => 'u',
                'ñ' => 'n',
                other => other,
            })
            .collect();
        for c in mapped.chars() {
            if c.is_ascii_alphanumeric() {
                out.push(c);
            } else if c == '.' || c == ',' {
                out.push('.');
            } else if !out.ends_with(' ') && !out.is_empty() {
                out.push(' ');
            }
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn canonical_measure(token: &str) -> Option<String> {
    let n: f64 = token.parse().ok()?;
    if !n.is_finite() || n <= 0.0 {
        return None;
    }
    let meters = if (10.0..=500.0).contains(&n) {
        n / 100.0
    } else {
        n
    };
    if !(0.2..=9.99).contains(&meters) && n >= 10.0 {
        return Some(format!("{n:.2}"));
    }
    Some(format!("{meters:.2}"))
}

/// Firma estable: palabras ordenadas + medidas en metros.
pub fn variant_signature(values: &[String]) -> String {
    let mut words = Vec::new();
    let mut measures = Vec::new();
    for value in values {
        let folded = fold_key(value);
        if folded.is_empty() {
            continue;
        }
        for token in folded.split(' ') {
            if token.is_empty() {
                continue;
            }
            if let Some(measure) = canonical_measure(token) {
                measures.push(measure);
            } else if token.len() > 1 {
                words.push(token.to_string());
            }
        }
    }
    words.sort();
    words.dedup();
    measures.sort();
    measures.dedup();
    if words.is_empty() && measures.is_empty() {
        return String::new();
    }
    format!("{}#{}", words.join("|"), measures.join("|"))
}

pub fn unique_id(ids: &[i64]) -> Option<i64> {
    if ids.len() == 1 {
        Some(ids[0])
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_furniture_variant_in_meters_or_centimeters() {
        let tn = variant_signature(&["ROBLE KENDAL".into(), "1.20".into()]);
        let local = variant_signature(&["ROBLE KENDAL 120".into()]);
        assert_eq!(tn, local);
        assert!(!tn.is_empty());
    }

    #[test]
    fn different_widths_do_not_match() {
        let a = variant_signature(&["NEBRASKA GRIS".into(), "1.20".into()]);
        let b = variant_signature(&["NEBRASKA GRIS".into(), "1.40".into()]);
        assert_ne!(a, b);
    }

    #[test]
    fn product_names_ignore_case_and_spaces() {
        assert_eq!(fold_key("ALACENA TURIN"), fold_key("  Alacena   Turin "));
    }
}
