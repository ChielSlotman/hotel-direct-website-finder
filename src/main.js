import { Actor, log } from 'apify';
import {
  findHotels,
  normalizeInput
} from './hotel.js';

await Actor.init();

try {
  const input = normalizeInput(await Actor.getInput() ?? {});
  log.info('Starting public hotel website and contact discovery.', {
    hotelNames: input.hotelNames.length,
    listingUrls: input.listingUrls.length,
    websiteUrls: input.websiteUrls.length,
    maxResults: input.maxResults
  });

  const proxyConfiguration = input.proxyConfiguration
    ? await Actor.createProxyConfiguration(input.proxyConfiguration)
    : null;

  const results = await findHotels(input, {
    proxyConfiguration,
    logger: log,
    status: (message) => Actor.setStatusMessage(message)
  });

  if (results.length) {
    await Actor.pushData(results);
  }

  await Actor.setValue('RUN_SUMMARY', {
    requestedHotelNames: input.hotelNames.length,
    requestedListingUrls: input.listingUrls.length,
    requestedWebsiteUrls: input.websiteUrls.length,
    results: results.length,
    note: results.length
      ? 'Saved public hotel website/contact records.'
      : 'No confident public hotel website matches were found.'
  });

  await Actor.setStatusMessage(`Saved ${results.length} hotel website/contact records.`);
  log.info('Finished hotel website discovery.', { results: results.length });
  await Actor.exit();
} catch (error) {
  log.exception(error, 'Actor failed.');
  await Actor.setStatusMessage(`Run failed: ${error.message}`);
  await Actor.fail(error.message);
}
