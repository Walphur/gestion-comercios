(function () {
  var form = document.getElementById("seller-form");
  if (!form) return;
  var API = "https://gestion-comercios-license.walphur.workers.dev";
  var WA = "5492664580915";
  var err = document.getElementById("seller-error");
  var submit = document.getElementById("seller-submit");

  function showError(msg) {
    err.textContent = msg;
    err.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.hidden = true;
    var name = document.getElementById("seller-name").value.trim();
    var phone = document.getElementById("seller-phone").value.replace(/\D/g, "");
    var model = (form.querySelector('input[name="model"]:checked') || {}).value || "pct";
    if (name.length < 3) return showError("Poné tu nombre y apellido.");
    if (phone.length < 8) return showError("Poné tu WhatsApp con característica, sin 0 ni 15.");
    submit.disabled = true;
    submit.textContent = "Generando…";
    fetch(API + "/v1/seller/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name, phone: phone, model: model }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok || !d.code) throw new Error(d.message || "No se pudo generar el código.");
          return d;
        });
      })
      .then(function (d) {
        document.getElementById("seller-done-title").textContent = d.existing
          ? "Ese WhatsApp ya tiene código:"
          : "¡Listo! Tu código es";
        document.getElementById("seller-code").textContent = d.code;
        var how = model === "sixth" ? "cada 5 locales, el 6.º es mío" : "15% de cada local";
        document.getElementById("seller-wa").href =
          "https://wa.me/" + WA + "?text=" +
          encodeURIComponent("Hola! Soy " + name + ", me sumé como vendedor de WalQo. Mi código es " + d.code + " (" + how + "). ¿Me contás cómo arranco?");
        form.hidden = true;
        document.getElementById("seller-done").hidden = false;
        if (window.gtag) window.gtag("event", "seller_signup");
      })
      .catch(function (e2) {
        showError(e2.message || "No se pudo generar el código. Probá de nuevo.");
      })
      .finally(function () {
        submit.disabled = false;
        submit.textContent = "Generar mi código";
      });
  });

  document.getElementById("seller-copy").addEventListener("click", function () {
    var code = document.getElementById("seller-code").textContent;
    var btn = this;
    navigator.clipboard.writeText(code).then(function () {
      btn.textContent = "¡Copiado!";
      setTimeout(function () { btn.textContent = "Copiar código"; }, 1600);
    });
  });
})();
