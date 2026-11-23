// Runs before the page is drawn, so the right theme shows from the first frame.
// A saved choice wins; otherwise the device's light/dark setting is used.
(function () {
  var theme = null;
  try { theme = localStorage.getItem("theme"); } catch (error) {}
  if (theme !== "dark" && theme !== "light")
    theme = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
})();
