import * as cheerio from 'cheerio';
import { gotScraping } from 'got-scraping';

const DEFAULT_INPUT = {
  hotelNames: [],
  listingUrls: [],
  websiteUrls: [],
  location: '',
  maxResults: 50,
  findContactPage: true,
  findEmails: true,
  findPhones: true,
  findSocials: true,
  deduplicateResults: true,
  debugMode: false,
  maxRetries: 2,
  requestTimeoutSecs: 30
};

const EXCLUDED_DOMAINS = [
  'booking.com',
  'expedia.',
  'hotels.com',
  'tripadvisor.',
  'trivago.',
  'agoda.',
  'kayak.',
  'priceline.',
  'travelocity.',
  'orbitz.',
  'google.',
  'bing.',
  'duckduckgo.',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'yelp.',
  'wikipedia.org'
];

const SOCIAL_PATTERNS = {
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^"'\s?#<)]+/i,
  facebook: /https?:\/\/(?:www\.)?facebook\.com\/[^"'\s?#<)]+/i,
  linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"'\s?#<)]+/i,
  twitterX: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^"'\s?#<)]+/i
};

export function normalizeInput(rawInput = {}) {
  const input = { ...DEFAULT_INPUT, ...rawInput };
  input.hotelNames = normalizeStringArray(input.hotelNames);
  input.listingUrls = normalizeUrlArray(input.listingUrls);
  input.websiteUrls = normalizeUrlArray(input.websiteUrls);
  input.location = String(input.location ?? '').trim();
  input.maxResults = toBoundedInteger(input.maxResults, 1, 500, DEFAULT_INPUT.maxResults, 'maxResults');

  if (!input.hotelNames.length && !input.listingUrls.length && !input.websiteUrls.length) {
    throw new Error('Provide at least one hotel name, listing URL, or website URL.');
  }

  return input;
}

export async function findHotels(input, options = {}) {
  const scrapedAt = new Date().toISOString();
  const all = [];

  for (const websiteUrl of input.websiteUrls) {
    if (all.length >= input.maxResults) break;
    await options.status?.(`Scanning known hotel website: ${websiteUrl}`);
    const result = await safeBuildFromWebsite(websiteUrl, {
      hotelName: null,
      inputUrl: websiteUrl,
      sourceType: 'websiteUrl',
      input,
      scrapedAt,
      options
    });
    if (result) all.push(result);
  }

  for (const listingUrl of input.listingUrls) {
    if (all.length >= input.maxResults) break;
    await options.status?.(`Resolving hotel listing URL: ${listingUrl}`);
    const candidates = await candidatesFromListingUrl(listingUrl, input, options);
    for (const candidate of candidates) {
      if (all.length >= input.maxResults) break;
      const result = await safeBuildFromWebsite(candidate.url, {
        hotelName: candidate.hotelName,
        inputUrl: listingUrl,
        sourceType: 'listingUrl',
        sourceSearchUrl: listingUrl,
        confidenceBoost: candidate.confidenceBoost,
        input,
        scrapedAt,
        options
      });
      if (result) all.push(result);
    }
  }

  for (const hotelName of input.hotelNames) {
    if (all.length >= input.maxResults) break;
    await options.status?.(`Searching public web for: ${hotelName}`);
    const search = await searchOfficialWebsite(hotelName, input, options);
    for (const candidate of search.candidates) {
      if (all.length >= input.maxResults) break;
      const result = await safeBuildFromWebsite(candidate.url, {
        hotelName,
        inputUrl: null,
        sourceType: 'hotelName',
        sourceSearchUrl: search.searchUrl,
        confidenceBoost: candidate.confidenceScore,
        input,
        scrapedAt,
        options
      });
      if (result) all.push(result);
      if (result?.confidenceScore >= 75) break;
    }
  }

  const rows = input.deduplicateResults ? deduplicateResults(all) : all;
  return rows.slice(0, input.maxResults);
}

export async function searchOfficialWebsite(hotelName, input, options = {}) {
  const query = [hotelName, input.location, 'official hotel website'].filter(Boolean).join(' ');
  const searchUrls = [
    `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`,
    `https://www.bing.com/search?cc=us&setlang=en-US&q=${encodeURIComponent(query)}`
  ];
  let lastError;
  for (const searchUrl of searchUrls) {
    try {
      const response = await requestText(searchUrl, options);
      const results = parseSearchResults(response.body, searchUrl);
      const candidates = results
        .map((result) => ({
          ...result,
          confidenceScore: scoreSearchResult(result, hotelName, input.location)
        }))
        .filter((result) => result.confidenceScore >= 35)
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
        .slice(0, 5);
      if (candidates.length) return { searchUrl, candidates };
    } catch (error) {
      lastError = error;
    }
  }
  options.logger?.warning?.('Public hotel search did not return candidates.', { hotelName, error: lastError?.message });
  return { searchUrl: searchUrls[0], candidates: [] };
}

export function parseSearchResults(html, searchUrl = null) {
  const $ = cheerio.load(html);
  const rows = [];
  $('li.b_algo').each((_, element) => {
    const link = $(element).find('h2 a[href]').first();
    const url = unwrapSearchUrl(link.attr('href'));
    if (!url || !isHttpUrl(url)) return;
    rows.push({
      title: cleanText(link.text()),
      url,
      snippet: cleanText($(element).find('.b_caption p, p').first().text()),
      searchUrl
    });
  });
  $('.result, .web-result').each((_, element) => {
    const link = $(element).find('a.result__a, a.result__url, a[href]').first();
    const rawHref = link.attr('href');
    const url = unwrapSearchUrl(unwrapDuckDuckGoUrl(rawHref));
    if (!url || !isHttpUrl(url)) return;
    const title = cleanText(link.text()) || cleanText($(element).find('.result__title').text());
    const snippet = cleanText($(element).find('.result__snippet').text());
    rows.push({ title, url, snippet, searchUrl });
  });
  $('a[href^="http"]').each((_, element) => {
    const url = unwrapSearchUrl($(element).attr('href'));
    if (!url || !isHttpUrl(url)) return;
    const title = cleanText($(element).text());
    const snippet = cleanText($(element).closest('article, section, div').text()).slice(0, 500);
    if (!title && !snippet) return;
    rows.push({ title, url, snippet, searchUrl });
  });
  return deduplicateBy(rows, (row) => normalizeUrlForKey(row.url));
}

export async function candidatesFromListingUrl(listingUrl, input, options = {}) {
  try {
    const response = await requestText(listingUrl, options);
    const $ = cheerio.load(response.body);
    const hotelName = cleanText($('h1').first().text())
      || cleanText($('title').first().text()).split('|')[0].split('-')[0].trim()
      || null;
    const candidates = [];
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      const text = cleanText($(element).text());
      const absolute = toAbsoluteUrl(href, listingUrl);
      if (!absolute || !isHttpUrl(absolute) || isExcludedDomain(absolute)) return;
      const confidenceBoost = /official|website|hotel|home|contact/i.test(text) ? 65 : 45;
      candidates.push({ url: absolute, hotelName, confidenceBoost });
    });
    return deduplicateBy(candidates, (candidate) => getHostname(candidate.url)).slice(0, 5);
  } catch (error) {
    options.logger?.warning?.('Could not inspect listing URL.', { listingUrl, error: error.message });
    return [];
  }
}

