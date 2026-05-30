import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeInput,
  parseSearchResults,
  parseWebsitePage,
  scoreSearchResult
} from '../src/hotel.js';

test('normalizeInput requires at least one source and trims hotel names', () => {
  assert.throws(() => normalizeInput({}), /at least one/);
  const input = normalizeInput({
    hotelNames: [' The Hoxton Amsterdam ', ''],
    maxResults: 5
  });
  assert.deepEqual(input.hotelNames, ['The Hoxton Amsterdam']);
  assert.equal(input.maxResults, 5);
});

test('parseSearchResults unwraps DuckDuckGo result URLs', () => {
  const html = `
    <div class="result">
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexamplehotel.com%2F">Example Hotel Official Site</a>
      <a class="result__snippet">Boutique hotel in Amsterdam.</a>
    </div>
  `;
  const rows = parseSearchResults(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://examplehotel.com/');
  assert.equal(rows[0].title, 'Example Hotel Official Site');
});

test('scoreSearchResult rejects obvious travel agency domains', () => {
  const weak = scoreSearchResult({
    title: 'Example Hotel - Booking.com',
    snippet: 'Book now',
    url: 'https://www.booking.com/hotel/nl/example.html'
  }, 'Example Hotel Amsterdam', 'Amsterdam');
  const strong = scoreSearchResult({
    title: 'Example Hotel Amsterdam Official Website',
    snippet: 'Boutique hotel in Amsterdam',
    url: 'https://examplehotelamsterdam.com/'
  }, 'Example Hotel Amsterdam', 'Amsterdam');
  assert.equal(weak, 0);
  assert.ok(strong > 70);
});

test('parseWebsitePage extracts public contact data and socials', () => {
  const html = `
    <html>
      <head>
        <title>Example Hotel Amsterdam</title>
        <script type="application/ld+json">{"@type":"Hotel","address":{"streetAddress":"Herengracht 1","addressLocality":"Amsterdam","addressCountry":"NL"}}</script>
      </head>
      <body>
        <a href="/contact">Contact</a>
        <a href="mailto:hello@examplehotel.com">hello@examplehotel.com</a>
        <p>Call +31 20 123 4567</p>
        <a href="https://www.instagram.com/examplehotel/">Instagram</a>
      </body>
    </html>
  `;
  const page = parseWebsitePage(html, 'https://examplehotel.com/');
  assert.equal(page.title, 'Example Hotel Amsterdam');
  assert.deepEqual(page.emails, ['hello@examplehotel.com']);
  assert.equal(page.phones[0], '+31 20 123 4567');
  assert.equal(page.socials.instagram, 'https://www.instagram.com/examplehotel/');
  assert.equal(page.address, 'Herengracht 1, Amsterdam, NL');
});
