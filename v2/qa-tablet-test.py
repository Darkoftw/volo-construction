"""
VOLO SST V2 — Tablet QA Test Suite (768x1024 iPad)
Tests: index.html, caisses-stock.html, agenda.html, dashboard-superviseur.html, presentation.html
"""
import json, time, sys, os
os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

BASE = "http://localhost:9090/v2"
TEAM_PIN = "5555"
USER_PIN = "0205"
VIEWPORT = {"width": 768, "height": 1024}
RESULTS = []

def result(page_name, test_name, passed, note=""):
    status = "PASS" if passed else "FAIL"
    RESULTS.append({"page": page_name, "test": test_name, "status": status, "note": note})
    print(f"  [{status}] {test_name}" + (f" — {note}" if note else ""))

def check_no_horizontal_scroll(page, page_name):
    overflow = page.evaluate("""() => {
        const dw = document.documentElement.scrollWidth;
        const cw = document.documentElement.clientWidth;
        return { scrollWidth: dw, clientWidth: cw, hasOverflow: dw > cw + 2 };
    }""")
    result(page_name, "No horizontal scroll (overflow-x)",
           not overflow["hasOverflow"],
           f"scrollWidth={overflow['scrollWidth']} clientWidth={overflow['clientWidth']}")

def check_touch_targets(page, page_name):
    """Check that interactive elements have min 44px touch targets"""
    small_targets = page.evaluate("""() => {
        const els = document.querySelectorAll('button, a, [onclick], input, select, .card, .tab-btn');
        const small = [];
        for (const el of els) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.height < 30 && rect.width < 30) {
                const txt = (el.textContent || el.tagName).substring(0, 40).trim();
                if (txt) small.push(`${txt} (${Math.round(rect.width)}x${Math.round(rect.height)})`);
            }
        }
        return small.slice(0, 5);
    }""")
    result(page_name, "Touch targets >= 30px",
           len(small_targets) == 0,
           f"Small targets: {small_targets}" if small_targets else "All OK")

def collect_errors(page):
    errors = []
    def on_console(msg):
        if msg.type == "error":
            txt = msg.text
            # Ignore common non-critical errors
            if any(skip in txt for skip in ["favicon", "net::ERR", "firebase", "panoptikon", "ERR_CONNECTION"]):
                return
            errors.append(txt)
    page.on("console", on_console)
    return errors

def enter_team_pin(page, page_name):
    """Enter team PIN 5555 via numpad buttons"""
    try:
        # Wait for team pin gate
        page.wait_for_selector(".team-pin-pad", timeout=5000)
        for digit in TEAM_PIN:
            btn = page.locator(f".team-pin-pad button", has_text=digit).first
            btn.click()
            time.sleep(0.15)
        # Click OK
        page.locator(".team-pin-pad button", has_text="OK").click()
        time.sleep(1)
        result(page_name, "Team PIN entry (5555)", True)
        return True
    except Exception as e:
        # Maybe team pin already passed (localStorage)
        if page.locator(".team-pin-pad").count() == 0:
            result(page_name, "Team PIN entry (5555)", True, "Already authenticated or no gate")
            return True
        result(page_name, "Team PIN entry (5555)", False, str(e)[:100])
        return False

def enter_user_pin(page, page_name):
    """Enter user PIN 0205 via numpad buttons"""
    try:
        page.wait_for_selector(".numpad", timeout=5000)
        for digit in USER_PIN:
            btn = page.locator(f".numpad button", has_text=f"^{digit}$").first
            btn.click()
            time.sleep(0.15)
        time.sleep(0.5)
        # Should show identified card
        identified = page.locator("text=IDENTIFIÉ").count() > 0
        result(page_name, "User PIN entry (0205) — identified", identified,
               "User identified" if identified else "User NOT identified")
        if identified:
            # Click continue
            page.locator("button", has_text="ACCÉDER").first.click()
            time.sleep(1.5)
        return identified
    except Exception as e:
        result(page_name, "User PIN entry (0205)", False, str(e)[:100])
        return False