export async function scanHotelWebsite(websiteUrl, input, options = {}) {
  const pages = [];
  const home = await requestText(websiteUrl, options);
  pages.push({ url: home.url, html: home.body });

  const homeInfo = parseWebsitePage(home.body, home.url);
  let contactPage = null;
  if (input.findContactPage) {
    contactPage = pickContactPage(homeInfo.links, home.url);
    if (contactPage && normalizeUrlForKey(contactPage) !== normalizeUrlForKey(home.url)) {
      try {
        const contact = await requestText(contactPage, options);
        pages.push({ url: contact.url, html: contact.body });
      } catch (error) {
        options.logger?.debug?.('Contact page request failed.', { contactPage, error: error.message });
      }
    }
  }

  const merged = mergePageInfo(pages.map((page) => parseWebsitePage(page.html, page.url)), input);
  return {
    ...merged,
    title: homeInfo.title,
    finalUrl: home.url,
    contactPage: contactPage ?? merged.contactPage,
    pagesScanned: pages.length
  };
}

export function parseWebsitePage(html, pageUrl) {
  const $ = cheerio.load(html);
  const text = cleanText($('body').text());
  const links = [];
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    const absolute = toAbsoluteUrl(href, pageUrl);
    if (!absolute) return;
    links.push({
      url: absolute,
      text: cleanText($(element).text())
    });
  });

  const jsonLd = parseJsonLd($);
  const address = extractAddress(jsonLd, text);
  return {
    url: pageUrl,
    title: cleanText($('meta[property="og:title"]').attr('content')) || cleanText($('title').first().text()),
    emails: extractEmails(html),
    phones: extractPhones(text),
    socials: extractSocials(html),
    address,
    links
  };
}

function mergePageInfo(infos, input) {
  const emails = input.findEmails ? dedupeFlat(infos.flatMap((info) => info.emails)) : [];
  const phones = input.findPhones ? dedupeFlat(infos.flatMap((info) => info.phones)) : [];
  const socials = input.findSocials ? mergeSocials(infos.map((info) => info.socials)) : {};
  const contactPage = infos.map((info) => info.url).find((url) => /contact|kontakt|contact-us|get-in-touch/i.test(url)) ?? null;
  const address = infos.map((info) => info.address).find(Boolean) ?? null;
  return {
    email: pickBestEmail(emails, input.location),
    phone: pickBestPhone(phones),
    ...socials,
    contactPage,
    address
  };
}

