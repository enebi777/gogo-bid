// Auto-configuration engine — turns a connector's smart profile into a
// ready-to-paste postback URL and a documented field mapping, so a user
// setting up conversion tracking never has to look up which query-param names
// our endpoint expects. Pure (no Prisma/Nest), so it's trivially testable and
// reused by the /connectors/:id/postback-config endpoint.
//
// What we generate: the URL a user pastes into their tracker/network, with our
// expected param names pre-filled and clearly-labelled placeholders (e.g.
// {CLICK_ID}) they replace with their tool's own macro. We deliberately don't
// guess the tracker's macro tokens — that's the part the user knows from their
// own tool; the param names (the part specific to us) are what we remove the
// guesswork on.

import { ConnectorDefinition } from './connector-types';

export type PostbackFieldRole = 'secret' | 'clickId' | 'conversionId' | 'revenue' | 'payout';

export interface PostbackField {
  param: string; // our expected query-param name, e.g. 'cid'
  role: PostbackFieldRole;
  required: boolean;
  placeholder: string; // what the user swaps for their tool's macro, e.g. '{CLICK_ID}'
  description: string;
}

export interface PostbackConfig {
  connectorId: string;
  supported: boolean;
  method: 'GET';
  url: string; // ready-to-paste template
  fields: PostbackField[];
  confidence: 'verified' | 'generic';
  notes: string[];
}

export interface AutoConfigOptions {
  /** Public base URL of the postback receiver, e.g. "https://api.gogobid.com". */
  baseUrl: string;
  /** Placeholder shown where the org's real postback secret goes. */
  secretPlaceholder?: string;
}

const trimBase = (b: string) => b.replace(/\/+$/, '');

/**
 * Build the postback configuration for a connector. Returns { supported:false }
 * for connectors that don't take postbacks or have no profile — the caller
 * turns that into a 400/empty response rather than a misleading URL.
 */
export function buildPostbackConfig(connector: ConnectorDefinition, opts: AutoConfigOptions): PostbackConfig {
  const secret = opts.secretPlaceholder ?? '{POSTBACK_SECRET}';
  const notes: string[] = [];

  if (!connector.capabilities.postbacks || !connector.profile) {
    return {
      connectorId: connector.id,
      supported: false,
      method: 'GET',
      url: '',
      fields: [],
      confidence: 'generic',
      notes: [`${connector.name} does not have a postback profile configured.`],
    };
  }

  const p = connector.profile;
  const confidence = p.confidence ?? 'generic';
  if (confidence === 'generic') {
    notes.push('These field names are a generic scaffold — confirm them against your account before going live.');
  }
  notes.push('Replace each {PLACEHOLDER} with the matching macro from your tracker/network, and {POSTBACK_SECRET} with your GoGo Bid postback secret.');

  const fields: PostbackField[] = [
    { param: 'secret', role: 'secret', required: true, placeholder: secret, description: 'Your GoGo Bid postback secret (validates the call).' },
    { param: p.clickIdParam, role: 'clickId', required: true, placeholder: '{CLICK_ID}', description: 'The click id that identifies the originating click.' },
    { param: p.conversionIdParam, role: 'conversionId', required: true, placeholder: '{CONVERSION_ID}', description: 'A unique id for this conversion/transaction (used to dedupe).' },
  ];
  if (p.revenueParam) fields.push({ param: p.revenueParam, role: 'revenue', required: false, placeholder: '{REVENUE}', description: 'Sale amount / revenue for this conversion.' });
  if (p.payoutParam) fields.push({ param: p.payoutParam, role: 'payout', required: false, placeholder: '{PAYOUT}', description: 'Your payout for this conversion.' });

  const query = fields.map((f) => `${encodeURIComponent(f.param)}=${f.placeholder}`).join('&');
  const url = `${trimBase(opts.baseUrl)}/postback/${connector.id}?${query}`;

  return { connectorId: connector.id, supported: true, method: 'GET', url, fields, confidence, notes };
}
