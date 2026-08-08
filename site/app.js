(function () {
  "use strict";
  const menu = document.querySelector(".menu-button");
  const nav = document.querySelector(".site-nav");
  if (menu && nav) {
    menu.addEventListener("click", function () {
      const open = menu.getAttribute("aria-expanded") === "true";
      menu.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
    });
    nav.querySelectorAll("a").forEach(function (link) { link.addEventListener("click", function () { menu.setAttribute("aria-expanded", "false"); nav.classList.remove("is-open"); }); });
  }
  document.querySelectorAll(".copy-button").forEach(function (button) {
    button.addEventListener("click", async function () {
      const target = document.getElementById(button.dataset.copyTarget || "");
      if (!target) return;
      const text = target.value || target.textContent || "";
      try { await navigator.clipboard.writeText(text.trim()); } catch (_) {
        const area = document.createElement("textarea"); area.value = text.trim(); document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
      }
      const original = button.textContent; button.textContent = "복사됨"; setTimeout(function () { button.textContent = original; }, 1600);
    });
  });
  document.querySelectorAll("[data-tabs]").forEach(function (tabset) {
    const buttons = tabset.querySelectorAll('[role="tab"]');
    buttons.forEach(function (button) { button.addEventListener("click", function () { buttons.forEach(function (other) { const active = other === button; other.setAttribute("aria-selected", String(active)); const panel = document.getElementById(other.getAttribute("aria-controls")); if (panel) panel.hidden = !active; }); }); });
  });
  const year = document.getElementById("year"); if (year) year.textContent = String(new Date().getFullYear());
}());
