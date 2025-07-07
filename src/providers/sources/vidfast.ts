/* eslint-disable no-console */
import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const DOMAIN = 'https://www.vidfast.pro';
const fixID =
  '/79198daa-820c-5b08-ae46-f7391a4cb4dc/APA91XB-tqjXq06x1tMAywlhBwZoXF6FQV1ytGGPiOlCKlVRNnQ5Gm9GfHEO62TBFQbKi9FmQxIsxYuEZDgVwV1nwEzvGANC19MEE7mz_0TKror9KYtgeLtoh4cJiuPV9IJCV-XV7R2A0F0CRzfQKqr--OLVvrDgspSOiGGJEVYHu6BqaLB7xes/4c12dad1e1340c2fa8d5df7a54e1afbdb55f8011/4a5bf14f8b528581e81c89a761a8068bd049c0f86219d9dba62335155f00e04b/sewlujom/';

const headers = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  referer: `${DOMAIN}/`,
  origin: DOMAIN,
};

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  // Construct the URL based on media type
  let url = `${DOMAIN}/movie/${ctx.media.tmdbId}`;

  if (ctx.media.type === 'show') {
    url = `${DOMAIN}/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
  }

  // Fetch the media page to get the ID
  const dataDetail = await ctx.proxiedFetcher(url, {
    headers: {
      ...headers,
      referer: DOMAIN,
    },
  });

  if (!dataDetail) throw new NotFoundError('Failed to fetch detail page');

  // Extract the ID from the HTML
  const htmlDetail = dataDetail.toString();
  const idMatch = htmlDetail.match(/"en\\" *: *\\"([^\\]+)/i);
  const ID = idMatch ? idMatch[1] : '';

  if (!ID) throw new NotFoundError('Failed to extract media ID');

  console.log(ID);

  ctx.progress(25);

  // Decode the ID
  const deIDResponse = await ctx.proxiedFetcher(`https://aquariumtv.app/vf?id=${ID}`);
  const deID = deIDResponse?.toString();

  console.log(deID);

  if (!deID) throw new NotFoundError('Failed to decode media ID');

  ctx.progress(50);

  // Get source list
  const urlSource = `${DOMAIN}${fixID}YDGUTEY/${deID}`;
  const headerSources = {
    ...headers,
  };

  const dataSources = await ctx.proxiedFetcher(urlSource, {
    method: 'POST',
    headers: headerSources,
    body: {},
  });

  console.log(dataSources);

  if (!dataSources || !Array.isArray(dataSources)) throw new NotFoundError('No sources found or invalid format');

  ctx.progress(75);

  // Process all sources to get direct URLs
  const captions: { url: string; label: string }[] = [];
  let streamUrl = '';

  for (const item of dataSources) {
    if (!item || !item.data) continue;

    const urlDirect = `${DOMAIN}${fixID}xo8XtbY-sVen/${item.data}`;

    const headerDirect = {
      referer: url,
      'user-agent': headers['user-agent'],
      'content-type': 'application/x-www-form-urlencoded',
    };

    const dataDirect = await ctx.proxiedFetcher(urlDirect, {
      method: 'POST',
      headers: headerDirect,
      body: {},
    });

    if (!dataDirect || !dataDirect.url) continue;

    // Filter out unwanted sources
    if (
      dataDirect.url.indexOf('.m3u8') === -1 ||
      dataDirect.url.indexOf('feltrixfire11') !== -1 ||
      dataDirect.url.indexOf('fleurixsun') === -1
    ) {
      continue;
    }

    // Process captions if available
    if (dataDirect.tracks && Array.isArray(dataDirect.tracks)) {
      for (const track of dataDirect.tracks) {
        captions.push({
          url: track.file,
          label: track.label,
        });
      }
    }

    // Save the stream URL
    streamUrl = dataDirect.url;
    break; // Use the first valid stream found
  }

  ctx.progress(100);

  if (!streamUrl) {
    throw new NotFoundError('No valid streams found');
  }

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        captions: captions.map((cap) => ({
          id: `vidfast-${cap.label}`,
          language: cap.label,
          url: cap.url,
          type: 'vtt',
          hasCorsRestrictions: false,
        })),
        type: 'hls',
        playlist: streamUrl,
        flags: [flags.CORS_ALLOWED],
      },
    ],
  };
}

export const vidfastScraper = makeSourcerer({
  id: 'vidfast',
  name: 'VidFast',
  rank: 145,
  // disabled: true,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
