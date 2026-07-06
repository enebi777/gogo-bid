// Website / landing-page tracking snippet generator — the copy-paste code a
// user drops into their WordPress / funnel / landing pages. Pure (no
// Prisma/Nest), so it's fully unit-testable.
//
// Design: the snippet is CLIENT-side capture only (click id + UTMs → a
// first-party cookie, with attribution validation). It never carries the
// postback secret. Conversions + revenue are reported via the existing,
// already-tested S2S postback pipeline (/postback/:tracker) — the snippet
// exposes window.GoGoBid.conversionUrl({orderId, revenue}) which fills in the
// captured click id, leaving {POSTBACK_SECRET} for the user's server/thank-you
// page to substitute. This reuses the whole postback → Conversion path with no
// new ingest endpoint and no schema change.

export interface TrackingSnippetOptions {
  /** Extra click-id URL params to look for, on top of the common set. */
  extraClickParams?: string[];
}

export interface TrackingSnippet {
  campaignId: string;
  clickIdParams: string[];
  capabilities: string[];
  /** The <script> to paste in the page <head>. */
  js: string;
}

// Common click-id params across traffic sources (token mapping): tracker cids,
// plus the platform click ids (Google gclid, Meta fbclid, TikTok ttclid).
const BASE_CLICK_PARAMS = ['cid', 'clickid', 'click_id', 'subid', 'gclid', 'fbclid', 'ttclid'];

const CAPABILITIES = [
  'Click Tracking',
  'Conversion Tracking',
  'Revenue Tracking',
  'Attribution Validation',
  'Token Mapping',
  'S2S Postbacks',
];

/**
 * @param campaignId              our campaign id (used to resolve/attribute server-side)
 * @param conversionUrlTemplate   the S2S postback URL with {CLICK_ID}/{CONVERSION_ID}/{REVENUE}
 *                                and {POSTBACK_SECRET} placeholders (from buildPostbackConfig)
 */
export function buildTrackingSnippet(
  campaignId: string,
  conversionUrlTemplate: string,
  opts: TrackingSnippetOptions = {},
): TrackingSnippet {
  const clickIdParams = [...new Set([...BASE_CLICK_PARAMS, ...(opts.extraClickParams ?? [])])];
  // The conversion URL also carries campaign_id so the postback processor can
  // resolve the campaign even when no prior Click row exists (first-party web).
  const convTemplate = `${conversionUrlTemplate}&campaign_id=${campaignId}`;

  const js = `<!-- GoGo Bid tracking — paste in the <head> of your landing & thank-you pages -->
<script>
(function (w, d) {
  var CLICK_PARAMS = ${JSON.stringify(clickIdParams)};
  var COOKIE = "ggclid", DAYS = 90;
  function param(n) { var m = new RegExp("[?&]" + n + "=([^&]+)").exec(w.location.search); return m ? decodeURIComponent(m[1]) : null; }
  function setCookie(n, v) { var e = new Date(Date.now() + DAYS * 864e5).toUTCString(); d.cookie = n + "=" + encodeURIComponent(v) + ";expires=" + e + ";path=/;SameSite=Lax"; }
  function getCookie(n) { var m = d.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : null; }
  // Click Tracking + Token Mapping: capture the first click id present in the URL.
  var clickId = null;
  for (var i = 0; i < CLICK_PARAMS.length; i++) { var v = param(CLICK_PARAMS[i]); if (v) { clickId = v; break; } }
  if (clickId) setCookie(COOKIE, clickId); else clickId = getCookie(COOKIE);
  // UTM capture.
  ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"].forEach(function (k) { var v = param(k); if (v) setCookie("gg_" + k, v); });
  // Attribution Validation.
  var attributed = !!clickId;
  if (!attributed) { try { console.warn("[GoGoBid] No click id found — conversions from this visit may be unattributed."); } catch (e) {} }
  // Conversion Tracking / Revenue Tracking via S2S postback. Fire conversionUrl()
  // from your SERVER or thank-you page (it leaves {POSTBACK_SECRET} for you to fill
  // server-side — never expose your secret in the browser).
  w.GoGoBid = {
    campaignId: ${JSON.stringify(campaignId)},
    clickId: clickId,
    attributed: attributed,
    getClickId: function () { return clickId || getCookie(COOKIE); },
    conversionUrl: function (o) {
      o = o || {};
      return ${JSON.stringify(convTemplate)}
        .replace("{CLICK_ID}", encodeURIComponent(this.getClickId() || ""))
        .replace("{CONVERSION_ID}", encodeURIComponent(o.orderId || ""))
        .replace("{REVENUE}", encodeURIComponent(o.revenue != null ? o.revenue : ""));
    }
  };
})(window, document);
</script>`;

  return { campaignId, clickIdParams, capabilities: CAPABILITIES, js };
}
