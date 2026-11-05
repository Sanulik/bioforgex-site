/* BioForgeX'26 — multi-step registration logic */
(function () {
  "use strict";

  var ENDPOINT = "https://script.google.com/macros/s/AKfycbzBRIEadHt5HSfoHEN96-vloDTj5aypZhEd8vdy5vNRT77KXP7NJ2dzotiDuligVjYYkQ/exec";
  var DEADLINE = new Date("2026-11-20T23:59:59+05:30").getTime();
  var MAX_BYTES = 10 * 1024 * 1024;
  var ALLOWED_EXT = ["jpg", "jpeg", "png", "pdf"];
  var ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"];
  var TIMEOUT_MS = 120000;

  var $ = function (id) { return document.getElementById(id); };
  var root = $("regForm");
  if (!root) return;

  var form = $("teamForm");
  var steps = Array.prototype.slice.call(form.querySelectorAll(".step"));
  var pSteps = Array.prototype.slice.call(root.querySelectorAll(".pstep"));
  var fill = root.querySelector(".progress .fill");
  var overlay = $("overlay");
  var overlayMsg = $("overlayMsg");
  var formError = $("formError");
  var successBox = $("success");
  var current = 0;
  var submitting = false;
  var receiptFile = null;

  /* ---------- deadline ---------- */
  function checkDeadline() {
    if (Date.now() > DEADLINE) {
      root.style.display = "none";
      var note = $("closedNote");
      if (note) note.classList.add("show");
      return true;
    }
    return false;
  }
  if (checkDeadline()) return;
  var deadlineTimer = setInterval(function () { if (checkDeadline()) clearInterval(deadlineTimer); }, 1000);

  /* ---------- helpers ---------- */
  function val(name) { return (form.elements[name].value || "").replace(/\s+/g, " ").trim(); }
  function fieldOf(el) { return el.closest(".field"); }

  function setInvalid(el, msg) {
    var f = fieldOf(el);
    if (!f) return;
    f.classList.add("invalid");
    var e = f.querySelector(".err");
    if (e && msg) e.textContent = msg;
  }
  function clearInvalid(el) {
    var f = fieldOf(el);
    if (f) f.classList.remove("invalid");
  }

  function showError(msg) {
    formError.textContent = msg;
    formError.classList.add("show");
  }
  function hideError() { formError.classList.remove("show"); }

  function suggestedRef() {
    var n = val("leaderName").replace(/[^A-Za-z0-9]+/g, "");
    return "EMBS_" + (n || "<TeamLeaderName>");
  }
  function refreshRef() {
    var ref = suggestedRef();
    $("refExample").textContent = ref;
    var input = form.elements.paymentRef;
    // pre-fill only while the user has not typed their own value
    if (!input.dataset.touched) input.value = ref.indexOf("<") === -1 ? ref : "";
  }

  /* ---------- validation ---------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_RE = /^\+?[0-9][0-9\s\-]{7,16}$/;

  function validateStep(i) {
    var ok = true, firstBad = null;
    var inputs = steps[i].querySelectorAll("input[required],select[required]");

    Array.prototype.forEach.call(inputs, function (el) {
      if (el.type === "file") return;
      var v = el.value.replace(/\s+/g, " ").trim();
      var bad = false, msg = "This field is required.";
      if (!v) { bad = true; }
      else if (el.name === "leaderEmail" && !EMAIL_RE.test(v)) { bad = true; msg = "Enter a valid email address."; }
      else if (el.name === "leaderContact" && !PHONE_RE.test(v)) { bad = true; msg = "Enter a valid contact number."; }
      else if (el.name === "paymentRef" && (v.indexOf("EMBS_") !== 0 || v.length <= 5)) { bad = true; msg = "Must start with EMBS_ followed by the team leader name."; }
      if (bad) { setInvalid(el, msg); ok = false; if (!firstBad) firstBad = el; }
      else clearInvalid(el);
    });

    if (i === 1) {
      // all four students must be distinct people
      var names = [val("leaderName").toLowerCase(), val("m2Name").toLowerCase(), val("m3Name").toLowerCase(), val("m4Name").toLowerCase()];
      ["m2Name", "m3Name", "m4Name"].forEach(function (n, idx) {
        var v = names[idx + 1];
        if (v && names.indexOf(v) !== idx + 1 || (v && names.indexOf(v) === 0)) {
          setInvalid(form.elements[n], "Each team member must be a different person.");
          ok = false;
          if (!firstBad) firstBad = form.elements[n];
        }
      });
    }

    if (i === 2) {
      var fileErr = validateFile(receiptFile);
      var fz = $("receiptField");
      if (fileErr) {
        fz.classList.add("invalid");
        fz.querySelector(".err").textContent = fileErr;
        ok = false;
        if (!firstBad) firstBad = $("receipt");
      } else fz.classList.remove("invalid");
    }

    if (!ok) {
      showError("Please fix the highlighted fields to continue.");
      if (firstBad && firstBad.focus) firstBad.focus();
    } else hideError();
    return ok;
  }

  function validateFile(file) {
    if (!file) return "Please upload your payment receipt.";
    var ext = file.name.split(".").pop().toLowerCase();
    if (ALLOWED_EXT.indexOf(ext) === -1) return "Only JPG, JPEG, PNG or PDF files are accepted.";
    if (file.type && ALLOWED_MIME.indexOf(file.type) === -1) return "Only JPG, JPEG, PNG or PDF files are accepted.";
    if (file.size === 0) return "This file is empty.";
    if (file.size > MAX_BYTES) return "File is too large. Maximum size is 10MB.";
    return "";
  }

  /* ---------- step navigation ---------- */
  function go(n) {
    current = n;
    steps.forEach(function (s, i) { s.classList.toggle("active", i === n); });
    pSteps.forEach(function (p, i) {
      p.classList.toggle("active", i === n);
      p.classList.toggle("done", i < n);
      p.querySelector("i").textContent = i < n ? "✓" : String(i + 1);
    });
    fill.style.width = (n / (steps.length - 1)) * 68 + "%";
    hideError();
    if (n === 2) refreshRef();
    var top = root.getBoundingClientRect().top + window.pageYOffset - 90;
    window.scrollTo({ top: top, behavior: "smooth" });
  }

  form.addEventListener("click", function (e) {
    var t = e.target.closest("[data-next],[data-prev]");
    if (!t || submitting) return;
    if (t.hasAttribute("data-next")) { if (validateStep(current)) go(current + 1); }
    else go(current - 1);
  });

  // Enter key advances instead of submitting early
  form.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      if (submitting) return;
      if (current < steps.length - 1) { if (validateStep(current)) go(current + 1); }
      else form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

  form.addEventListener("input", function (e) {
    clearInvalid(e.target);
    if (e.target.name === "paymentRef") e.target.dataset.touched = "1";
    if (e.target.name === "leaderName") refreshRef();
  });
  form.addEventListener("change", function (e) { clearInvalid(e.target); });

  /* ---------- file handling ---------- */
  var fileInput = $("receipt");
  var drop = $("drop");

  function setFile(file) {
    var err = validateFile(file);
    var fz = $("receiptField");
    if (err) {
      receiptFile = null;
      fileInput.value = "";
      $("fileName").textContent = "Click or drop your receipt here";
      $("fileMeta").textContent = "JPG, JPEG, PNG or PDF · max 10MB";
      fz.classList.add("invalid");
      fz.querySelector(".err").textContent = err;
      return;
    }
    receiptFile = file;
    fz.classList.remove("invalid");
    $("fileName").textContent = file.name;
    $("fileMeta").textContent = (file.size / 1024 / 1024).toFixed(2) + " MB · ready to upload";
  }

  fileInput.addEventListener("change", function () { setFile(fileInput.files[0] || null); });
  ["dragenter", "dragover"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); });
  });
  drop.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setFile(f);
  });

  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result);
        resolve(s.substring(s.indexOf(",") + 1));
      };
      r.onerror = function () { reject(new Error("Could not read the receipt file.")); };
      r.readAsDataURL(file);
    });
  }

  /* ---------- submit ---------- */
  function setBusy(on, msg) {
    submitting = on;
    overlay.classList.toggle("show", on);
    if (msg) overlayMsg.textContent = msg;
    Array.prototype.forEach.call(form.querySelectorAll("button"), function (b) { b.disabled = on; });
  }

  window.addEventListener("beforeunload", function (e) {
    if (submitting) { e.preventDefault(); e.returnValue = ""; }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (submitting) return;                       // duplicate-submission guard
    if (checkDeadline()) return;
    if (form.elements.website && form.elements.website.value) return; // honeypot

    // re-validate every step; jump back to the first one with a problem
    for (var i = 0; i < steps.length; i++) {
      if (!validateStep(i)) { if (i !== current) go(i); validateStep(i); return; }
    }
    hideError();
    setBusy(true, "Preparing your receipt…");

    toBase64(receiptFile).then(function (b64) {
      var payload = {
        university: val("university"),
        teamName: val("teamName"),
        leaderName: val("leaderName"),
        leaderContact: val("leaderContact"),
        leaderEmail: val("leaderEmail"),
        leaderDegree: val("leaderDegree"),
        leaderYear: val("leaderYear"),
        leaderGender: val("leaderGender"),
        ieeeMember: val("ieeeMember"),
        members: [
          { name: val("m2Name"), degree: val("m2Degree"), year: val("m2Year"), gender: val("m2Gender") },
          { name: val("m3Name"), degree: val("m3Degree"), year: val("m3Year"), gender: val("m3Gender") },
          { name: val("m4Name"), degree: val("m4Degree"), year: val("m4Year"), gender: val("m4Gender") }
        ],
        paymentRef: val("paymentRef"),
        receipt: { name: receiptFile.name, type: receiptFile.type, size: receiptFile.size, data: b64 }
      };
      overlayMsg.textContent = "Uploading your registration. Please don’t close this page.";

      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);

      // text/plain keeps this a CORS "simple request" (no preflight), which Apps Script requires
      return fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        redirect: "follow",
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        clearTimeout(timer);
        return res.text();
      }).catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
    }).then(function (text) {
      var data;
      try { data = JSON.parse(text); } catch (x) { throw new Error("The server sent an unexpected response. Please try again or contact the organizers."); }
      if (!data.success) throw new Error(data.error || "Registration failed. Please try again.");
      setBusy(false);
      showSuccess();
    }).catch(function (err) {
      setBusy(false);
      var m = err && err.name === "AbortError"
        ? "The request timed out. Check your connection and try again."
        : (err && err.message === "Failed to fetch" ? "Network error. Check your connection and try again." : (err && err.message) || "Something went wrong. Please try again.");
      showError(m);
    });
  });

  /* ---------- success ---------- */
  function showSuccess() {
    form.style.display = "none";
    root.querySelector(".progress").style.display = "none";
    successBox.classList.add("show");
    $("successTeam").textContent = val("teamName");
    var c = $("confetti");
    var colors = ["#3ddc5a", "#0f8f2e", "#ffffff", "#9db8a4"];
    for (var i = 0; i < 40; i++) {
      var p = document.createElement("i");
      p.style.left = Math.random() * 100 + "%";
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.8 + "s";
      p.style.transform = "rotate(" + Math.random() * 360 + "deg)";
      c.appendChild(p);
    }
    setTimeout(function () { c.innerHTML = ""; }, 4000);
    window.scrollTo({ top: root.getBoundingClientRect().top + window.pageYOffset - 90, behavior: "smooth" });
  }

  go(0);
})();
