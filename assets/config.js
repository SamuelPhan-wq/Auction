// ============================================================
//  AUCTION SETTINGS — edit these values, then save & push.
// ============================================================
window.AUCTION_CONFIG = {
  // Title shown at the top of every page
  title: "Art for Wildlife — Silent Auction",
  subtitle: "Paintings on pandan leaves, supporting the Lao Conservation Trust for Wildlife",

  // Paste your Google Apps Script "Web app URL" here (see README.md).
  // While this is empty the site runs in DEMO MODE: bids are only
  // saved in this browser, so you can try everything safely.
  apiUrl: "https://script.google.com/macros/s/AKfycbxeBXguq04MrZ30k3GvcwT7hpuXjKeOlqF-cEO-M73nkTQOWoiIWnayqAPlWgTD2dn2/exec",

  // Currency shown next to every amount
  currencySymbol: "₭",
  currencyCode: "LAK",

  // Default bidding rules (each item can override these in items.js)
  startingBid: 500000,
  minIncrement: 100000,

  // Optional: the public web address of the site, used for QR codes.
  // Leave empty to use the address the admin page is opened from.
  // Example: "https://your-github-name.github.io/lctw-auction/"
  siteUrl: "",

  // How often (seconds) pages refresh the latest bids
  refreshSeconds: 15,
};
