import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatXhsLinksToOnePerLine, parseXhsUrlsFromText } from './xhsLinkFormatting.ts';

test('keeps required 小红书 query parameters while de-duplicating by note ID', () => {
  const secured = 'https://www.xiaohongshu.com/explore/6a7bf1b20000000003300fd54?xsec_token=abc123&xsec_source=pc_user';
  const duplicate = 'https://www.xiaohongshu.com/explore/6a7bf1b20000000003300fd54?xsec_token=expired';

  assert.equal(
    formatXhsLinksToOnePerLine(`${secured}\n${duplicate}`),
    secured,
  );
  assert.deepEqual(parseXhsUrlsFromText(secured), [secured]);
});

test('stitches a line-wrapped xsec token back onto its note URL', () => {
  const url = 'https://www.xiaohongshu.com/explore/6a7bf1b20000000003300fd54?xsec_token=abc123';
  assert.equal(
    formatXhsLinksToOnePerLine('https://www.xiaohongshu.com/explore/6a7bf1b20000000003300fd54\nxsec_token=abc123'),
    url,
  );
});
