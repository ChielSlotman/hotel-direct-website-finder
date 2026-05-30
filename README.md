# Hotel Direct Website Finder

Extract official hotel websites, contact pages, public emails, public phone numbers, social links, and confidence scores from hotel names, hotel listing URLs, or known hotel websites.

Best for hotel marketers, travel agencies, B2B lead generators, tourism researchers, and automation teams that need clean public hotel contact data without manual copying.

## What this Actor does

Hotel Direct Website Finder helps turn public hotel names and listing URLs into structured hotel website and contact records. It searches public web results, filters out common travel agency pages, scans likely official hotel websites, and returns spreadsheet-ready data.

The Actor is built for public data extraction only. It does not log in, bypass restrictions, guess private emails, or access private hotel systems.

## Why use it

This Actor focuses on accuracy over noisy volume. Every record includes a `confidenceScore`, source fields, and public contact fields when visible, so teams can quickly decide which hotel matches are reliable enough for outreach, enrichment, or review.

## Who it is for

- Hotel marketers building outreach lists
- Travel agencies researching accommodation partners
- B2B lead generation teams
- Hospitality data providers
- Tourism researchers
- Automation builders using Apify, Make, Zapier, n8n, Google Sheets, or custom APIs

## Use cases

- Find official websites for hotel names
- Enrich hotel databases with public contact pages
- Collect public hotel emails and phone numbers where visible
- Find public hotel social profiles
- Research hotels from travel platform exports
- Prepare clean CSV, JSON, or Excel files for outreach workflows

## Input

- `hotelNames` - hotel names to research
- `listingUrls` - public hotel listing URLs to inspect
- `websiteUrls` - known hotel websites to scan directly
- `location` - optional city/country to improve matching
- `maxResults` - maximum hotel records to return
- `findContactPage` - scan for a public contact page
- `findEmails` - extract publicly visible emails
- `findPhones` - extract publicly visible phone numbers
- `findSocials` - extract publicly linked social profiles
- `deduplicateResults` - remove duplicate hotel/website records
- `proxyConfiguration` - optional Apify proxy support
- `debugMode` - save extra debugging data for troubleshooting

## Output

Each dataset item can include:

- `hotelName`
- `inputUrl`
- `sourceType`
- `officialWebsite`
- `confidenceScore`
- `contactPage`
- `email`
- `phone`
- `instagram`
- `facebook`
- `linkedin`
- `twitterX`
- `address`
- `city`
- `country`
- `sourceSearchUrl`
- `pagesScanned`
- `scrapedAt`

## Example input

```json
{
  "hotelNames": ["The Hoxton Amsterdam", "Hotel Pulitzer Amsterdam"],
  "location": "Amsterdam, Netherlands",
  "maxResults": 25,
  "findContactPage": true,
  "findEmails": true,
  "findPhones": true,
  "findSocials": true,
  "deduplicateResults": true,
  "proxyConfiguration": {
    "useApifyProxy": true
  }
}
```

## Example output

```json
{
  "hotelName": "The Hoxton Amsterdam",
  "inputUrl": null,
  "sourceType": "hotelName",
  "officialWebsite": "https://thehoxton.com/amsterdam/",
  "confidenceScore": 92,
  "contactPage": "https://thehoxton.com/amsterdam/contact/",
  "email": "hello.amsterdam@thehox.com",
  "phone": "+31 20 888 5555",
  "instagram": "https://www.instagram.com/thehoxtonhotel/",
  "facebook": "https://www.facebook.com/thehoxton",
  "linkedin": "https://www.linkedin.com/company/the-hoxton",
  "twitterX": "https://twitter.com/thehoxtonhotel",
  "address": "Herengracht 255, Amsterdam",
  "city": "Amsterdam",
  "country": "Netherlands",
  "sourceSearchUrl": "https://duckduckgo.com/html/?q=The%20Hoxton%20Amsterdam%20official%20hotel%20website",
  "pagesScanned": 2,
  "scrapedAt": "2026-05-30T12:00:00.000Z"
}
```

## How to run

1. Open the Actor on Apify.
2. Add hotel names, hotel listing URLs, or known hotel website URLs.
3. Choose contact fields to extract.
4. Run the Actor.
5. Open the dataset and export the results.

## Export and integrations

You can export results from Apify as CSV, JSON, JSONL, XML, RSS, or Excel. You can also connect the dataset to Make, Zapier, n8n, Google Sheets, webhooks, or your own API workflow.

## API usage

Start a run with the Apify API:

```bash
curl "https://api.apify.com/v2/acts/esrok~hotel-direct-website-finder/runs?token=YOUR_APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hotelNames":["The Hoxton Amsterdam"],"location":"Amsterdam, Netherlands","maxResults":10}'
```

Fetch dataset items:

```bash
curl "https://api.apify.com/v2/datasets/DATASET_ID/items?format=json&clean=true&token=YOUR_APIFY_TOKEN"
```

## Responsible use

Use this Actor only for lawful public web research. Do not use it to collect private data, bypass logins, scrape hidden data, or spam hotels. The Actor only extracts publicly visible information from public pages.

## Limitations

- Search results can vary by region, language, and availability.
- Some hotel websites hide emails behind forms or scripts.
- The Actor does not guess private email addresses.
- A confidence score is a quality signal, not a legal or commercial guarantee.
- Websites that block automated traffic may require proxy settings or may not return results.

## FAQ

### Does this scrape private hotel data?

No. It only collects publicly visible website and contact information.

### Can it find emails for every hotel?

No. It only returns emails that are publicly visible on the scanned website or contact page.

### Does it work with travel platform listing URLs?

Yes. It can inspect public listing pages and look for likely official hotel website links, but support depends on what the listing page exposes publicly.

### Why is there a confidence score?

Hotel names can be ambiguous. The confidence score helps you prioritize strong official website matches and review weak ones.
