import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CanvasVideoSettings } from './CanvasVideoSettings';

describe('canvas H3 channel settings', () => {
  function render(baseUrl: string, quality = '1080P', contextIrEnabled?: boolean) {
    return renderToStaticMarkup(createElement(CanvasVideoSettings, {
      model: 'MiniMax-H3', baseUrl,
      config: { model: 'MiniMax-H3', quality, aspect: '16:9', count: 1, references: [], duration: 30, refMode: 'text', contextIrEnabled },
      onChange: () => {},
    }));
  }

  it('shows the Metaso four resolution tiers and limits every tier to fifteen seconds', () => {
    const html = render('https://metaso.cn/api');
    for (const tier of ['480P', '768P', '1080P', '2K']) expect(html).toContain(`>${tier}</button>`);
    expect(html).toContain('>15s</button>');
    expect(html).not.toContain('>16s</button>');
    expect(html).not.toContain('>30s</button>');
    expect(html).toContain('15 秒');
  });

  it('caps 2K at 15 seconds and keeps other channels within 15', () => {
    expect(render('https://metaso.cn', '2K')).not.toContain('>16s</button>');
    const official = render('https://api.minimax.cn');
    expect(official).not.toContain('>30s</button>');
    expect(official).not.toContain('>480P</button>');
    expect(official).not.toContain('>1080P</button>');
    expect(official).not.toContain('2 倍计费');
  });

  it('shows the saved false Context IR choice without charging text', () => {
    const enabled = render('https://metaso.cn');
    expect(enabled.match(/<input[^>]+type="checkbox"[^>]*>/)?.[0]).toContain('checked=""');
    const disabled = render('https://metaso.cn', '1080P', false);
    expect(disabled.match(/<input[^>]+type="checkbox"[^>]*>/)?.[0]).not.toContain('checked');
    expect(disabled).toContain('本次不收取该项费用');
    expect(render('https://api.minimax.cn')).not.toContain('type="checkbox"');
  });
});
