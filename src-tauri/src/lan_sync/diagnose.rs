/// Textos de la prueba de conexión, en castellano, para el local.

fn prefix(ip: &str) -> Option<String> {
    let host = ip.trim().split(':').next()?.trim();
    if host.is_empty() {
        return None;
    }
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() != 4 {
        return None;
    }
    if parts
        .iter()
        .any(|p| p.is_empty() || !p.chars().all(|c| c.is_ascii_digit()))
    {
        return None;
    }
    Some(format!("{}.{}.{}", parts[0], parts[1], parts[2]))
}

fn local_prefixes(local_ips: &str) -> Vec<String> {
    local_ips
        .split(|c: char| c == '·' || c == ',' || c.is_whitespace())
        .filter_map(prefix)
        .collect()
}

/// `Some(true)` si alguna IP local comparte los tres primeros números con el host.
pub fn same_subnet(local_ips: &str, host: &str) -> Option<bool> {
    let server = prefix(host)?;
    let locals = local_prefixes(local_ips);
    if locals.is_empty() {
        return None;
    }
    Some(locals.iter().any(|p| p == &server))
}

pub fn explain_failure(local_ips: &str, host: &str, raw: &str) -> String {
    if raw.starts_with("Esta PC está")
        || raw.starts_with("Llegué a la PC")
        || raw.starts_with("No llega")
        || raw.starts_with("La PC ")
        || raw.starts_with("Windows no encuentra")
    {
        return raw.to_string();
    }
    let lower = raw.to_ascii_lowercase();
    let shown = host.split(':').next().unwrap_or(host).trim();
    if lower.contains("401") || lower.contains("psk") || lower.contains("unauthorized") {
        return "Llegué a la PC principal, pero la clave no coincide. Escribila otra vez, igual en las dos.".into();
    }
    if lower.contains("409") || lower.contains("clonada") {
        return "Esta caja tiene la misma identidad que la PC principal (se copió la carpeta de la app). En la caja regenerá el equipo y volvé a conectar.".into();
    }
    if let Some(false) = same_subnet(local_ips, host) {
        return format!(
            "Esta PC está en {local_ips} y la principal en {shown}. No es la misma red del local: los tres primeros números tienen que coincidir (si una es 192.168.1.113, la otra tiene que ser 192.168.1.algo). Conectalas al mismo Wi-Fi, el normal, sin red de invitados ni un segundo módem. La clave no llega a comprobarse."
        );
    }
    if lower.contains("refused") || lower.contains("10061") {
        return format!(
            "La PC {shown} está en la red, pero WalQo no está compartiendo. En la principal apretá «Empezar a compartir»."
        );
    }
    if lower.contains("timed out")
        || lower.contains("timeout")
        || lower.contains("10060")
    {
        return format!(
            "No llega a {shown}. La principal tiene que estar prendida y en «Empezar a compartir». En esa PC aceptá el permiso del firewall de Windows. Si la IP cambió, usá «Buscar en la red»."
        );
    }
    if lower.contains("unreachable") || lower.contains("10051") || lower.contains("10065") {
        return format!(
            "Windows no encuentra un camino hasta {shown}. Las dos PCs tienen que estar en el mismo Wi-Fi y las IPs tienen que empezar igual."
        );
    }
    format!("No se pudo conectar con {shown}. {raw}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn different_shop_ranges() {
        let msg = explain_failure(
            "192.168.0.109",
            "192.168.1.113",
            "error sending request: operation timed out",
        );
        assert!(msg.contains("192.168.0.109"));
        assert!(msg.contains("192.168.1.113"));
        assert!(msg.contains("misma red"));
    }

    #[test]
    fn same_range_timeout_mentions_firewall() {
        let msg = explain_failure("192.168.1.20", "192.168.1.113", "operation timed out");
        assert!(msg.contains("firewall"));
    }

    #[test]
    fn wrong_key() {
        let msg = explain_failure("192.168.1.20", "192.168.1.113", "401 Unauthorized");
        assert!(msg.contains("clave"));
    }

    #[test]
    fn one_of_several_local_ips_matches() {
        assert_eq!(
            same_subnet("192.168.0.109 · 192.168.1.20", "192.168.1.113"),
            Some(true)
        );
    }
}
