"""Browser latency: click -> graph usable -> layout refined, plus main-thread long tasks.

Needs: pip install playwright && playwright install chromium
Run the production build (the dev server is much slower and not representative):
    npm run build --prefix frontend
    npm run preview --prefix frontend      # serves :4173 and proxies /api to :4000
    npm run start --prefix backend         # in another terminal
    python3 benchmarks/ui_latency.py vuejs/core [http://localhost:4173]
Run it twice: the first run includes the server's cold analysis, the second hits its cache.
"""
from playwright.sync_api import sync_playwright
import json, sys
repo = sys.argv[1]
base = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:4173'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width':1400,'height':1000})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.add_init_script("""window.__long=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__long.push(Math.round(e.duration)))).observe({entryTypes:['longtask']});""")
    pg.goto(base + '/'); pg.fill('input', repo)
    t0 = pg.evaluate('performance.now()')
    pg.keyboard.press('Enter')
    pg.wait_for_selector('.graph-view__canvas', timeout=120000)
    t_canvas = pg.evaluate('performance.now()') - t0
    pg.wait_for_selector('.graph-view__overlay', state='detached', timeout=120000)
    t_ready = pg.evaluate('performance.now()') - t0
    chip = pg.query_selector('.graph-view__chip') is not None
    long_before = pg.evaluate('window.__long')
    try: pg.wait_for_selector('.graph-view__chip', state='detached', timeout=60000)
    except Exception: pass
    t_final = pg.evaluate('performance.now()') - t0
    pg.wait_for_timeout(900)
    pg.screenshot(path='ui_latency_%s.png' % repo.replace('/', '_'))
    print(json.dumps({'repo':repo,'canvas_ms':round(t_canvas),'interactive_ms':round(t_ready),'refining_chip_seen':chip,'refined_ms':round(t_final),'longtasks_at_interactive':sorted(long_before,reverse=True)[:5],'longtasks_total':sorted(pg.evaluate('window.__long'),reverse=True)[:5],'errors':errs[:3]}))
    b.close()