async function safeBuildFromWebsite(websiteUrl, context) {
  const { hotelName, inputUrl, sourceType, sourceSearchUrl = null, confidenceBoost = null, input, scrapedAt, options } = context;
  try {
    const scan = await scanHotelWebsite(websiteUrl, input, options);
    const name = hotelName || deriveHotelName(scan.title, scan.finalUrl);
    const score = confidenceBoost == null
      ? scoreWebsite(scan.finalUrl, scan.title, name, input.location)
      : Math.min(99, Math.max(confidenceBoost, scoreWebsite(scan.finalUrl, scan.title, name, input.location)));
    const location = parseLocation(input.location);
    return {
      hotelName: name,
      inputUrl,
      sourceType,
      officialWebsite: normalizeHomepage(scan.finalUrl),
      confidenceScore: score,
      contactPage: scan.contactPage,
      email: scan.email,
      phone: scan.phone,
      instagram: scan.instagram ?? null,
      facebook: scan.facebook ?? null,
      linkedin: scan.linkedin ?? null,
      twitterX: scan.twitterX ?? null,
      address: scan.address,
      city: location.city,
      country: location.country,
      sourceSearchUrl,
      pagesScanned: scan.pagesScanned,
      scrapedAt
    };
  } catch (error) {
    options.logger?.warning?.('Could not scan candidate hotel website.', { websiteUrl, error: error.message });
    return null;
  }
}

export function scoreSearchResult(result, hotelName, location = '') {
  if (isExcludedDomain(result.url)) return 0;
  const haystack = `${result.title} ${result.snippet} ${getHostname(result.url)}`.toLowerCase();
  const nameTokens = importantTokens(hotelName);
  const matched = nameTokens.filter((token) => haystack.includes(token)).length;
  let score = Math.min(80, Math.round((matched / Math.max(nameTokens.length, 1)) * 70));
  if (/official|hotel|resort|inn|suites|rooms/i.test(haystack)) score += 12;
  if (/booking|tripadvisor|expedia|agoda|trivago/i.test(haystack)) score -= 35;
  const locationTokens = importantTokens(location);
  if (locationTokens.some((token) => haystack.includes(token))) score += 8;
  return Math.max(0, Math.min(99, score));
}

function scoreWebsite(url, title, hotelName, location = '') {
  let score = isExcludedDomain(url) ? 10 : 55;
  const haystack = `${title} ${getHostname(url)}`.toLowerCase();
  const tokens = importantTokens(hotelName);
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  score += Math.round((matched / Math.max(tokens.length, 1)) * 35);
  if (/hotel|resort|inn|suites|hospitality/i.test(haystack)) score += 7;
  if (importantTokens(location).some((token) => haystack.includes(token))) score += 3;
  return Math.max(0, Math.min(99, score));
}