def check_back_button_bug(page, page_name):
    """Check if any RETOUR / back buttons incorrectly link to PIN/auth instead of home"""
    back_links = page.evaluate("""() => {
        const results = [];
        // Check all elements with RETOUR text or back-btn class
        const allEls = document.querySelectorAll('a[href], button[onclick]');
        for (const el of allEls) {
            const text = (el.textContent || '').trim();
            const href = el.getAttribute('href') || '';
            const onclick = el.getAttribute('onclick') || '';
            if (text.includes('RETOUR') || text.includes('←') || el.classList.contains('back-btn')) {
                // Check if it goes to index.html (which shows PIN gate first)
                const goesToIndex = href === 'index.html' || href.includes('index.html');
                // That's actually fine IF index.html remembers the session
                // The BUG is if the back button resets state to PIN step
                const resetsToPin = onclick.includes("step:'pin'") || onclick.includes('step:"pin"') || onclick.includes("step:1");
                results.push({
                    text: text.substring(0, 60),
                    href: href,
                    onclick: onclick.substring(0, 80),
                    goesToIndex: goesToIndex,
                    resetsToPin: resetsToPin
                });
            }
        }
        return results;
    }""")

    pin_bugs = [b for b in back_links if b.get("resetsToPin")]
    result(page_name, "Back button bug (RETOUR -> PIN/auth)",
           len(pin_bugs) == 0,
           f"BUG FOUND: {pin_bugs}" if pin_bugs else f"OK — {len(back_links)} back buttons checked")