export async function requestText(url, options = {}) {
  const {
    proxyConfiguration = null,
    maxRetries = DEFAULT_INPUT.maxRetries,
    requestTimeoutSecs = DEFAULT_INPUT.requestTimeoutSecs,
    logger = console
  } = options;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
      const response = await gotScraping({
        url,
        proxyUrl,
        responseType: 'text',
        throwHttpErrors: false,
        timeout: { request: requestTimeoutSecs * 1000 },
        retry: { limit: 0 },
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9'
        }
      });
      if (response.statusCode >= 200 && response.statusCode < 400) {
        return { body: response.body, url: response.url, statusCode: response.statusCode, headers: response.headers };
      }
      lastError = new Error(`HTTP ${response.statusCode} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < maxRetries) {
      logger.debug?.(`Request failed, retrying: ${lastError.message}`);
      await sleep(600 * (attempt + 1));
    }
  }
  throw lastError;
}

function pickContactPage(links, baseUrl) {
  const sameHost = getHostname(baseUrl);
  const scored = links
    .filter((link) => getHostname(link.url) === sameHost)
    .map((link) => ({
      ...link,
      score: /contact|contact-us|get in touch|get-in-touch|kontakt/i.test(`${link.text} ${link.url}`) ? 10 : 0
    }))
    .filter((link) => link.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.url ?? null;
}

function parseJsonLd($) {
  const rows = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text();
    try {
      const parsed = JSON.parse(raw);
      rows.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      // Ignore invalid public markup.
    }
  });
  return rows.flatMap((row) => row?.['@graph'] ?? row);
}

function extractAddress(jsonLd, text) {
  for (const row of jsonLd) {
    const address = row?.address;
    if (typeof address === 'string') return cleanText(address);
    if (address && typeof address === 'object') {
      return cleanText([
        address.streetAddress,
        address.addressLocality,
        address.addressRegion,
        address.postalCode,
        address.addressCountry
      ].filter(Boolean).join(', '));
    }
  }
  return null;
}

function extractEmails(html) {
  const matches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return dedupeFlat(matches)
    .map((email) => email.toLowerCase())
    .filter((email) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(email));
}

function extractPhones(text) {
  const matches = text.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{2,4}/g) ?? [];
  return dedupeFlat(matches.map(cleanText)).filter(isLikelyPhone);
}

function extractSocials(html) {
  const socials = {};
  for (const [field, pattern] of Object.entries(SOCIAL_PATTERNS)) {
    const match = html.match(pattern);
    socials[field] = match ? trimUrl(match[0]) : null;
  }
  return socials;
}

function mergeSocials(rows) {
  const socials = {};
  for (const field of Object.keys(SOCIAL_PATTERNS)) {
    socials[field] = rows.map((row) => row[field]).find(Boolean) ?? null;
  }
  return socials;
}

function pickBestEmail(emails, location = '') {
  const city = parseLocation(location).city?.toLowerCase();
  const otherCityHints = ['rome', 'paris', 'london', 'chicago', 'berlin', 'brussels', 'vienna', 'madrid', 'barcelona'];
  const scored = emails.map((email) => {
    const local = email.split('@')[0] ?? '';
    let score = 0;
    if (city && email.includes(city)) score += 30;
    if (/^(info|hello|contact|reservations?|sales|booking|reception)/i.test(local)) score += 12;
    if (/(events|groups|press)/i.test(local)) score -= 8;
    if (otherCityHints.some((hint) => hint !== city && email.includes(hint))) score -= 35;
    return { email, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 0 ? scored[0].email : null;
}

function pickBestPhone(phones) {
  return phones.find(isLikelyPhone) ?? null;
}

function isLikelyPhone(value) {
  const phone = cleanText(value);
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  if (!phone.includes('+') && /^(?:\d{2}\s+){4,}\d{2}$/.test(phone)) return false;
  if (/^(?:10|11|12|13|14|15){3,}/.test(phone.replace(/\s/g, ''))) return false;
  return /^\+|tel:|\(\d{2,4}\)|\d{2,4}[\s.-]\d{2,4}[\s.-]\d/i.test(phone);
}

function isExcludedDomain(url) {
  const host = getHostname(url);
  return EXCLUDED_DOMAINS.some((domain) => host.includes(domain));
}

function unwrapDuckDuckGoUrl(rawHref) {
  if (!rawHref) return null;
  const absolute = toAbsoluteUrl(rawHref, 'https://duckduckgo.com/');
  try {
    const url = new URL(absolute);
    return url.searchParams.get('uddg') || absolute;
  } catch {
    return rawHref;
  }
}

function unwrapSearchUrl(rawHref) {
  if (!rawHref) return null;
  const absolute = toAbsoluteUrl(rawHref, 'https://www.bing.com/');
  try {
    const url = new URL(absolute);
    const encoded = url.searchParams.get('u');
    if (encoded?.startsWith('a1')) {
      return Buffer.from(encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    }
    return absolute;
  } catch {
    return rawHref;
  }
}

function normalizeHomepage(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname === '/' ? '/' : parsed.pathname}`;
  } catch {
    return url;
  }
}

function deriveHotelName(title, url) {
  const fromTitle = cleanText(String(title ?? '').split('|')[0].split(' - ')[0]);
  if (fromTitle) return fromTitle;
  return getHostname(url).replace(/^www\./, '').split('.')[0].replace(/-/g, ' ');
}

function parseLocation(location) {
  const parts = String(location ?? '').split(',').map((part) => part.trim()).filter(Boolean);
  return {
    city: parts[0] ?? null,
    country: parts.length > 1 ? parts.at(-1) : null
  };
}

function importantTokens(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !['hotel', 'the', 'and', 'official', 'website'].includes(token));
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function normalizeUrlArray(value) {
  return normalizeStringArray(value).filter(isHttpUrl);
}

function toBoundedInteger(value, min, max, fallback, fieldName) {
  const number = Number.parseInt(value ?? fallback, 10);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`Input "${fieldName}" must be an integer between ${min} and ${max}.`);
  }
  return number;
}

function deduplicateResults(rows) {
  return deduplicateBy(rows, (row) => `${row.hotelName ?? ''}|${getHostname(row.officialWebsite ?? '')}`.toLowerCase());
}

function deduplicateBy(rows, keyFactory) {
  const seen = new Set();
  const output = [];
  for (const row of rows) {
    const key = keyFactory(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

function dedupeFlat(values) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function toAbsoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeUrlForKey(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return String(url ?? '').toLowerCase();
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function trimUrl(value) {
  return String(value).split('&quot;')[0].split('"')[0].replace(/[),.;]+$/, '');
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? ''));
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