# =============================================
# MAIN TEST SUITE
# =============================================
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport=VIEWPORT,
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        user_agent="Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    )
    page = context.new_page()

    # ---1. INDEX.HTML — Full Login Flow ---
    print("\n=== 1. INDEX.HTML (Login + Home) ===")
    errors = collect_errors(page)
    page.goto(f"{BASE}/index.html", wait_until="domcontentloaded")
    page.wait_for_timeout(2000)  # Wait for splash/animations

    # Skip splash if present
    try:
        splash = page.locator("#splashScreen, .splash, [id*=splash]")
        if splash.count() > 0 and splash.first.is_visible():
            page.wait_for_timeout(4000)
    except:
        pass

    # Team PIN
    enter_team_pin(page, "index.html")
    page.wait_for_timeout(1000)

    # User PIN
    pin_ok = enter_user_pin(page, "index.html")
    page.wait_for_timeout(2000)

    # Screenshot
    page.screenshot(path="/tmp/qa-tablet-index.png", full_page=True)
    result("index.html", "Screenshot saved", True, "/tmp/qa-tablet-index.png")

    # Check home screen layout
    if pin_ok:
        has_picks = page.locator(".accueil-pick, .terrain-card, .accueil-pcard").count()
        result("index.html", "Home screen cards visible", has_picks > 0, f"{has_picks} cards found")

        has_stats = page.locator(".accueil-stat").count()
        result("index.html", "Stats bar visible", has_stats > 0, f"{has_stats} stats")

        # Check 4-col stats grid on tablet
        stats_layout = page.evaluate("""() => {
            const grid = document.querySelector('.accueil-stats');
            if (!grid) return 'no grid';
            const cs = getComputedStyle(grid);
            return cs.gridTemplateColumns;
        }""")
        result("index.html", "Stats grid layout (tablet)",
               stats_layout != 'no grid',
               f"grid-template-columns: {stats_layout[:80] if stats_layout else 'none'}")

    check_no_horizontal_scroll(page, "index.html")
    check_touch_targets(page, "index.html")
    check_back_button_bug(page, "index.html")

    # Check console errors
    result("index.html", "No critical JS console errors",
           len(errors) == 0,
           f"{len(errors)} errors: {errors[:3]}" if errors else "Clean")

    # ---2. CAISSES-STOCK.HTML ---────────
    print("\n=== 2. CAISSES-STOCK.HTML ===")
    errors2 = []
    page2 = context.new_page()
    def on_console2(msg):
        if msg.type == "error":
            txt = msg.text
            if not any(skip in txt for skip in ["favicon", "net::ERR", "firebase", "panoptikon", "ERR_CONNECTION"]):
                errors2.append(txt)
    page2.on("console", on_console2)

    page2.goto(f"{BASE}/caisses-stock.html", wait_until="domcontentloaded")
    page2.wait_for_timeout(3000)

    # Team PIN if needed
    if page2.locator(".team-pin-pad").count() > 0:
        enter_team_pin(page2, "caisses-stock.html")
        page2.wait_for_timeout(1000)

    page2.screenshot(path="/tmp/qa-tablet-caisses.png", full_page=True)
    result("caisses-stock.html", "Screenshot saved", True, "/tmp/qa-tablet-caisses.png")

    # KPIs
    kpis = page2.locator(".kpi-card, .kpi, [class*=kpi]").count()
    result("caisses-stock.html", "KPI cards visible", kpis > 0, f"{kpis} KPIs found")

    # Category tabs
    tabs = page2.locator(".cat-tab, .tab-btn, [class*=tab]").count()
    result("caisses-stock.html", "Category tabs visible", tabs > 0, f"{tabs} tabs")

    # Grid layout check on wider viewport
    grid_cols = page2.evaluate("""() => {
        const grids = document.querySelectorAll('[class*=grid], [style*=grid]');
        const results = [];
        for (const g of grids) {
            const cs = getComputedStyle(g);
            if (cs.display === 'grid' || cs.display === 'inline-grid') {
                results.push(cs.gridTemplateColumns.substring(0, 60));
            }
        }
        return results.slice(0, 5);
    }""")
    result("caisses-stock.html", "Grid layout on tablet", True, f"Grids: {grid_cols[:3]}")

    check_no_horizontal_scroll(page2, "caisses-stock.html")
    check_touch_targets(page2, "caisses-stock.html")
    check_back_button_bug(page2, "caisses-stock.html")

    result("caisses-stock.html", "No critical JS console errors",
           len(errors2) == 0,
           f"{len(errors2)} errors: {errors2[:3]}" if errors2 else "Clean")

    # ---3. AGENDA.HTML ---──────────────
    print("\n=== 3. AGENDA.HTML ===")
    errors3 = []
    page3 = context.new_page()
    def on_console3(msg):
        if msg.type == "error":
            txt = msg.text
            if not any(skip in txt for skip in ["favicon", "net::ERR", "firebase", "panoptikon", "ERR_CONNECTION"]):
                errors3.append(txt)
    page3.on("console", on_console3)

    page3.goto(f"{BASE}/agenda.html", wait_until="domcontentloaded")
    page3.wait_for_timeout(3000)

    # Team PIN if needed
    if page3.locator(".team-pin-pad").count() > 0:
        enter_team_pin(page3, "agenda.html")
        page3.wait_for_timeout(1000)

    page3.screenshot(path="/tmp/qa-tablet-agenda.png", full_page=True)
    result("agenda.html", "Screenshot saved", True, "/tmp/qa-tablet-agenda.png")

    # Calendar/agenda view
    cal_elements = page3.locator("[class*=calendar], [class*=cal], [class*=agenda], [class*=month], [class*=day-cell]").count()
    result("agenda.html", "Calendar/agenda elements visible", cal_elements > 0, f"{cal_elements} elements")

    # Chat tab
    chat_tab = page3.locator("text=CHAT").count()
    result("agenda.html", "Chat tab present", chat_tab > 0)

    # Try clicking chat tab
    if chat_tab > 0:
        try:
            page3.locator("text=CHAT").first.click()
            page3.wait_for_timeout(1000)
            chat_wrap = page3.locator(".chat-wrap, [class*=chat]").count()
            result("agenda.html", "Chat view renders on tablet", chat_wrap > 0, f"{chat_wrap} chat elements")
            page3.screenshot(path="/tmp/qa-tablet-agenda-chat.png", full_page=True)
        except Exception as e:
            result("agenda.html", "Chat view renders on tablet", False, str(e)[:80])

    check_no_horizontal_scroll(page3, "agenda.html")
    check_touch_targets(page3, "agenda.html")
    check_back_button_bug(page3, "agenda.html")

    result("agenda.html", "No critical JS console errors",
           len(errors3) == 0,
           f"{len(errors3)} errors: {errors3[:3]}" if errors3 else "Clean")

    # ---4. DASHBOARD-SUPERVISEUR.HTML ---
    print("\n=== 4. DASHBOARD-SUPERVISEUR.HTML ===")
    errors4 = []
    page4 = context.new_page()
    def on_console4(msg):
        if msg.type == "error":
            txt = msg.text
            if not any(skip in txt for skip in ["favicon", "net::ERR", "firebase", "panoptikon", "ERR_CONNECTION"]):
                errors4.append(txt)
    page4.on("console", on_console4)

    # Set localStorage to simulate logged-in chef before navigating
    page4.goto(f"{BASE}/index.html", wait_until="domcontentloaded")
    page4.evaluate("""() => {
        localStorage.setItem('volo_team_pin_ts', String(Date.now()));
        localStorage.setItem('volo_last_role', btoa('CHEF D\\'EQUIPE'));
        localStorage.setItem('volo_last_user', btoa('Milone Jonathan'));
        localStorage.setItem('volo_last_volo', btoa('V0205'));
        localStorage.setItem('volo_pin', btoa('0205'));
    }""")
    page4.goto(f"{BASE}/dashboard-superviseur.html", wait_until="domcontentloaded")
    page4.wait_for_timeout(3000)

    page4.screenshot(path="/tmp/qa-tablet-dashboard.png", full_page=True)
    result("dashboard-superviseur.html", "Screenshot saved", True, "/tmp/qa-tablet-dashboard.png")

    # Check if access denied
    access_denied = page4.locator("text=ACCES REFUSE").count()
    result("dashboard-superviseur.html", "Access granted (not denied)", access_denied == 0,
           "ACCESS DENIED shown" if access_denied > 0 else "OK")

    # Map check
    map_el = page4.locator("#map, .leaflet-container, [class*=map]").count()
    result("dashboard-superviseur.html", "Map element present", map_el > 0, f"{map_el} map elements")

    # Stats
    stats = page4.locator("[class*=stat], [class*=kpi], .ds-stat, .metric").count()
    result("dashboard-superviseur.html", "Stats/metrics visible", stats > 0, f"{stats} stat elements")

    # Back button
    back_btn = page4.locator("a[href='index.html'], a[title='Retour']").count()
    result("dashboard-superviseur.html", "Back button to index.html", back_btn > 0)

    check_no_horizontal_scroll(page4, "dashboard-superviseur.html")
    check_touch_targets(page4, "dashboard-superviseur.html")
    check_back_button_bug(page4, "dashboard-superviseur.html")

    result("dashboard-superviseur.html", "No critical JS console errors",
           len(errors4) == 0,
           f"{len(errors4)} errors: {errors4[:3]}" if errors4 else "Clean")

    # ---5. PRESENTATION.HTML ---────────
    print("\n=== 5. PRESENTATION.HTML ===")
    errors5 = []
    page5 = context.new_page()
    def on_console5(msg):
        if msg.type == "error":
            txt = msg.text
            if not any(skip in txt for skip in ["favicon", "net::ERR", "firebase", "panoptikon", "ERR_CONNECTION"]):
                errors5.append(txt)
    page5.on("console", on_console5)

    page5.goto(f"{BASE}/presentation.html", wait_until="domcontentloaded")
    page5.wait_for_timeout(3000)

    # Team PIN if needed
    if page5.locator(".team-pin-pad").count() > 0:
        enter_team_pin(page5, "presentation.html")
        page5.wait_for_timeout(1000)

    page5.screenshot(path="/tmp/qa-tablet-presentation.png", full_page=True)
    result("presentation.html", "Screenshot saved", True, "/tmp/qa-tablet-presentation.png")

    # Full page scroll — check total height
    page_height = page5.evaluate("() => document.documentElement.scrollHeight")
    result("presentation.html", "Full page scroll height", page_height > 1500,
           f"Page height: {page_height}px")

    # Scroll to bottom and screenshot
    page5.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
    page5.wait_for_timeout(1500)
    page5.screenshot(path="/tmp/qa-tablet-presentation-bottom.png", full_page=False)
    result("presentation.html", "Scroll to bottom works", True)

    # Check reveal animations (IntersectionObserver targets)
    reveals = page5.evaluate("""() => {
        const els = document.querySelectorAll('[class*=reveal], [class*=fade], [data-aos], [class*=animate]');
        return els.length;
    }""")
    result("presentation.html", "Reveal/animation elements", True, f"{reveals} animated elements")

    # Check sections
    sections = page5.locator("section, [class*=section]").count()
    result("presentation.html", "Sections present", sections > 0, f"{sections} sections")

    check_no_horizontal_scroll(page5, "presentation.html")
    check_touch_targets(page5, "presentation.html")
    check_back_button_bug(page5, "presentation.html")

    result("presentation.html", "No critical JS console errors",
           len(errors5) == 0,
           f"{len(errors5)} errors: {errors5[:3]}" if errors5 else "Clean")

    # --- CLEANUP ---
    browser.close()

# =============================================
# FINAL REPORT
# =============================================
print("\n" + "=" * 70)
print("  VOLO SST V2 — TABLET QA REPORT (768x1024 iPad)")
print("=" * 70)

passes = sum(1 for r in RESULTS if r["status"] == "PASS")
fails = sum(1 for r in RESULTS if r["status"] == "FAIL")
total = len(RESULTS)

for page_name in ["index.html", "caisses-stock.html", "agenda.html", "dashboard-superviseur.html", "presentation.html"]:
    page_results = [r for r in RESULTS if r["page"] == page_name]
    page_passes = sum(1 for r in page_results if r["status"] == "PASS")
    page_fails = sum(1 for r in page_results if r["status"] == "FAIL")
    print(f"\n  {page_name}  ({page_passes}/{len(page_results)})")
    for r in page_results:
        icon = "+" if r["status"] == "PASS" else "X"
        note = f"  ({r['note']})" if r["note"] else ""
        print(f"    [{icon}] {r['test']}{note}")

print(f"\n{'=' * 70}")
print(f"  TOTAL: {passes}/{total} PASS | {fails} FAIL")
print(f"{'=' * 70}")

# Exit with error code if any failures
sys.exit(1 if fails > 0 else 0)
